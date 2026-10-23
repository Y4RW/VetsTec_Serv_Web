const crypto = require('crypto');
const multer = require('multer');
const { validar } = require('./sucursalesPropietario');

const fallo = (status, message) => Object.assign(new Error(message), { status });
const idValido = valor => /^[1-9]\d*$/.test(valor || '') && Number(valor) <= 2147483647;
const texto = valor => String(valor ?? '').trim();
const coordenada = valor => valor == null || valor === '' ? null : Number(Number(valor).toFixed(6));
const rutaFoto = (id, ruta) => typeof ruta === 'string' &&
  new RegExp(`^negocio-${id}/[a-zA-Z0-9-]+\\.(jpg|png|webp)$`).test(ruta);

// Incluye la decisión administrativa para detectar formularios que quedaron antiguos.
function versionDe(fila) {
  return crypto.createHash('sha256').update(JSON.stringify(fila)).digest('hex');
}

function datosPublicos(fila) {
  const { foto_establecimiento_url, observaciones_revision, ...datos } = fila;
  return { ...datos, tiene_evidencia: rutaFoto(fila.id, foto_establecimiento_url), version: versionDe(fila) };
}

function cambioIdentidad(actual, datos) {
  return texto(actual.nombre_establecimiento) !== datos.nombreEstablecimiento ||
    actual.tipo_servicio !== datos.tipoServicio || texto(actual.direccion) !== datos.direccion ||
    texto(actual.codigo_postal) !== datos.codigoPostal ||
    coordenada(actual.latitud) !== coordenada(datos.latitud) ||
    coordenada(actual.longitud) !== coordenada(datos.longitud);
}

module.exports = function registrarEdicionSucursales(app, {
  pool, requireSesion, requireSesionConArchivos, requirePropietario, supabase, subirArchivoASupabase,
}) {
  const base = '/api/propietario/sucursales/:idSucursal';
  // El ID de la URL selecciona. La red y la cuenta autorizadas vienen de la sesión.
  const detalleSQL = `
    SELECT n.id, n.nombre_establecimiento, n.tipo_servicio, n.telefono_whatsapp,
      n.correo_contacto, n.descripcion, n.direccion, n.codigo_postal, n.latitud, n.longitud,
      n.activo_directorio, v.estado, v.nombre_responsable, v.cedula_profesional,
      v.foto_establecimiento_url, v.motivo_rechazo, v.observaciones_revision,
      v.fecha_solicitud, v.fecha_revision
    FROM public.configuracion_negocio n
    JOIN public.verificacion_negocio v ON v.id_negocio = n.id
    JOIN public.redes_sucursales s ON s.id_negocio = n.id
    WHERE n.id = $1 AND s.id_red = $2 AND EXISTS (
      SELECT 1 FROM public.redes_propietarios p
      JOIN public.usuarios_negocio u ON u.id = p.id_usuario
      JOIN public.redes_sucursales origen ON origen.id_negocio = u.id_negocio AND origen.id_red = p.id_red
      WHERE p.id_red = s.id_red AND p.id_usuario = $3 AND u.id_negocio = $4
        AND p.activo = TRUE AND u.activo = TRUE AND u.correo_verificado = TRUE
        AND u.dos_pasos_activo = FALSE
    )`;

  function responderError(res, e) {
    if (!e.status) console.error('Edición de sucursal:', e.code || 'ERROR', e.message);
    return res.status(e.status || 503).json({ success: false,
      message: e.status ? e.message : 'No pudimos confirmar el guardado. Actualiza los datos antes de reintentar.',
      ...(e.status && e.code ? { code: e.code } : {}) });
  }

  const recibir = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, parts: 13, fieldSize: 12000 },
    fileFilter: (req, file, cb) => cb(['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? null : fallo(400, 'La fotografía debe ser JPG, PNG o WEBP.'), true),
  }).fields([{ name: 'evidencia', maxCount: 1 }]);
  function archivos(req, res, next) {
    recibir(req, res, e => {
      if (!e) return next();
      return res.status(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false,
        message: e.code === 'LIMIT_FILE_SIZE' ? 'La fotografía debe pesar como máximo 5 MB.' :
          e.status ? e.message : 'Revisa los campos y adjunta como máximo una fotografía.' });
    });
  }

  app.get(base, requireSesion, requirePropietario, async (req, res) => {
    try {
      if (!idValido(req.params.idSucursal)) throw fallo(400, 'Sucursal inválida.');
      const resultado = await pool.query(detalleSQL, [Number(req.params.idSucursal),
        req.propietario.id, req.auth.usuario.id, req.auth.negocio.id]);
      if (!resultado.rowCount) throw fallo(404, 'Sucursal no encontrada.');
      return res.json({ success: true, data: datosPublicos(resultado.rows[0]) });
    } catch (e) { return responderError(res, e); }
  });

  app.patch(base, requireSesionConArchivos, requirePropietario, archivos,
    requireSesionConArchivos, async (req, res) => {
      let client;
      let confirmada = false;
      let commitIniciado = false;
      const subidos = [];
      try {
        if (!idValido(req.params.idSucursal)) throw fallo(400, 'Sucursal inválida.');
        const permitidos = ['version', 'nombreEstablecimiento', 'tipoServicio', 'telefonoWhatsapp',
          'correoContacto', 'descripcion', 'direccion', 'codigoPostal', 'latitud', 'longitud',
          'nombreResponsable', 'cedulaProfesional'];
        if (Object.keys(req.body || {}).some(campo => !permitidos.includes(campo)) ||
            typeof req.body?.version !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.version)) {
          throw fallo(400, 'Solicitud inválida. Vuelve a abrir la edición desde el panel.');
        }
        const id = Number(req.params.idSucursal);
        const parametros = [id, req.propietario.id, req.auth.usuario.id, req.auth.negocio.id];
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        // Mismo orden que la revisión administrativa: negocio/revisión antes que propietario.
        const resultado = await client.query(`${detalleSQL} FOR UPDATE OF n, v, s`, parametros);
        const actual = resultado.rows[0];
        if (!actual) throw fallo(404, 'Sucursal no encontrada.');
        const acceso = await client.query(`
          SELECT p.id_red FROM public.redes_propietarios p
          JOIN public.usuarios_negocio u ON u.id = p.id_usuario
          JOIN public.redes_sucursales origen ON origen.id_negocio = u.id_negocio AND origen.id_red = p.id_red
          WHERE p.id_red = $1 AND p.id_usuario = $2 AND u.id_negocio = $3
            AND p.activo = TRUE AND u.activo = TRUE AND u.correo_verificado = TRUE
            AND u.dos_pasos_activo = FALSE FOR UPDATE OF p, u
        `, parametros.slice(1));
        if (!acceso.rowCount) throw fallo(403, 'Tu acceso de propietario ya no está activo.');
        if (actual.estado === 'SUSPENDIDO') throw fallo(403, 'Esta sucursal está suspendida. Contacta a VetStec.');
        if (versionDe(actual) !== req.body.version) {
          throw Object.assign(fallo(409, 'Los datos o la revisión cambiaron mientras editabas. Carga la versión actual antes de guardar.'),
            { code: 'VERSION_ANTIGUA' });
        }

        const preliminares = {
          nombreEstablecimiento: texto(req.body.nombreEstablecimiento), tipoServicio: req.body.tipoServicio,
          direccion: texto(req.body.direccion), codigoPostal: texto(req.body.codigoPostal),
          latitud: req.body.latitud, longitud: req.body.longitud,
        };
        const identidadCambiada = cambioIdentidad(actual, preliminares);
        const conservarFoto = !identidadCambiada && actual.tipo_servicio === 'ESTETICA' &&
          rutaFoto(id, actual.foto_establecimiento_url);
        const d = validar(req.body, req.files, { evidenciaGuardada: conservarFoto });
        d.latitud = coordenada(d.latitud);
        d.longitud = coordenada(d.longitud);
        const archivo = req.files?.evidencia?.[0];
        if (archivo && d.tipoServicio !== 'ESTETICA') throw fallo(400, 'La fotografía de esta edición corresponde a una estética canina.');
        const requisitosCambiados = texto(actual.nombre_responsable) !== d.nombreResponsable ||
          texto(actual.cedula_profesional) !== d.cedulaProfesional || Boolean(archivo);
        const contactoCambiado = texto(actual.telefono_whatsapp) !== d.telefonoWhatsapp ||
          texto(actual.correo_contacto).toLowerCase() !== d.correoContacto || texto(actual.descripcion) !== d.descripcion;
        const hayCambios = identidadCambiada || requisitosCambiados || contactoCambiado;
        const requiereRevision = hayCambios && (identidadCambiada || requisitosCambiados || actual.estado === 'RECHAZADO');

        if (hayCambios) {
          const repetida = await client.query(`
            SELECT n.id FROM public.configuracion_negocio n
            JOIN public.redes_sucursales s ON s.id_negocio = n.id
            WHERE s.id_red = $1 AND n.id <> $2 AND LOWER(n.nombre_establecimiento) = LOWER($3)
              AND n.codigo_postal = $4 AND LOWER(n.direccion) = LOWER($5) LIMIT 1
          `, [req.propietario.id, id, d.nombreEstablecimiento, d.codigoPostal, d.direccion]);
          if (repetida.rowCount) throw fallo(409, 'Ya tienes otra sucursal con ese nombre y dirección.');
          let foto = actual.foto_establecimiento_url;
          if (archivo) {
            const subida = await subirArchivoASupabase(archivo, 'evidencias-negocios', `negocio-${id}`, false);
            subidos.push({ bucket: 'evidencias-negocios', path: subida.path });
            foto = subida.path;
          }
          const escritura = await client.query(`
            UPDATE public.configuracion_negocio SET nombre_establecimiento = $2, tipo_servicio = $3,
              telefono_whatsapp = $4, correo_contacto = $5, descripcion = $6,
              direccion = $7, codigo_postal = $8, latitud = $9, longitud = $10, activo_directorio = $11
            WHERE id = $1 AND EXISTS (SELECT 1 FROM public.redes_sucursales s
              JOIN public.redes_propietarios p ON p.id_red = s.id_red
              WHERE s.id_negocio = $1 AND s.id_red = $12 AND p.id_usuario = $13 AND p.activo = TRUE)
          `, [id, d.nombreEstablecimiento, d.tipoServicio, d.telefonoWhatsapp, d.correoContacto,
            d.descripcion || null, d.direccion, d.codigoPostal, d.latitud, d.longitud,
            !requiereRevision && actual.estado === 'APROBADO' && actual.activo_directorio,
            req.propietario.id, req.auth.usuario.id]);
          if (escritura.rowCount !== 1) throw fallo(404, 'Sucursal no encontrada.');
          if (requiereRevision) {
            // El historial de decisiones anteriores se conserva en historial_revision_negocio.
            await client.query(`
              UPDATE public.verificacion_negocio SET estado = 'PENDIENTE', nombre_responsable = $2,
                cedula_profesional = $3, foto_establecimiento_url = $4, fecha_solicitud = CURRENT_TIMESTAMP,
                motivo_rechazo = NULL, observaciones_revision = NULL, fecha_revision = NULL
              WHERE id_negocio = $1
            `, [id, d.nombreResponsable || null, d.cedulaProfesional || null, foto]);
          }
        }
        const guardada = await client.query(detalleSQL, parametros);
        if (!guardada.rowCount) throw fallo(403, 'Tu acceso a esta sucursal cambió. Actualiza el panel.');
        commitIniciado = true;
        await client.query('COMMIT');
        confirmada = true;
        return res.json({ success: true, data: { ...datosPublicos(guardada.rows[0]),
          requiere_revision: requiereRevision, sin_cambios: !hayCambios } });
      } catch (e) {
        if (client && !confirmada) await client.query('ROLLBACK').catch(() => {});
        if (!confirmada && !commitIniciado) {
          for (const archivo of subidos) {
            try {
              const eliminado = await supabase.storage.from(archivo.bucket).remove([archivo.path]);
              if (eliminado.error) console.error('Limpieza de evidencia pendiente:', archivo.path);
            } catch { console.error('Limpieza de evidencia pendiente:', archivo.path); }
          }
        }
        return responderError(res, e);
      } finally { client?.release(); }
    });
};