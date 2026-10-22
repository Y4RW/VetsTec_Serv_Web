module.exports = function registrarProductosPrivados(
  app, { pool, requireSesion, requirePropietario, requireSucursal }
) {
  const campos = `id, codigo_barras, nombre_producto, id_categoria,
    id_proveedor, tipo_uso, precio_compra, precio_venta, stock_actual,
    stock_minimo, fecha_caducidad, id_negocio`;

  function entero(valor, defecto, minimo, maximo) {
    if (valor === undefined) return defecto;
    if (typeof valor !== 'string' || !/^\d+$/.test(valor)) return null;
    const numero = Number(valor);
    return Number.isSafeInteger(numero) && numero >= minimo && numero <= maximo ? numero : null;
  }

  // Todas las rutas de este módulo exigen sesión, propiedad activa y sucursal aprobada.
  app.use('/api/productos', requireSesion, requirePropietario, requireSucursal);

  app.get('/api/productos', async (req, res) => {
    const idNegocio = req.sucursal.id;
    const limite = entero(req.query.limite, 20, 1, 100);
    const desplazamiento = entero(req.query.desde, 0, 0, 2147483647);
    if (limite === null || desplazamiento === null) {
      return res.status(400).json({ success: false, message: 'La paginación no es válida.' });
    }
    try {
      const { rows } = await pool.query(`
        SELECT ${campos} FROM public.productos
        WHERE id_negocio = $1
        ORDER BY nombre_producto, id LIMIT $2 OFFSET $3
      `, [idNegocio, limite + 1, desplazamiento]);
      return res.json({ success: true, data: rows.slice(0, limite),
        paginacion: { limite, desde: desplazamiento, hayMas: rows.length > limite } });
    } catch (error) {
      console.error('Error consultando productos privados:', error.message);
      return res.status(500).json({ success: false, message: 'No fue posible consultar los productos.' });
    }
  });

  app.get('/api/productos/:id', async (req, res) => {
    const idNegocio = req.sucursal.id;
    const id = entero(req.params.id, null, 1, 2147483647);
    if (id === null) return res.status(400).json({ success: false, message: 'El identificador no es válido.' });
    try {
      const { rows } = await pool.query(`
        SELECT ${campos} FROM public.productos WHERE id = $1 AND id_negocio = $2
      `, [id, idNegocio]);
      if (!rows.length) {
        // Misma respuesta para ID inexistente, sin asignar o perteneciente a otro negocio.
        return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
      }
      return res.json({ success: true, data: rows[0] });
    } catch (error) {
      console.error('Error consultando producto privado:', error.message);
      return res.status(500).json({ success: false, message: 'No fue posible consultar el producto.' });
    }
  });
  app.use('/api/productos', (req, res) => {
    const lectura = ['GET', 'HEAD'].includes(req.method);
    if (!lectura) res.set('Allow', 'GET, HEAD');
    res.status(lectura ? 404 : 405).json({ success: false,
      message: lectura ? 'Endpoint no encontrado.' : 'Operación todavía no disponible.' });
  });
};