const { createHash } = require('node:crypto');

const error = (status, message) =>
  Object.assign(new Error(message), { status });

const columnas = `
  id, nombre_servicio, tipo_servicio,
  tiempo_estimado_minutos, precio_base, id_negocio
`;

const version = fila =>
  createHash('sha256').update(JSON.stringify(fila)).digest('hex');

function presentar(fila) {
  const { tiene_citas, ...servicio } = fila;

  return {
    ...servicio,
    tiene_citas: Boolean(tiene_citas),
    version: version(servicio),
  };
}

function entero(valor, minimo = 0) {
  if (
    !['string', 'number'].includes(typeof valor) ||
    !/^\d+$/.test(String(valor))
  ) {
    throw error(400, 'Indica un número entero válido.');
  }

  const n = Number(valor);

  if (!Number.isSafeInteger(n) || n < minimo || n > 2147483647) {
    throw error(400, 'Número fuera del rango permitido.');
  }

  return n;
}

function validar(body, metodo) {
  const campos = [
    'nombre_servicio',
    'tipo_servicio',
    'tiempo_estimado_minutos',
    'precio_base',
  ];

  const permitidos = metodo === 'DELETE'
    ? ['version']
    : [...campos, ...(metodo === 'PATCH' ? ['version'] : [])];

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(c => !permitidos.includes(c))
  ) {
    throw error(400, 'Solicitud inválida.');
  }

  if (
    metodo !== 'POST' &&
    (
      typeof body.version !== 'string' ||
      !/^[a-f0-9]{64}$/.test(body.version)
    )
  ) {
    throw error(400, 'Recarga los servicios antes de continuar.');
  }

  if (metodo === 'DELETE') return null;

  if (
    typeof body.nombre_servicio !== 'string' ||
    !body.nombre_servicio.trim() ||
    body.nombre_servicio.trim().length > 100
  ) {
    throw error(400, 'El nombre debe tener entre 1 y 100 caracteres.');
  }

  if (!['VETERINARIA', 'ESTETICA'].includes(body.tipo_servicio)) {
    throw error(400, 'Selecciona un tipo de servicio válido.');
  }

  if (
    !['string', 'number'].includes(typeof body.precio_base) ||
    !/^\d{1,8}(\.\d{1,2})?$/.test(String(body.precio_base))
  ) {
    throw error(
      400,
      'El precio debe ser cero o positivo, con hasta dos decimales.'
    );
  }

  return {
    nombre_servicio: body.nombre_servicio.trim(),
    tipo_servicio: body.tipo_servicio,
    tiempo_estimado_minutos: entero(body.tiempo_estimado_minutos, 1),
    precio_base: String(body.precio_base),
  };
}

module.exports = function registrarServicios(app, {
  pool,
  requireSucursal,
}) {
  const base = '/api/propietario/sucursales/:idSucursal/servicios';

  async function manejar(req, res) {
    let db;

    try {
      const sucursal = req.sucursal.id;
      const escritura = req.method !== 'GET';
      const id = req.params.idServicio
        ? entero(req.params.idServicio, 1)
        : null;

      const datos = escritura ? validar(req.body, req.method) : null;

      db = await pool.connect();
      await db.query('BEGIN');
      await db.query("SET LOCAL lock_timeout = '5s'");
      await db.query("SET LOCAL statement_timeout = '15s'");

      const acceso = await db.query(`
        SELECT n.id, n.tipo_servicio, v.estado
        FROM public.configuracion_negocio n
        JOIN public.verificacion_negocio v ON v.id_negocio=n.id
        JOIN public.redes_sucursales s ON s.id_negocio=n.id
        WHERE n.id=$1 AND s.id_red=$2
        FOR UPDATE OF n, v, s
      `, [sucursal, req.propietario.id]);

      const negocio = acceso.rows[0];

      if (!negocio) throw error(404, 'Sucursal no encontrada.');

      if (negocio.estado !== 'APROBADO') {
        throw error(403, 'La sucursal necesita aprobación.');
      }

      const propietario = await db.query(`
        SELECT p.id_red
        FROM public.redes_propietarios p
        JOIN public.usuarios_negocio u ON u.id=p.id_usuario
        JOIN public.redes_sucursales origen
          ON origen.id_negocio=u.id_negocio
          AND origen.id_red=p.id_red
        WHERE p.id_red=$1
          AND p.id_usuario=$2
          AND u.id_negocio=$3
          AND p.activo=TRUE
          AND u.activo=TRUE
          AND u.correo_verificado=TRUE
          AND u.dos_pasos_activo=FALSE
        FOR UPDATE OF p, u
      `, [
        req.propietario.id,
        req.auth.usuario.id,
        req.auth.negocio.id,
      ]);

      if (!propietario.rows.length) {
        throw error(403, 'Tu acceso de propietario ya no está activo.');
      }

      let data;

      if (!escritura) {
        const desde = entero(req.query.desde ?? '0');
        const q = req.query.q ?? '';

        if (typeof q !== 'string' || q.length > 100) {
          throw error(400, 'Búsqueda inválida.');
        }

        const filtro = `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;

        const lista = await db.query(`
          SELECT
            s.id, s.nombre_servicio, s.tipo_servicio,
            s.tiempo_estimado_minutos, s.precio_base, s.id_negocio,
            EXISTS (
              SELECT 1 FROM public.citas c WHERE c.id_servicio=s.id
            ) AS tiene_citas
          FROM public.servicios s
          WHERE s.id_negocio=$1 AND s.nombre_servicio ILIKE $2
          ORDER BY s.nombre_servicio, s.id
          LIMIT 21 OFFSET $3
        `, [sucursal, filtro, desde]);

        const total = await db.query(`
          SELECT COUNT(*)::int AS total
          FROM public.servicios
          WHERE id_negocio=$1 AND nombre_servicio ILIKE $2
        `, [sucursal, filtro]);

        data = {
          servicios: lista.rows.slice(0, 20).map(presentar),
          total: total.rows[0].total,
          hayMas: lista.rows.length > 20,
          tipoSucursal: negocio.tipo_servicio,
        };
      } else {
        if (id !== null) {
          const consulta = await db.query(`
            SELECT ${columnas}
            FROM public.servicios
            WHERE id=$1 AND id_negocio=$2
            FOR UPDATE
          `, [id, sucursal]);

          const actual = consulta.rows[0];

          if (!actual) throw error(404, 'Servicio no encontrado.');

          if (version(actual) !== req.body.version) {
            throw error(
              409,
              'El servicio cambió. Recarga la lista antes de continuar.'
            );
          }

          const citas = await db.query(`
            SELECT 1 FROM public.citas
            WHERE id_servicio=$1
            LIMIT 1
          `, [id]);

          if (citas.rows.length) {
            throw error(
              409,
              'Este servicio tiene citas y debe conservar sus datos históricos.'
            );
          }
        }

        if (req.method === 'DELETE') {
          await db.query(`
            DELETE FROM public.servicios
            WHERE id=$1 AND id_negocio=$2
          `, [id, sucursal]);

          data = { id };
        } else {
          if (
            negocio.tipo_servicio !== 'AMBAS' &&
            negocio.tipo_servicio !== datos.tipo_servicio
          ) {
            throw error(
              400,
              'El servicio no corresponde al tipo autorizado de esta sucursal.'
            );
          }

          const valores = [
            datos.nombre_servicio,
            datos.tipo_servicio,
            datos.tiempo_estimado_minutos,
            datos.precio_base,
          ];

          const resultado = req.method === 'POST'
            ? await db.query(`
                INSERT INTO public.servicios (
                  nombre_servicio, tipo_servicio,
                  tiempo_estimado_minutos, precio_base, id_negocio
                )
                VALUES ($1,$2,$3,$4,$5)
                RETURNING ${columnas}
              `, [...valores, sucursal])
            : await db.query(`
                UPDATE public.servicios SET
                  nombre_servicio=$1,
                  tipo_servicio=$2,
                  tiempo_estimado_minutos=$3,
                  precio_base=$4
                WHERE id=$5 AND id_negocio=$6
                RETURNING ${columnas}
              `, [...valores, id, sucursal]);

          data = presentar(resultado.rows[0]);
        }
      }

      const totalSucursal = await db.query(`
        SELECT COUNT(*)::int AS total
        FROM public.servicios
        WHERE id_negocio=$1
      `, [sucursal]);

      await db.query('COMMIT');

      return res.status(req.method === 'POST' ? 201 : 200).json({
        success: true,
        data,
        totalSucursal: totalSucursal.rows[0].total,
      });
    } catch (e) {
      if (db) await db.query('ROLLBACK').catch(() => {});

      const status = e.status || (e.code === '23503' ? 409 : 503);

      if (!e.status) {
        console.error('Servicios del propietario:', e.code || 'ERROR');
      }

      return res.status(status).json({
        success: false,
        message: e.status
          ? e.message
          : e.code === '23503'
            ? 'El servicio tiene registros relacionados y no puede eliminarse.'
            : 'No se pudo confirmar la operación. Recarga la lista antes de reintentar.',
      });
    } finally {
      db?.release();
    }
  }

  // Hereda sesión y propietario del montaje en propietario.js.
  app.get(base, requireSucursal, manejar);
  app.post(base, requireSucursal, manejar);
  app.patch(`${base}/:idServicio`, requireSucursal, manejar);
  app.delete(`${base}/:idServicio`, requireSucursal, manejar);
};