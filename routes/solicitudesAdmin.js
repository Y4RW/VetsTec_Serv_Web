module.exports = function registrarSolicitudesAdmin(app, { pool, supabase }) {
  const base = '/api/admin/solicitudes';
  const fallo = (status, message) => Object.assign(new Error(message), { status });
  const idValido = (valor) => /^[1-9]\d*$/.test(valor || '') && Number(valor) <= 2147483647;
  const verificadoSQL = `EXISTS (SELECT 1 FROM usuarios_negocio u
    WHERE u.id_negocio = n.id AND u.activo = TRUE AND u.correo_verificado = TRUE)`;

  // autenticacionAdmin debe registrarse antes. Esta comprobación adicional falla
  // de forma cerrada si el módulo se instala accidentalmente en otro orden.
  app.use(base, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.admin?.administrador?.rol !== 'ADMIN_VETSTEC') {
      return res.status(401).json({ success: false, message: 'Inicia sesión como administrador.' });
    }
    next();
  });
  function responderError(res, error) {
    if (!error.status) console.error('Error revisando solicitudes:', error.message);
    return res.status(error.status || 503).json({ success: false,
      message: error.status ? error.message : 'No se pudo completar la revisión. Actualiza y vuelve a intentarlo.' });
  }
  function rutaEvidencia(id, ruta) {
    // Solo admite la carpeta y los nombres generados por el registro existente.
    return typeof ruta === 'string' && new RegExp(`^negocio-${id}/[a-zA-Z0-9-]+\\.(jpg|png|webp)$`).test(ruta);
  }
  function tipoImagen(bytes) {
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
  }

  app.get(base, async (req, res) => {
    try {
      const estado = req.query.estado || 'PENDIENTE';
      const buscar = req.query.buscar || '';
      const paginaTexto = req.query.pagina || '1';
      if (!['PENDIENTE', 'APROBADO', 'RECHAZADO', 'SUSPENDIDO', 'TODAS'].includes(estado) ||
          typeof buscar !== 'string' || buscar.length > 100 || typeof paginaTexto !== 'string' ||
          !/^[1-9]\d{0,5}$/.test(paginaTexto)) throw fallo(400, 'Filtros no válidos.');
      const pagina = Number(paginaTexto), limite = 20;
      const patron = '%' + buscar.trim().replace(/[\\%_]/g, '\\$&') + '%';
      const filtro = `($1 = 'TODAS' OR v.estado = $1)
        AND (n.nombre_establecimiento ILIKE $2 OR n.codigo_postal ILIKE $2)`;
      // Conteo y página salen de la misma instantánea SQL, incluso si otra persona decide.
      const resultado = await pool.query(`
        WITH filtradas AS (
          SELECT n.id, n.nombre_establecimiento, n.tipo_servicio, n.codigo_postal,
            n.activo_directorio, v.estado, v.fecha_solicitud,
            ${verificadoSQL} AS correo_verificado
          FROM verificacion_negocio v JOIN configuracion_negocio n ON n.id = v.id_negocio
          WHERE ${filtro}
        ), pagina AS (
          SELECT * FROM filtradas ORDER BY fecha_solicitud ASC, id ASC LIMIT $3 OFFSET $4
        )
        SELECT (SELECT COUNT(*)::int FROM filtradas) AS total,
          COALESCE((SELECT json_agg(p ORDER BY p.fecha_solicitud, p.id) FROM pagina p), '[]'::json) AS solicitudes
      `, [estado, patron, limite, (pagina - 1) * limite]);
      return res.json({ success: true, data: { ...resultado.rows[0], pagina, limite } });
    } catch (error) { return responderError(res, error); }
  });

  app.get(`${base}/:id`, async (req, res) => {
    try {
      if (!idValido(req.params.id)) throw fallo(400, 'Identificador no válido.');
      const resultado = await pool.query(`
        SELECT n.id, n.nombre_establecimiento, n.tipo_servicio, n.telefono_whatsapp,
          n.direccion, n.codigo_postal, n.correo_contacto, n.descripcion,
          n.latitud, n.longitud, n.activo_directorio, v.estado, v.nombre_responsable,
          v.cedula_profesional, v.motivo_rechazo, v.observaciones_revision,
          v.fecha_solicitud, v.fecha_revision,
          (v.foto_establecimiento_url IS NOT NULL) AS tiene_evidencia,
          ${verificadoSQL} AS correo_verificado,
          COALESCE((SELECT json_agg(json_build_object('correo', u.correo,
            'correo_verificado', u.correo_verificado, 'activo', u.activo) ORDER BY u.id)
            FROM usuarios_negocio u WHERE u.id_negocio = n.id), '[]'::json) AS cuentas,
          COALESCE((SELECT json_agg(json_build_object('id', h.id,
            'administrador', h.administrador_nombre, 'estado_anterior', h.estado_anterior,
            'estado_nuevo', h.estado_nuevo, 'motivo', h.motivo,
            'observaciones', h.observaciones, 'fecha', h.fecha) ORDER BY h.fecha DESC, h.id DESC)
            FROM historial_revision_negocio h WHERE h.id_negocio = n.id), '[]'::json) AS historial
        FROM configuracion_negocio n JOIN verificacion_negocio v ON v.id_negocio = n.id
        WHERE n.id = $1
      `, [Number(req.params.id)]);
      if (!resultado.rowCount) throw fallo(404, 'Solicitud no encontrada.');
      return res.json({ success: true, data: resultado.rows[0] });
    } catch (error) { return responderError(res, error); }
  });

  app.get(`${base}/:id/evidencia`, async (req, res) => {
    try {
      if (!idValido(req.params.id)) throw fallo(400, 'Identificador no válido.');
      const resultado = await pool.query(`SELECT foto_establecimiento_url
        FROM verificacion_negocio WHERE id_negocio = $1`, [Number(req.params.id)]);
      const ruta = resultado.rows[0]?.foto_establecimiento_url;
      if (!ruta) throw fallo(404, 'Esta solicitud no tiene fotografía adjunta.');
      if (!rutaEvidencia(req.params.id, ruta)) throw fallo(409, 'La ruta de la evidencia no es válida. Revisa el registro.');
      const { data, error } = await supabase.storage.from('evidencias-negocios').download(ruta);
      if (error || !data) throw fallo(502, 'No se pudo obtener la evidencia. Comprueba el archivo y el acceso al almacenamiento.');
      if (data.size > 5 * 1024 * 1024) throw fallo(415, 'La evidencia supera los 5 MB permitidos.');
      const bytes = Buffer.from(await data.arrayBuffer());
      const tipo = tipoImagen(bytes);
      if (!tipo) throw fallo(415, 'El archivo no es una imagen JPG, PNG o WEBP válida.');
      res.set({ 'Content-Type': tipo, 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline', 'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'none'; sandbox" });
      return res.send(bytes);
    } catch (error) { return responderError(res, error); }
  });

  app.post(`${base}/:id/decision`, async (req, res) => {
    let client;
    try {
      if (!idValido(req.params.id)) throw fallo(400, 'Identificador no válido.');
      const { decision, motivo = '', observaciones = '', revisionConfirmada } = req.body || {};
      if (!['APROBADO', 'RECHAZADO'].includes(decision) || typeof motivo !== 'string' ||
          typeof observaciones !== 'string' || motivo.length > 2000 || observaciones.length > 2000) {
        throw fallo(400, 'Selecciona una decisión y utiliza textos de hasta 2000 caracteres.');
      }
      if (decision === 'RECHAZADO' && motivo.trim().length < 10) throw fallo(400, 'Escribe un motivo de rechazo de al menos 10 caracteres.');
      if (decision === 'APROBADO' && revisionConfirmada !== true) throw fallo(400, 'Confirma que revisaste los datos y los requisitos del establecimiento.');
      const id = Number(req.params.id);
      client = await pool.connect();
      await client.query('BEGIN');
      const resultado = await client.query(`
        SELECT n.id, n.tipo_servicio, v.estado, v.nombre_responsable,
          v.cedula_profesional, v.foto_establecimiento_url
        FROM verificacion_negocio v JOIN configuracion_negocio n ON n.id = v.id_negocio
        WHERE n.id = $1 FOR UPDATE OF v, n
      `, [id]);
      const solicitud = resultado.rows[0];
      if (!solicitud) throw fallo(404, 'Solicitud no encontrada.');
      if (solicitud.estado !== 'PENDIENTE') throw fallo(409, 'Esta solicitud ya fue revisada. Actualiza el detalle para ver la decisión.');
      if (decision === 'APROBADO') {
        const usuarios = await client.query(`SELECT id, activo, correo_verificado
          FROM usuarios_negocio WHERE id_negocio = $1 ORDER BY id FOR UPDATE`, [id]);
        if (!usuarios.rows.some(u => u.activo && u.correo_verificado)) {
          throw fallo(409, 'El establecimiento debe verificar su correo antes de aprobarlo.');
        }
        if (!['VETERINARIA', 'ESTETICA', 'AMBAS'].includes(solicitud.tipo_servicio)) throw fallo(409, 'El tipo de establecimiento no es válido.');
        if (['VETERINARIA', 'AMBAS'].includes(solicitud.tipo_servicio) &&
            (!solicitud.nombre_responsable?.trim() || !solicitud.cedula_profesional?.trim())) {
          throw fallo(409, 'Faltan el responsable veterinario o su cédula profesional.');
        }
        if (solicitud.tipo_servicio === 'ESTETICA' && !rutaEvidencia(id, solicitud.foto_establecimiento_url)) {
          throw fallo(409, 'Falta una fotografía válida del establecimiento.');
        }
      }
      await client.query(`UPDATE verificacion_negocio SET estado = $2, motivo_rechazo = $3,
        observaciones_revision = $4, fecha_revision = CURRENT_TIMESTAMP WHERE id_negocio = $1`,
        [id, decision, decision === 'RECHAZADO' ? motivo.trim() : null, observaciones.trim() || null]);
      await client.query('UPDATE configuracion_negocio SET activo_directorio = $2 WHERE id = $1', [id, decision === 'APROBADO']);
      const actor = req.admin.administrador;
      await client.query(`INSERT INTO historial_revision_negocio
        (id_negocio, id_admin, administrador_nombre, estado_anterior, estado_nuevo, motivo, observaciones)
        VALUES ($1, $2, $3, 'PENDIENTE', $4, $5, $6)`,
        [id, actor.id, actor.nombre, decision, decision === 'RECHAZADO' ? motivo.trim() : null, observaciones.trim() || null]);
      await client.query('COMMIT');
      return res.json({ success: true, data: { id, estado: decision, activo_directorio: decision === 'APROBADO' } });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return responderError(res, error);
    } finally { client?.release(); }
  });
};