const { createHash } = require('node:crypto');

const fallo = (status, message) =>
  Object.assign(new Error(message), { status });

const columnas = `id, codigo_barras, nombre_producto, id_categoria, id_proveedor,
  tipo_uso, precio_compra, precio_venta, stock_actual, stock_minimo,
  fecha_caducidad::text AS fecha_caducidad, id_negocio`;

const campos = [
  'codigo_barras',
  'nombre_producto',
  'id_categoria',
  'id_proveedor',
  'tipo_uso',
  'precio_compra',
  'precio_venta',
  'stock_minimo',
  'fecha_caducidad',
];

const version = fila =>
  createHash('sha256').update(JSON.stringify(fila)).digest('hex');

const presentar = fila => ({
  ...fila,
  version: version(fila),
});

function entero(valor, minimo = 0) {
  if (
    !['string', 'number'].includes(typeof valor) ||
    !/^\d+$/.test(String(valor))
  ) {
    throw fallo(400, 'Revisa los identificadores y las cantidades enteras.');
  }

  const n = Number(valor);

  if (!Number.isSafeInteger(n) || n < minimo || n > 2147483647) {
    throw fallo(400, 'Cantidad o identificador fuera de rango.');
  }

  return n;
}

function validar(body, metodo) {
  const permitidos = metodo === 'DELETE'
    ? ['version']
    : [...campos, ...(metodo === 'PATCH' ? ['version'] : [])];

  if (
    !body ||
    Array.isArray(body) ||
    typeof body !== 'object' ||
    Object.keys(body).some(c => !permitidos.includes(c))
  ) {
    throw fallo(400, 'Solicitud inválida.');
  }

  if (
    metodo !== 'POST' &&
    !/^[a-f0-9]{64}$/.test(body.version || '')
  ) {
    throw fallo(400, 'Vuelve a cargar el producto antes de modificarlo.');
  }

  if (metodo === 'DELETE') return null;

  const d = {};

  for (const [c, max] of [
    ['codigo_barras', 100],
    ['nombre_producto', 150],
  ]) {
    if (
      typeof body[c] !== 'string' ||
      !body[c].trim() ||
      body[c].trim().length > max
    ) {
      throw fallo(
        400,
        `Revisa el campo ${c}; admite hasta ${max} caracteres.`
      );
    }

    d[c] = body[c].trim();
  }

  if (!['VETERINARIA', 'ESTETICA', 'AMBOS'].includes(body.tipo_uso)) {
    throw fallo(400, 'Selecciona un tipo de uso válido.');
  }

  d.tipo_uso = body.tipo_uso;

  for (const c of ['precio_compra', 'precio_venta']) {
    if (
      !['string', 'number'].includes(typeof body[c]) ||
      !/^\d{1,8}(\.\d{1,2})?$/.test(String(body[c]))
    ) {
      throw fallo(
        400,
        'Los precios deben ser positivos o cero, con hasta dos decimales.'
      );
    }

    d[c] = String(body[c]);
  }

  d.stock_minimo = entero(body.stock_minimo);

  for (const c of ['id_categoria', 'id_proveedor']) {
    d[c] = body[c] === '' || body[c] === null
      ? null
      : entero(body[c], 1);
  }

  d.fecha_caducidad =
    body.fecha_caducidad === '' || body.fecha_caducidad === null
      ? null
      : body.fecha_caducidad;

  if (d.fecha_caducidad !== null) {
    const f = d.fecha_caducidad;
    const fecha = typeof f === 'string'
      ? new Date(`${f}T00:00:00Z`)
      : new Date(NaN);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(f) ||
      f.slice(0, 4) === '0000' ||
      !Number.isFinite(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== f
    ) {
      throw fallo(400, 'La fecha de caducidad no es válida.');
    }
  }

  return d;
}

module.exports = function registrarCatalogo(app, {
  pool,
  requireSucursal,
}) {
  const base =
    '/api/propietario/sucursales/:idSucursal/catalogo-productos';

  async function manejar(req, res) {
    let db;

    try {
      const sucursal = req.sucursal.id;
      const escritura = req.method !== 'GET';
      const id = req.params.idProducto
        ? entero(req.params.idProducto, 1)
        : null;

      const d = escritura ? validar(req.body, req.method) : null;

      db = await pool.connect();

      await db.query('BEGIN');
      await db.query("SET LOCAL lock_timeout = '5s'");
      await db.query("SET LOCAL statement_timeout = '15s'");

      // Mismo orden de bloqueo que la edición de sucursales.
      const acceso = await db.query(`
        SELECT n.id, v.estado
        FROM public.configuracion_negocio n
        JOIN public.verificacion_negocio v ON v.id_negocio=n.id
        JOIN public.redes_sucursales s ON s.id_negocio=n.id
        WHERE n.id=$1 AND s.id_red=$2
        FOR UPDATE OF n, v, s
      `, [sucursal, req.propietario.id]);

      if (!acceso.rows.length) {
        throw fallo(404, 'Sucursal no encontrada.');
      }

      if (acceso.rows[0].estado !== 'APROBADO') {
        throw fallo(403, 'La sucursal necesita aprobación.');
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
        throw fallo(403, 'Tu acceso de propietario ya no está activo.');
      }

      let data;

      if (!escritura) {
        const desde = entero(req.query.desde ?? '0');
        const q = req.query.q ?? '';

        if (typeof q !== 'string' || q.length > 150) {
          throw fallo(400, 'Búsqueda inválida.');
        }

        const filtro = `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
        const condicion = `
          id_negocio=$1
          AND (nombre_producto ILIKE $2 OR codigo_barras ILIKE $2)
        `;

        const lista = await db.query(`
          SELECT ${columnas}
          FROM public.productos
          WHERE ${condicion}
          ORDER BY nombre_producto, id
          LIMIT 21 OFFSET $3
        `, [sucursal, filtro, desde]);

        const total = await db.query(`
          SELECT COUNT(*)::int AS total
          FROM public.productos
          WHERE ${condicion}
        `, [sucursal, filtro]);

        const categorias = await db.query(`
          SELECT id, nombre_categoria, aplica_a
          FROM public.categorias_productos
          ORDER BY nombre_categoria, id
        `);

        const proveedores = await db.query(`
          SELECT id, nombre_empresa
          FROM public.proveedores
          WHERE id_negocio=$1
          ORDER BY nombre_empresa, id
        `, [sucursal]);

        data = {
          productos: lista.rows.slice(0, 20).map(presentar),
          total: total.rows[0].total,
          hayMas: lista.rows.length > 20,
          categorias: categorias.rows,
          proveedores: proveedores.rows,
        };
      } else {
        let actual;

        if (id !== null) {
          const r = await db.query(`
            SELECT ${columnas}
            FROM public.productos
            WHERE id=$1 AND id_negocio=$2
            FOR UPDATE
          `, [id, sucursal]);

          actual = r.rows[0];

          if (!actual) {
            throw fallo(404, 'Producto no encontrado.');
          }

          if (version(actual) !== req.body.version) {
            throw fallo(
              409,
              'El producto cambió. Recarga la lista y vuelve a abrirlo.'
            );
          }
        }

        if (req.method === 'DELETE') {
          if (actual.stock_actual !== 0) {
            throw fallo(
              409,
              'No puedes eliminar un producto con existencias.'
            );
          }

          const movimientos = await db.query(`
            SELECT 1
            FROM public.movimientos_inventario
            WHERE id_producto=$1
            LIMIT 1
          `, [id]);

          if (movimientos.rows.length) {
            throw fallo(
              409,
              'El producto tiene movimientos; debe conservarse su historial.'
            );
          }

          await db.query(`
            DELETE FROM public.productos
            WHERE id=$1 AND id_negocio=$2
          `, [id, sucursal]);

          data = { id };
        } else {
          if (d.id_categoria !== null) {
            const r = await db.query(`
              SELECT id
              FROM public.categorias_productos
              WHERE id=$1
              FOR SHARE
            `, [d.id_categoria]);

            if (!r.rows.length) {
              throw fallo(400, 'La categoría no existe.');
            }
          }

          if (d.id_proveedor !== null) {
            const r = await db.query(`
              SELECT id
              FROM public.proveedores
              WHERE id=$1 AND id_negocio=$2
              FOR SHARE
            `, [d.id_proveedor, sucursal]);

            if (!r.rows.length) {
              throw fallo(
                400,
                'Selecciona un proveedor de esta sucursal.'
              );
            }
          }

          const valores = campos.map(c => d[c]);

          const r = req.method === 'POST'
            ? await db.query(`
                INSERT INTO public.productos (
                  ${campos.join(',')}, id_negocio, stock_actual
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)
                RETURNING ${columnas}
              `, [...valores, sucursal])
            : await db.query(`
                UPDATE public.productos
                SET ${campos.map((c, i) => `${c}=$${i + 1}`).join(',')}
                WHERE id=$10 AND id_negocio=$11
                RETURNING ${columnas}
              `, [...valores, id, sucursal]);

          data = presentar(r.rows[0]);
        }
      }

      const totalSucursal = await db.query(`
        SELECT COUNT(*)::int AS total
        FROM public.productos
        WHERE id_negocio=$1
      `, [sucursal]);

      await db.query('COMMIT');

      return res.status(req.method === 'POST' ? 201 : 200).json({
        success: true,
        data,
        totalSucursal: totalSucursal.rows[0].total,
      });
    } catch (e) {
      if (db) {
        await db.query('ROLLBACK').catch(() => {});
      }

      const status = e.status ||
        (['23505', '23503'].includes(e.code) ? 409 : 503);

      const message = e.status
        ? e.message
        : e.code === '23505'
          ? 'Ese código de barras ya está registrado. La restricción actual es global.'
          : e.code === '23503'
            ? 'Hay registros relacionados. Actualiza los datos; no se puede completar esta operación.'
            : 'No pudimos confirmar la operación. Recarga la lista antes de reintentar.';

      if (!e.status) {
        console.error('Catálogo de productos:', e.code || 'ERROR');
      }

      return res.status(status).json({
        success: false,
        message,
      });
    } finally {
      db?.release();
    }
  }

  // Se registra después del middleware de sesión y propietario.
  app.get(base, requireSucursal, manejar);
  app.post(base, requireSucursal, manejar);
  app.patch(`${base}/:idProducto`, requireSucursal, manejar);
  app.delete(`${base}/:idProducto`, requireSucursal, manejar);
};