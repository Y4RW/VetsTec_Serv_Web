module.exports = function registrarAutenticacion(
  app,
  { pool, bcrypt, crypto, allowedOrigins }
) {
  const COOKIE = 'vetstec_sesion';
  const OCHO_HORAS = 8 * 60 * 60 * 1000;
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
  };
  const hash = (valor) => crypto.createHash('sha256').update(valor).digest('hex');
  // Iguala el trabajo de bcrypt cuando el correo no existe.
  const hashFicticio = bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

  const campos = `
    u.id AS id_usuario, u.id_negocio, u.correo,
    u.password_hash, u.correo_verificado, u.activo, u.dos_pasos_activo,
    n.nombre_establecimiento, n.tipo_servicio, n.activo_directorio,
    COALESCE(v.estado, 'PENDIENTE') AS estado,
    v.motivo_rechazo
  `;

  function fallo(status, message, code, retryAfter) {
    return Object.assign(new Error(message), { status, code, retryAfter });
  }

  function responderError(res, error) {
    if (!error.status) console.error('Error de acceso:', error.message);
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    return res.status(error.status || 503).json({
      success: false,
      message: error.status
        ? error.message
        : 'No fue posible completar el acceso. Intenta nuevamente.',
      ...(error.status && error.code ? { code: error.code } : {}),
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    });
  }

  function leerToken(req) {
    const valor = (req.headers.cookie || '')
      .split(';')
      .map((parte) => parte.trim())
      .find((parte) => parte.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    return /^[a-f0-9]{64}$/.test(valor || '') ? valor : null;
  }

  function datosPublicos(fila) {
    return {
      usuario: { id: fila.id_usuario, correo: fila.correo },
      negocio: {
        id: fila.id_negocio,
        nombre: fila.nombre_establecimiento,
        tipoServicio: fila.tipo_servicio,
        estado: fila.estado,
        motivoRechazo: fila.motivo_rechazo || '',
        activoDirectorio: fila.activo_directorio === true,
      },
    };
  }

  function protegerCambio(req, res, next) {
    if (
      !allowedOrigins.includes(req.get('Origin')) ||
      req.get('X-Requested-With') !== 'VetStec' ||
      !req.is('application/json')
    ) {
      return res.status(403).json({
        success: false,
        message: 'Solicitud no permitida. Vuelve a intentarlo desde VetStec.',
      });
    }
    next();
  }

  // Contadores atómicos y compartidos por los procesos del servidor.
  async function limitar(clave, maximo) {
    const resultado = await pool.query(`
      INSERT INTO intentos_acceso_negocio (clave_hash, intentos, reinicio)
      VALUES ($1, 1, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
      ON CONFLICT (clave_hash) DO UPDATE SET
        intentos = CASE
          WHEN intentos_acceso_negocio.reinicio <= CURRENT_TIMESTAMP THEN 1
          ELSE LEAST(intentos_acceso_negocio.intentos + 1, $2 + 1)
        END,
        reinicio = CASE
          WHEN intentos_acceso_negocio.reinicio <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
          ELSE intentos_acceso_negocio.reinicio
        END
      RETURNING intentos,
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM
          (reinicio - CURRENT_TIMESTAMP))))::int AS espera
    `, [hash(clave), maximo]);
    if (resultado.rows[0].intentos > maximo) {
      throw fallo(429, 'Demasiados intentos. Espera antes de volver a intentar.',
        'LIMITE_INTENTOS', resultado.rows[0].espera);
    }
  }

  app.use('/api/auth', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.post('/api/auth/login', protegerCambio, async (req, res) => {
    let client;
    try {
      const correo = typeof req.body?.correo === 'string'
        ? req.body.correo.trim().toLowerCase() : '';
      const password = req.body?.password;
      if (
        correo.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
        typeof password !== 'string' || !password ||
        Buffer.byteLength(password, 'utf8') > 72
      ) {
        throw fallo(400, 'Escribe un correo y una contraseña válidos.');
      }

      await limitar(`ip:${req.ip}`, 60);
      await limitar(`correo:${correo}`, 10);

      client = await pool.connect();
      await client.query('BEGIN');
      const resultado = await client.query(`
        SELECT ${campos}
        FROM usuarios_negocio u
        INNER JOIN configuracion_negocio n ON n.id = u.id_negocio
        LEFT JOIN verificacion_negocio v ON v.id_negocio = n.id
        WHERE LOWER(u.correo) = $1
        LIMIT 1
        FOR UPDATE OF u
      `, [correo]);
      const usuario = resultado.rows[0];
      const coincide = await bcrypt.compare(
        password, usuario?.password_hash || await hashFicticio
      );
      if (!usuario || !coincide) {
        throw fallo(401, 'Correo o contraseña incorrectos.', 'CREDENCIALES_INVALIDAS');
      }
      if (!usuario.activo) {
        throw fallo(403, 'Esta cuenta está desactivada. Contacta a soporte.');
      }
      if (!usuario.correo_verificado) {
        throw fallo(403, 'Verifica tu correo antes de iniciar sesión.', 'CORREO_NO_VERIFICADO');
      }
      if (usuario.dos_pasos_activo) {
        throw fallo(403, 'Esta cuenta requiere verificación en dos pasos. Contacta a soporte.');
      }

      const anterior = leerToken(req);
      if (anterior) {
        await client.query('DELETE FROM sesiones_negocio WHERE token_hash = $1', [hash(anterior)]);
      }
      await client.query(`
        DELETE FROM sesiones_negocio
        WHERE fecha_expiracion <= CURRENT_TIMESTAMP
          OR ultimo_uso <= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
      `);
      const token = crypto.randomBytes(32).toString('hex');
      await client.query(`
        INSERT INTO sesiones_negocio (token_hash, id_usuario, fecha_expiracion)
        VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '8 hours')
      `, [hash(token), usuario.id_usuario]);
      await client.query(`
        UPDATE usuarios_negocio SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1
      `, [usuario.id_usuario]);
      await client.query(`
        DELETE FROM intentos_acceso_negocio
        WHERE clave_hash = $1 OR reinicio <= CURRENT_TIMESTAMP
      `, [hash(`correo:${correo}`)]);
      await client.query('COMMIT');

      res.cookie(COOKIE, token, { ...cookieOptions, maxAge: OCHO_HORAS });
      return res.json({ success: true, data: datosPublicos(usuario) });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return responderError(res, error);
    } finally {
      client?.release();
    }
  });

  async function comprobarSesion(req, res, next) {
    try {
      const token = leerToken(req);
      if (!token) throw fallo(401, 'Inicia sesión para continuar.', 'SIN_SESION');
      const resultado = await pool.query(`
        UPDATE sesiones_negocio s SET ultimo_uso = CURRENT_TIMESTAMP
        FROM usuarios_negocio u
        INNER JOIN configuracion_negocio n ON n.id = u.id_negocio
        LEFT JOIN verificacion_negocio v ON v.id_negocio = n.id
        WHERE s.token_hash = $1 AND s.id_usuario = u.id
          AND s.fecha_expiracion > CURRENT_TIMESTAMP
          AND s.ultimo_uso > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
          AND u.activo = TRUE AND u.correo_verificado = TRUE
          AND u.dos_pasos_activo = FALSE
        RETURNING ${campos}
      `, [hash(token)]);
      if (!resultado.rowCount) {
        throw fallo(401, 'La sesión terminó. Inicia sesión nuevamente.', 'SIN_SESION');
      }
      req.auth = datosPublicos(resultado.rows[0]);
      next();
    } catch (error) {
      if (error.status === 401) res.clearCookie(COOKIE, cookieOptions);
      return responderError(res, error);
    }
  }

  function requireSesion(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return protegerCambio(req, res, () => comprobarSesion(req, res, next));
    }
    return comprobarSesion(req, res, next);
  }

  function requireSesionConArchivos(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!['POST', 'PATCH'].includes(req.method) || !allowedOrigins.includes(req.get('Origin')) ||
        req.get('X-Requested-With') !== 'VetStec' || !req.is('multipart/form-data')) {
      return res.status(403).json({ success: false,
        message: 'Solicitud no permitida. Vuelve a intentarlo desde VetStec.' });
    }
    return comprobarSesion(req, res, next);
  }

  function requireNegocioAprobado(req, res, next) {
    if (req.auth?.negocio.estado !== 'APROBADO') {
      return res.status(403).json({
        success: false,
        message: 'Tu establecimiento necesita estar aprobado para realizar esta operación.',
      });
    }
    next();
  }

  app.get('/api/auth/sesion', requireSesion, (req, res) => {
    res.json({ success: true, data: req.auth });
  });

  app.post('/api/auth/logout', protegerCambio, async (req, res) => {
    try {
      const token = leerToken(req);
      if (token) {
        await pool.query('DELETE FROM sesiones_negocio WHERE token_hash = $1', [hash(token)]);
      }
      res.clearCookie(COOKIE, cookieOptions);
      return res.json({ success: true, message: 'Sesión cerrada.' });
    } catch (error) {
      return responderError(res, error);
    }
  });

    return { requireSesion, requireSesionConArchivos, requireNegocioAprobado };
};