const error = (status, message) =>
  Object.assign(new Error(message), { status });

function entero(valor, minimo = 0) {
  if (
    !['number', 'string'].includes(typeof valor) ||
    !/^\d+$/.test(String(valor))
  ) {
    throw error(400, 'Indica una cantidad entera válida.');
  }

  const n = Number(valor);

  if (!Number.isSafeInteger(n) || n < minimo || n > 2147483647) {
    throw error(400, 'La cantidad está fuera del rango permitido.');
  }

  return n;
}

module.exports = async function operacionesInventario(db, req) {
  const sucursal = req.sucursal.id;
  const id = entero(req.params.idProducto, 1);

  const resultado = await db.query(`
    SELECT id, nombre_producto, stock_actual, stock_minimo
    FROM public.productos
    WHERE id=$1 AND id_negocio=$2
    FOR UPDATE
  `, [id, sucursal]);

  const producto = resultado.rows[0];

  if (!producto) {
    throw error(404, 'Producto no encontrado.');
  }

  if (req.method === 'GET') {
    const desde = entero(req.query.desde ?? '0');

    const historial = await db.query(`
      SELECT
        id,
        tipo_movimiento,
        cantidad,
        motivo,
        fecha_movimiento::text AS fecha_movimiento,
        id_empleado,
        id_usuario_registro,
        stock_anterior,
        stock_resultante
      FROM public.movimientos_inventario
      WHERE id_negocio=$1 AND id_producto=$2
      ORDER BY id DESC
      LIMIT 21 OFFSET $3
    `, [sucursal, id, desde]);

    return {
      producto,
      movimientos: historial.rows.slice(0, 20),
      hayMas: historial.rows.length > 20,
    };
  }

  const body = req.body;

  const permitidos = [
    'solicitud_id',
    'tipo_movimiento',
    'cantidad',
    'motivo',
    'stock_esperado',
  ];

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(c => !permitidos.includes(c))
  ) {
    throw error(400, 'Solicitud inválida.');
  }

  if (
    typeof body.solicitud_id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
      .test(body.solicitud_id)
  ) {
    throw error(400, 'Identificador de operación inválido.');
  }

  if (!['ENTRADA', 'SALIDA'].includes(body.tipo_movimiento)) {
    throw error(400, 'Selecciona entrada o salida.');
  }

  const cantidad = entero(body.cantidad, 1);
  const esperado = entero(body.stock_esperado);

  if (
    typeof body.motivo !== 'string' ||
    !body.motivo.trim() ||
    body.motivo.trim().length > 200
  ) {
    throw error(400, 'Escribe un motivo de entre 1 y 200 caracteres.');
  }

  const motivo = body.motivo.trim();

  // Comprobar reintentos antes de comparar las existencias.
  const repetida = await db.query(`
    SELECT
      id, id_producto, tipo_movimiento, cantidad, motivo,
      stock_anterior, stock_resultante, id_usuario_registro
    FROM public.movimientos_inventario
    WHERE id_negocio=$1 AND solicitud_id=$2
  `, [sucursal, body.solicitud_id]);

  if (repetida.rows.length) {
    const anterior = repetida.rows[0];

    if (
      anterior.id_producto !== id ||
      anterior.tipo_movimiento !== body.tipo_movimiento ||
      anterior.cantidad !== cantidad ||
      anterior.motivo !== motivo ||
      anterior.stock_anterior !== esperado ||
      anterior.id_usuario_registro !== req.auth.usuario.id
    ) {
      throw error(
        409,
        'El identificador ya corresponde a una operación diferente.'
      );
    }

    return {
      movimiento: anterior,
      repetida: true,
    };
  }

  if (producto.stock_actual !== esperado) {
    throw error(
      409,
      'La existencia cambió. Cierra inventario y vuelve a abrirlo antes de registrar el movimiento.'
    );
  }

  const siguiente = body.tipo_movimiento === 'ENTRADA'
    ? producto.stock_actual + cantidad
    : producto.stock_actual - cantidad;

  if (siguiente < 0) {
    throw error(409, 'No hay existencias suficientes para esta salida.');
  }

  if (!Number.isSafeInteger(siguiente) || siguiente > 2147483647) {
    throw error(400, 'La existencia resultante supera el máximo permitido.');
  }

  const movimiento = await db.query(`
    INSERT INTO public.movimientos_inventario (
      id_producto,
      tipo_movimiento,
      cantidad,
      motivo,
      id_negocio,
      solicitud_id,
      id_usuario_registro,
      stock_anterior,
      stock_resultante
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id, tipo_movimiento, cantidad, stock_anterior, stock_resultante
  `, [
    id,
    body.tipo_movimiento,
    cantidad,
    motivo,
    sucursal,
    body.solicitud_id,
    req.auth.usuario.id,
    producto.stock_actual,
    siguiente,
  ]);

  await db.query(`
    UPDATE public.productos
    SET stock_actual=$1
    WHERE id=$2 AND id_negocio=$3
  `, [siguiente, id, sucursal]);

  return {
    movimiento: movimiento.rows[0],
    repetida: false,
  };
};