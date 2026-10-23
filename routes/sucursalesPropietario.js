const multer = require('multer');

const fallo = (status, message) => Object.assign(new Error(message), { status });
const tipos = ['VETERINARIA', 'ESTETICA', 'AMBAS'];

function validar(body = {}, files = {}, { evidenciaGuardada = false } = {}) {
  const datos = {};
  const campos = [
    ['nombreEstablecimiento', 150, true], ['tipoServicio', 20, true],
    ['telefonoWhatsapp', 10, true], ['correoContacto', 150, true],
    ['direccion', 500, true], ['codigoPostal', 5, true],
    ['descripcion', 2000, false], ['nombreResponsable', 150, false],
    ['cedulaProfesional', 30, false],
  ];
  for (const [nombre, maximo, obligatorio] of campos) {
    const valor = body[nombre] ?? '';
    if (typeof valor !== 'string' || valor.trim().length > maximo ||
        (obligatorio && !valor.trim())) {
      throw fallo(400, `Revisa el campo ${nombre}: ${obligatorio ? 'es obligatorio y ' : ''}admite hasta ${maximo} caracteres.`);
    }
    datos[nombre] = valor.trim();
  }
  if (!tipos.includes(datos.tipoServicio)) throw fallo(400, 'Selecciona un tipo de establecimiento válido.');
  if (!/^\d{10}$/.test(datos.telefonoWhatsapp)) throw fallo(400, 'El teléfono debe contener 10 dígitos.');
  if (!/^\d{5}$/.test(datos.codigoPostal)) throw fallo(400, 'El código postal debe contener 5 dígitos.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correoContacto)) throw fallo(400, 'Escribe un correo de contacto válido.');
  datos.correoContacto = datos.correoContacto.toLowerCase();
  for (const [nombre, maximo] of [['latitud', 90], ['longitud', 180]]) {
    const valor = body[nombre];
    if (typeof valor !== 'string' || !valor.trim() ||
        !Number.isFinite(Number(valor)) || Math.abs(Number(valor)) > maximo) {
      throw fallo(400, 'Confirma una ubicación válida en el mapa.');
    }
    datos[nombre] = Number(valor);
  }
  if (['VETERINARIA', 'AMBAS'].includes(datos.tipoServicio) &&
      (!datos.nombreResponsable || !/^\d{1,30}$/.test(datos.cedulaProfesional))) {
    throw fallo(400, 'Indica el responsable veterinario y una cédula profesional de hasta 30 dígitos.');
  }
  if (datos.tipoServicio === 'ESTETICA') {
    if (!files.evidencia?.[0] && !evidenciaGuardada) throw fallo(400, 'Adjunta una fotografía de la estética canina.');
    datos.cedulaProfesional = '';
  }
  for (const campo of ['logo', 'evidencia']) {
    const file = files[campo]?.[0];
    if (!file) continue;
    const bytes = file.buffer;
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    const mime = png ? 'image/png' : jpg ? 'image/jpeg' : webp ? 'image/webp' : '';
    if (!mime || mime !== file.mimetype) throw fallo(400, 'Los archivos deben ser imágenes JPG, PNG o WEBP válidas.');
  }
  return datos;
}

module.exports = function registrarSucursales(app, {
  pool, requireSesionConArchivos, requirePropietario, supabase, subirArchivoASupabase,
}) {
  const recibir = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 11, parts: 13, fieldSize: 12000 },
    fileFilter: (req, file, cb) => cb(
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        ? null : fallo(400, 'Solo se permiten imágenes JPG, PNG o WEBP.'), true,
    ),
  }).fields([{ name: 'logo', maxCount: 1 }, { name: 'evidencia', maxCount: 1 }]);

  const archivos = (req, res, next) => recibir(req, res, (e) => {
    if (!e) return next();
    const grande = e.code === 'LIMIT_FILE_SIZE';
    return res.status(grande ? 413 : 400).json({ success: false,
      message: grande ? 'Cada imagen debe pesar como máximo 5 MB.' :
        e.status ? e.message : 'Revisa los campos y adjunta como máximo un logo y una fotografía.' });
  });

  app.post('/api/propietario/sucursales', requireSesionConArchivos, requirePropietario,
    archivos, requireSesionConArchivos, async (req, res) => {
      let client;
      let confirmada = false;
      let commitIniciado = false;
      const subidos = [];
      try {
        const d = validar(req.body, req.files);
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        const propietario = await client.query(`
          SELECT p.id_red
          FROM public.redes_propietarios p
          JOIN public.usuarios_negocio u ON u.id = p.id_usuario
          JOIN public.redes_sucursales s ON s.id_red = p.id_red AND s.id_negocio = u.id_negocio
          WHERE p.id_red = $1 AND p.id_usuario = $2 AND u.id_negocio = $3
            AND p.activo = TRUE AND u.activo = TRUE
            AND u.correo_verificado = TRUE AND u.dos_pasos_activo = FALSE
          FOR UPDATE OF p, u
        `, [req.propietario.id, req.auth.usuario.id, req.auth.negocio.id]);
        if (!propietario.rowCount) throw fallo(403, 'Tu acceso de propietario ya no está activo.');

        const repetida = await client.query(`
          SELECT n.id FROM public.configuracion_negocio n
          JOIN public.redes_sucursales s ON s.id_negocio = n.id
          WHERE s.id_red = $1 AND LOWER(n.nombre_establecimiento) = LOWER($2)
            AND n.codigo_postal = $3 AND LOWER(n.direccion) = LOWER($4)
          LIMIT 1
        `, [req.propietario.id, d.nombreEstablecimiento, d.codigoPostal, d.direccion]);
        if (repetida.rowCount) throw fallo(409, 'Ya tienes una sucursal con ese nombre y dirección. Revisa Mis sucursales.');

        const creada = await client.query(`
          INSERT INTO public.configuracion_negocio
            (nombre_establecimiento, tipo_servicio, telefono_whatsapp, direccion,
             codigo_postal, correo_contacto, descripcion, latitud, longitud, activo_directorio)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE) RETURNING id
        `, [d.nombreEstablecimiento, d.tipoServicio, d.telefonoWhatsapp, d.direccion,
          d.codigoPostal, d.correoContacto, d.descripcion || null, d.latitud, d.longitud]);
        const id = creada.rows[0].id;
        let evidencia = null;
        for (const [campo, bucket, publico] of [
          ['logo', 'logos-negocios', true], ['evidencia', 'evidencias-negocios', false],
        ]) {
          const file = req.files?.[campo]?.[0];
          if (!file) continue;
          const resultado = await subirArchivoASupabase(file, bucket, `negocio-${id}`, publico);
          subidos.push({ bucket, path: resultado.path });
          if (campo === 'logo') {
            await client.query('UPDATE public.configuracion_negocio SET logo_url=$1 WHERE id=$2',
              [resultado.publicUrl, id]);
          } else evidencia = resultado.path;
        }
        await client.query(`
          INSERT INTO public.verificacion_negocio
            (id_negocio, estado, nombre_responsable, cedula_profesional, foto_establecimiento_url)
          VALUES ($1,'PENDIENTE',$2,$3,$4)
        `, [id, d.nombreResponsable || null, d.cedulaProfesional || null, evidencia]);
        await client.query(`
          INSERT INTO public.redes_sucursales (id_negocio, id_red, es_principal)
          VALUES ($1,$2,FALSE)
        `, [id, req.propietario.id]);
        commitIniciado = true;
        await client.query('COMMIT');
        confirmada = true;
        return res.status(201).json({ success: true, data: {
          id, nombre_establecimiento: d.nombreEstablecimiento,
          estado: 'PENDIENTE', activo_directorio: false,
        } });
      } catch (e) {
        if (client && !confirmada) await client.query('ROLLBACK').catch(() => {});
        if (!confirmada && !commitIniciado) {
          for (const archivo of subidos) {
            try {
              const eliminado = await supabase.storage.from(archivo.bucket).remove([archivo.path]);
              if (eliminado.error) console.error('Limpieza de archivo de sucursal pendiente:', archivo.path);
            } catch { console.error('Limpieza de archivo de sucursal pendiente:', archivo.path); }
          }
        }
        if (!e.status) console.error('Registro de sucursal:', e.code || 'ERROR', e.message);
        return res.status(e.status || 503).json({ success: false,
          message: e.status ? e.message : 'No fue posible registrar la sucursal. Actualiza Mis sucursales antes de reintentar.' });
      } finally { client?.release(); }
    });
};
module.exports.validar = validar;