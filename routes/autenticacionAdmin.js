module.exports = function registrarAdministracion(
  app, { pool, bcrypt, crypto, allowedOrigins }
) {
  const COOKIE = 'vetstec_admin';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/admin',
  };
  const hash = (valor) => crypto.createHash('sha256').update(valor).digest('hex');
  const hashFicticio = bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const campos = 'a.id, a.nombre, a.correo, a.rol, a.activo, a.password_hash';
  const fallo = (status, message, retryAfter) =>
    Object.assign(new Error(message), { status, retryAfter });

  function responderError(res, error) {
    if (!error.status) console.error('Error de administración:', error.message);
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    return res.status(error.status || 503).json({
      success: false,
      message: error.status ? error.message : 'No se pudo completar la operación. Intenta nuevamente.',
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    });
  }

  function leerToken(req) {
    const valor = (req.headers.cookie || '').split(';').map((p) => p.trim())
      .find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return /^[a-f0-9]{64}$/.test(valor || '') ? valor : null;
  }

  function datosPublicos(fila) {
    return {
      administrador: { id: fila.id, nombre: fila.nombre, correo: fila.correo, rol: fila.rol },
      sesion: { expiraEn: fila.fecha_expiracion, inactividadMinutos: 15 },
    };
  }

  function protegerCambio(req, res, next) {
    if (!allowedOrigins.includes(req.get('Origin')) ||
        req.get('X-Requested-With') !== 'VetStec-Admin' ||
        !req.is('application/json')) {
      return res.status(403).json({ success: false, message: 'Solicitud no permitida.' });
    }
    next();
  }

  async function limitar(clave, maximo) {
    const resultado = await pool.query(`
      INSERT INTO intentos_acceso_admin (clave_hash, intentos, reinicio)
      VALUES ($1, 1, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
      ON CONFLICT (clave_hash) DO UPDATE SET
        intentos = CASE WHEN intentos_acceso_admin.reinicio <= CURRENT_TIMESTAMP THEN 1
          ELSE LEAST(intentos_acceso_admin.intentos + 1, $2 + 1) END,
        reinicio = CASE WHEN intentos_acceso_admin.reinicio <= CURRENT_TIMESTAMP
          THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
          ELSE intentos_acceso_admin.reinicio END
      RETURNING intentos,
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reinicio - CURRENT_TIMESTAMP))))::int AS espera
    `, [hash(clave), maximo]);
    if (resultado.rows[0].intentos > maximo) {
      throw fallo(429, 'Demasiados intentos. Espera antes de volver a intentar.', resultado.rows[0].espera);
    }
  }

  app.use('/api/admin', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.post('/api/admin/auth/login', protegerCambio, async (req, res) => {
    let client;
    try {
      const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
      const password = req.body?.password;
      if (correo.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
          typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
        throw fallo(400, 'Escribe un correo y una contraseña válidos.');
      }
      await limitar(`ip:${req.ip}`, 30);
      await limitar(`correo:${correo}`, 5);
      client = await pool.connect();
      await client.query('BEGIN');
      const resultado = await client.query(`
        SELECT ${campos} FROM administradores_vetstec a
        WHERE LOWER(a.correo) = $1 LIMIT 1 FOR UPDATE OF a
      `, [correo]);
      const admin = resultado.rows[0];
      const coincide = await bcrypt.compare(password, admin?.password_hash || await hashFicticio);
      if (!admin || !coincide || !admin.activo || admin.rol !== 'ADMIN_VETSTEC') {
        throw fallo(401, 'Correo o contraseña incorrectos, o cuenta sin acceso administrativo.');
      }
      const anterior = leerToken(req);
      if (anterior) {
        await client.query('DELETE FROM sesiones_admin WHERE token_hash = $1', [hash(anterior)]);
      }
      await client.query(`
        DELETE FROM sesiones_admin WHERE fecha_expiracion <= CURRENT_TIMESTAMP
          OR ultimo_uso <= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
      `);
      const token = crypto.randomBytes(32).toString('hex');
      const sesion = await client.query(`
        INSERT INTO sesiones_admin (token_hash, id_admin, fecha_expiracion)
        VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '4 hours')
        RETURNING fecha_expiracion
      `, [hash(token), admin.id]);
      await client.query('UPDATE administradores_vetstec SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1', [admin.id]);
      await client.query(`
        DELETE FROM intentos_acceso_admin WHERE clave_hash = $1 OR reinicio <= CURRENT_TIMESTAMP
      `, [hash(`correo:${correo}`)]);
      await client.query('COMMIT');
      res.cookie(COOKIE, token, { ...cookieOptions, maxAge: 4 * 60 * 60 * 1000 });
      return res.json({ success: true, data: datosPublicos({ ...admin, ...sesion.rows[0] }) });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return responderError(res, error);
    } finally {
      client?.release();
    }
  });

  app.post('/api/admin/auth/logout', protegerCambio, async (req, res) => {
    try {
      const token = leerToken(req);
      if (token) await pool.query('DELETE FROM sesiones_admin WHERE token_hash = $1', [hash(token)]);
      res.clearCookie(COOKIE, cookieOptions);
      return res.json({ success: true, message: 'Sesión administrativa cerrada.' });
    } catch (error) {
      return responderError(res, error);
    }
  });

  async function comprobarAdmin(req, res, next) {
    try {
      const token = leerToken(req);
      if (!token) throw fallo(401, 'Inicia sesión como administrador para continuar.');
      const resultado = await pool.query(`
        UPDATE sesiones_admin s SET ultimo_uso = CURRENT_TIMESTAMP
        FROM administradores_vetstec a
        WHERE s.token_hash = $1 AND s.id_admin = a.id
          AND s.fecha_expiracion > CURRENT_TIMESTAMP
          AND s.ultimo_uso > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
          AND a.activo = TRUE AND a.rol = 'ADMIN_VETSTEC'
        RETURNING ${campos}, s.fecha_expiracion
      `, [hash(token)]);
      if (!resultado.rowCount) throw fallo(401, 'La sesión terminó o la cuenta ya no tiene acceso.');
      req.admin = datosPublicos(resultado.rows[0]);
      next();
    } catch (error) {
      if (error.status === 401) res.clearCookie(COOKIE, cookieOptions);
      return responderError(res, error);
    }
  }

  function requireAdmin(req, res, next) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return protegerCambio(req, res, () => comprobarAdmin(req, res, next));
    }
    return comprobarAdmin(req, res, next);
  }

  // Todas las rutas /api/admin registradas después pasan por esta protección.
  app.use('/api/admin', requireAdmin);
  app.get('/api/admin/auth/sesion', (req, res) => {
    res.json({ success: true, data: req.admin });
  });
  return { requireAdmin };
};