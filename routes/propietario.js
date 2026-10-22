module.exports = function registrarPropietario(app, { pool, requireSesion }) {
  const error = (res, status, message) => res.status(status).json({ success: false, message });
  const fallo = (res, e) => {
    console.error('Permisos propietario:', e.code || 'ERROR');
    return error(res, 503, 'No pudimos verificar tus permisos. Intenta nuevamente.');
  };
  function idValido(valor) {
    return /^[1-9]\d*$/.test(String(valor)) && Number.isSafeInteger(Number(valor))
      && Number(valor) <= 2147483647;
  }

  async function requirePropietario(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!req.auth?.usuario?.id || !req.auth?.negocio?.id) {
      return error(res, 401, 'Inicia sesión para continuar.');
    }
    try {
      const { rows } = await pool.query(`
        SELECT r.id, r.nombre FROM public.redes_negocio r
        JOIN public.redes_propietarios p ON p.id_red=r.id AND p.activo=TRUE
        JOIN public.redes_sucursales s ON s.id_red=r.id
        JOIN public.usuarios_negocio u ON u.id=p.id_usuario AND u.id_negocio=s.id_negocio
        WHERE u.id=$1 AND u.id_negocio=$2 AND u.activo=TRUE
          AND u.correo_verificado=TRUE AND u.dos_pasos_activo=FALSE
        LIMIT 1
      `, [req.auth.usuario.id, req.auth.negocio.id]);
      if (!rows.length) return error(res, 403,
        'Tu cuenta no tiene un acceso de propietario activo. Contacta a VetStec.');
      req.propietario = rows[0];
      next();
    } catch (e) { return fallo(res, e); }
  }

  // Primero requireSesion y requirePropietario. Un ID selecciona; nunca autoriza.
  async function requireSucursal(req, res, next) {
    const valor = req.params.idSucursal ?? req.auth?.negocio?.id;
    if (!req.propietario) return error(res, 403, 'Sin permisos de propietario.');
    if (!idValido(valor)) return error(res, 400, 'Sucursal inválida.');
    try {
      const { rows } = await pool.query(`
        SELECT n.id, COALESCE(v.estado,'PENDIENTE') AS estado
        FROM public.redes_sucursales s
        JOIN public.configuracion_negocio n ON n.id=s.id_negocio
        JOIN public.redes_propietarios p ON p.id_red=s.id_red
        LEFT JOIN public.verificacion_negocio v ON v.id_negocio=n.id
        WHERE s.id_red=$1 AND s.id_negocio=$2 AND p.id_usuario=$3 AND p.activo=TRUE
      `, [req.propietario.id, Number(valor), req.auth.usuario.id]);
      if (!rows.length) return error(res, 404, 'Sucursal no encontrada.');
      if (rows[0].estado !== 'APROBADO') return error(res, 403,
        'Esta sucursal necesita aprobación para realizar esta operación.');
      req.sucursal = rows[0];
      next();
    } catch (e) { return fallo(res, e); }
  }

  app.use('/api/propietario', requireSesion, requirePropietario);
  app.get('/api/propietario/resumen', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT n.id, n.nombre_establecimiento, n.tipo_servicio, n.activo_directorio,
          COALESCE(v.estado,'PENDIENTE') AS estado, s.es_principal,
          (SELECT COUNT(*)::int FROM public.empleados e WHERE e.id_negocio=n.id) AS empleados,
          (SELECT COUNT(*)::int FROM public.servicios sv WHERE sv.id_negocio=n.id) AS servicios,
          (SELECT COUNT(*)::int FROM public.productos pr WHERE pr.id_negocio=n.id) AS productos,
          (SELECT COUNT(*)::int FROM public.citas c WHERE c.id_negocio=n.id) AS citas,
          (SELECT COUNT(*)::int FROM public.ventas ve WHERE ve.id_negocio=n.id) AS ventas,
          (SELECT COUNT(*)::int FROM public.proveedores pv WHERE pv.id_negocio=n.id) AS proveedores
        FROM public.redes_sucursales s
        JOIN public.configuracion_negocio n ON n.id=s.id_negocio
        JOIN public.redes_propietarios p ON p.id_red=s.id_red
        LEFT JOIN public.verificacion_negocio v ON v.id_negocio=n.id
        WHERE s.id_red=$1 AND p.id_usuario=$2 AND p.activo=TRUE
        ORDER BY s.es_principal DESC, n.nombre_establecimiento, n.id
      `, [req.propietario.id, req.auth.usuario.id]);
      return res.json({ success: true, data: { red: req.propietario, sucursales: rows } });
    } catch (e) { return fallo(res, e); }
  });
  app.get('/api/propietario/sucursales/:idSucursal/productos', requireSucursal, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT pr.id, pr.codigo_barras, pr.nombre_producto, pr.precio_venta,
          pr.stock_actual, pr.stock_minimo
        FROM public.productos pr
        JOIN public.redes_sucursales s ON s.id_negocio=pr.id_negocio
        JOIN public.redes_propietarios p ON p.id_red=s.id_red
        JOIN public.verificacion_negocio v ON v.id_negocio=s.id_negocio
        WHERE pr.id_negocio=$1 AND s.id_red=$2 AND p.id_usuario=$3
          AND p.activo=TRUE AND v.estado='APROBADO'
        ORDER BY pr.nombre_producto, pr.id LIMIT 100
      `, [req.sucursal.id, req.propietario.id, req.auth.usuario.id]);
      return res.json({ success: true, data: rows });
    } catch (e) { return fallo(res, e); }
  });
  // Aún no hay edición de sucursales/productos: no se habilitan escrituras implícitas.
  app.use('/api/propietario', (req, res) => {
    const lectura = ['GET', 'HEAD'].includes(req.method);
    if (!lectura) res.set('Allow', 'GET, HEAD');
    return error(res, lectura ? 404 : 405,
      lectura ? 'Endpoint no encontrado.' : 'Operación todavía no disponible.');
  });
  return { requirePropietario, requireSucursal };
};