const { cuentaVerificadaSQL } = require('../lib/cuentasEstablecimiento');

const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const TIPOS_NEGOCIO = {
  VETERINARIA: 'Veterinaria',
  ESTETICA: 'Estética canina',
  AMBAS: 'Veterinaria y estética',
};

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatearMoneda(valor) {
  const num = Number(valor);
  if (!Number.isFinite(num)) return '';
  return `$${num.toFixed(2)} MXN`;
}

function buildWhatsAppUrl(rawPhone, text) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  const mxPhone = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${mxPhone}?text=${encodeURIComponent(text)}`;
}

function resumirHorario(horarios = []) {
  const abiertos = (horarios || [])
    .filter((h) => h && !h.cerrado && h.hora_apertura && h.hora_cierre)
    .sort((a, b) => a.dia_semana - b.dia_semana);

  if (!abiertos.length) return 'Horario pendiente de publicar';

  const primero = abiertos[0];
  const rango = `${String(primero.hora_apertura).slice(0, 5)} a ${String(primero.hora_cierre).slice(0, 5)}`;
  if (abiertos.length === 7) return `Todos los días (${rango})`;
  const diasTxt = abiertos.map((d) => DIAS_SEMANA[d.dia_semana]?.slice(0, 3)).join(', ');
  return `${diasTxt} (${rango})`;
}

module.exports = function registrarAsistenteIA(app, { pool, requireSesion, obtenerCorreoContacto }) {
  // Control de frecuencia ligero por IP para el asistente público
  const traficoPorIp = new Map();
  function verificarLimiteIp(ip) {
    const ahora = Date.now();
    if (traficoPorIp.size > 500) {
      for (const [k, v] of traficoPorIp.entries()) {
        if (v.expira <= ahora) traficoPorIp.delete(k);
      }
    }
    const clave = String(ip || 'local');
    const actual = traficoPorIp.get(clave);
    if (!actual || actual.expira <= ahora) {
      traficoPorIp.set(clave, { cuenta: 1, expira: ahora + 60_000 });
      return true;
    }
    actual.cuenta += 1;
    return actual.cuenta <= 35;
  }
  7
  let cacheDirectorio = { vence: 0, datos: [] };

  async function obtenerSnapshotPublico() {
    if (cacheDirectorio.vence > Date.now()) {
      return cacheDirectorio.datos;
    }

    const { rows } = await pool.query(`
      SELECT
        n.id,
        n.nombre_establecimiento,
        n.tipo_servicio,
        n.telefono_whatsapp,
        n.direccion,
        n.codigo_postal,
        n.correo_contacto,
        n.descripcion,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'dia_semana', h.dia_semana,
                'hora_apertura', h.hora_apertura,
                'hora_cierre', h.hora_cierre,
                'cerrado', h.cerrado
              )
              ORDER BY h.dia_semana ASC
            )
            FROM public.horarios_negocio h
            WHERE h.id_negocio = n.id
          ),
          '[]'::json
        ) AS horarios,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', s.id,
                'nombre', s.nombre_servicio,
                'tipo', s.tipo_servicio,
                'duracion_min', s.tiempo_estimado_minutos,
                'precio', s.precio_base
              )
              ORDER BY s.nombre_servicio ASC
            )
            FROM public.servicios s
            WHERE s.id_negocio = n.id
          ),
          '[]'::json
        ) AS servicios,
        (
          SELECT COUNT(*)::int
          FROM public.disponibilidad_negocio d
          WHERE d.id_negocio = n.id
            AND d.activo = TRUE
            AND d.fecha BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 7
        ) AS dias_con_cupo
      FROM public.configuracion_negocio n
      WHERE n.activo_directorio = TRUE
        AND EXISTS (
          SELECT 1 FROM public.verificacion_negocio v
          WHERE v.id_negocio = n.id AND v.estado = 'APROBADO'
        )
        AND ${cuentaVerificadaSQL('n.id')}
      ORDER BY n.nombre_establecimiento ASC
      LIMIT 40
    `);

    cacheDirectorio = {
      datos: rows,
      vence: Date.now() + 15_000,
    };
    return rows;
  }

  async function obtenerSnapshotPropietario(idUsuario, idNegocioSesion, idSucursalPreferida) {
    const redRes = await pool.query(`
      SELECT r.id, r.nombre
      FROM public.redes_negocio r
      JOIN public.redes_propietarios p ON p.id_red = r.id AND p.activo = TRUE
      JOIN public.redes_sucursales s ON s.id_red = r.id
      JOIN public.usuarios_negocio u ON u.id = p.id_usuario AND u.id_negocio = s.id_negocio
      WHERE u.id = $1 AND u.id_negocio = $2 AND u.activo = TRUE
      LIMIT 1
    `, [idUsuario, idNegocioSesion]);

    const red = redRes.rows[0] || null;

    const sucursalesRes = red
      ? await pool.query(`
          SELECT
            n.id,
            n.nombre_establecimiento,
            n.tipo_servicio,
            n.activo_directorio,
            n.telefono_whatsapp,
            n.correo_contacto,
            n.direccion,
            n.codigo_postal,
            COALESCE(v.estado, 'PENDIENTE') AS estado,
            v.motivo_rechazo,
            s.es_principal,
            (SELECT COUNT(*)::int FROM public.empleados e WHERE e.id_negocio = n.id) AS total_empleados,
            (SELECT COUNT(*)::int FROM public.empleados e WHERE e.id_negocio = n.id AND e.activo = TRUE) AS empleados_activos,
            (SELECT COUNT(*)::int FROM public.servicios sv WHERE sv.id_negocio = n.id) AS total_servicios,
            (SELECT COUNT(*)::int FROM public.productos pr WHERE pr.id_negocio = n.id) AS total_productos,
            (SELECT COUNT(*)::int FROM public.citas c WHERE c.id_negocio = n.id) AS total_citas,
            (SELECT COUNT(*)::int FROM public.horarios_negocio h WHERE h.id_negocio = n.id AND h.cerrado = FALSE) AS dias_abiertos,
            (SELECT COUNT(*)::int FROM public.disponibilidad_negocio d
              WHERE d.id_negocio = n.id AND d.activo = TRUE
              AND d.fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS dias_cupo_activo
          FROM public.redes_sucursales s
          JOIN public.configuracion_negocio n ON n.id = s.id_negocio
          LEFT JOIN public.verificacion_negocio v ON v.id_negocio = n.id
          WHERE s.id_red = $1
          ORDER BY s.es_principal DESC, n.id ASC
        `, [red.id])
      : await pool.query(`
          SELECT
            n.id,
            n.nombre_establecimiento,
            n.tipo_servicio,
            n.activo_directorio,
            n.telefono_whatsapp,
            n.correo_contacto,
            n.direccion,
            n.codigo_postal,
            COALESCE(v.estado, 'PENDIENTE') AS estado,
            v.motivo_rechazo,
            TRUE AS es_principal,
            0 AS total_empleados,
            0 AS empleados_activos,
            0 AS total_servicios,
            0 AS total_productos,
            0 AS total_citas,
            0 AS dias_abiertos,
            0 AS dias_cupo_activo
          FROM public.configuracion_negocio n
          LEFT JOIN public.verificacion_negocio v ON v.id_negocio = n.id
          WHERE n.id = $1
        `, [idNegocioSesion]);

    const sucursales = sucursalesRes.rows;
    const preferidaId = Number(idSucursalPreferida);
    const activa =
      sucursales.find((s) => s.id === preferidaId) ||
      sucursales.find((s) => s.id === idNegocioSesion) ||
      sucursales[0] ||
      null;

    let citasHoy = [];
    let solicitudesPendientes = [];
    let productosStockBajo = [];
    let serviciosActivos = [];

    if (activa && activa.estado === 'APROBADO') {
      const [citasRes, solRes, stockRes, srvRes] = await Promise.all([
        pool.query(`
          SELECT
            c.id,
            to_char(c.fecha_hora_programada, 'HH24:MI') AS hora,
            c.estado,
            m.nombre_mascota AS mascota,
            s.nombre_servicio AS servicio
          FROM public.citas c
          LEFT JOIN public.mascotas m ON m.id = c.id_mascota AND m.id_negocio = c.id_negocio
          LEFT JOIN public.servicios s ON s.id = c.id_servicio AND s.id_negocio = c.id_negocio
          WHERE c.id_negocio = $1
            AND c.fecha_hora_programada::date = CURRENT_DATE
          ORDER BY c.fecha_hora_programada ASC, c.id ASC
          LIMIT 6
        `, [activa.id]),
        pool.query(`
          SELECT
            s.id,
            s.nombre_mascota,
            s.telefono,
            s.fecha_solicitada::text AS fecha,
            to_char(s.hora_solicitada, 'HH24:MI') AS hora
          FROM public.solicitudes_cita_publicas s
          LEFT JOIN public.citas c
            ON c.id_solicitud_publica = s.id AND c.id_negocio = s.id_negocio
          WHERE s.id_negocio = $1
            AND c.id IS NULL
            AND s.estado IN ('PENDIENTE', 'ACEPTADA', 'CONFIRMADA')
            AND s.fecha_solicitada >= CURRENT_DATE
          ORDER BY s.fecha_solicitada ASC, s.hora_solicitada ASC
          LIMIT 6
        `, [activa.id]),
        pool.query(`
          SELECT id, nombre_producto, stock_actual, stock_minimo
          FROM public.productos
          WHERE id_negocio = $1 AND stock_actual <= stock_minimo
          ORDER BY stock_actual ASC, nombre_producto ASC
          LIMIT 6
        `, [activa.id]),
        pool.query(`
          SELECT id, nombre_servicio, tiempo_estimado_minutos, precio_base
          FROM public.servicios
          WHERE id_negocio = $1
          ORDER BY nombre_servicio ASC
          LIMIT 8
        `, [activa.id]),
      ]);

      citasHoy = citasRes.rows;
      solicitudesPendientes = solRes.rows;
      productosStockBajo = stockRes.rows;
      serviciosActivos = srvRes.rows;
    }

    return {
      red,
      sucursales,
      activa,
      citasHoy,
      solicitudesPendientes,
      productosStockBajo,
      serviciosActivos,
    };
  }

  /* =========================================================
     INTEGRACIÓN OPCIONAL CON GEMINI 4 (SDK @google/genai)
     ========================================================= */

  let clienteGemini = null;
  async function consultarGemini({ systemInstruction, mensaje, interactionId }) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return null;

    try {
      if (!clienteGemini) {
        const { GoogleGenAI } = await import('@google/genai');
        clienteGemini = new GoogleGenAI({ apiKey });
      }

      const modelo = process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen';
      const interaction = await clienteGemini.interactions.create({
        model: modelo,
        system_instruction: systemInstruction,
        input: mensaje,
        ...(typeof interactionId === 'string' && interactionId.trim()
          ? { previous_interaction_id: interactionId.trim() }
          : {}),
      });

      const texto =
        interaction?.output_text ||
        (Array.isArray(interaction?.steps)
          ? interaction.steps
            .filter((st) => st.type === 'model_output' && Array.isArray(st.content))
            .flatMap((st) => st.content.filter((c) => c.type === 'text').map((c) => c.text))
            .join('\n')
          : '');

      if (!texto || !texto.trim()) return null;

      return {
        texto: texto.trim(),
        interactionId: interaction.id || null,
        origen: 'gemini',
      };
    } catch (err) {
      console.warn('Aviso en consulta Gemini (usando motor contextual local):', err.message);
      return null;
    }
  }

  /* =========================================================
     MOTOR CONTEXTUAL PÚBLICO (CON DATOS EN VIVO DE POSTGRESQL)
     ========================================================= */

  function responderPublicoLocal(mensaje, establecimientos, contextoPrevio = {}, correoSoporte = '') {
    const q = normalizar(mensaje);
    const cpMatch = q.match(/\b(\d{5})\b/);

    // 1. Detectar si menciona un establecimiento específico por nombre o seguimiento
    const negocioMencionado =
      establecimientos.find((est) => {
        const nom = normalizar(est.nombre_establecimiento);
        return nom.length >= 4 && (q.includes(nom) || nom.split(/\s+/).filter((p) => p.length >= 4).some((p) => p !== 'veterinaria' && p !== 'estetica' && p !== 'clinica' && p !== 'canina' && q.includes(p)));
      }) ||
      (contextoPrevio?.ultimoNegocioId &&
        /\b(horario|telefono|whatsapp|direccion|ubicacion|donde|servicio|precio|cita|ese|esa|ahi)\b/.test(q)
        ? establecimientos.find((e) => e.id === Number(contextoPrevio.ultimoNegocioId))
        : null);

    // 2. Urgencias / síntomas veterinarios (orientación responsable + clínicas reales)
    const esUrgenciaGrave = /\b(no respira|ahog|convulsion|veneno|envenen|atropell|sangr|hemorragia|inconsciente|fractura|golpe de calor|hinchad|torsion)/.test(q);
    const esSintomaMascota = esUrgenciaGrave || /\b(vomit|diarrea|fiebre|no quiere comer|no come|decaid|triste\b|cojea|lastim|herida|tos\b|estornud|rasca|pulga|garrapata|infeccion|ojo\b|ojos\b|oido|dolor|enferm|cachorro|gatito|urgencia|emergencia|sintoma)/.test(q);

    if (esSintomaMascota) {
      const veterinarias = establecimientos.filter((e) =>
        ['VETERINARIA', 'AMBAS'].includes(e.tipo_servicio)
      );
      const listaVets = veterinarias.slice(0, 3).map((v) => {
        const tel = v.telefono_whatsapp ? ` · Tel/WhatsApp: ${v.telefono_whatsapp}` : '';
        return `• **${v.nombre_establecimiento}** (CP ${v.codigo_postal || 's/d'})${tel}`;
      });

      const alerta = esUrgenciaGrave
        ? '🚨 **Atención prioritaria:** Los signos que describes pueden corresponder a una **urgencia veterinaria**. Lleva a tu mascota de inmediato a valoración presencial y evita automedicarla.'
        : '🩺 **Orientación preventiva:** Si tu mascota presenta molestias persistentes, lo más seguro es una revisión presencial (evita darle medicamentos de uso humano como paracetamol o ibuprofeno, ya que son tóxicos para perros y gatos).';

      const bloqueClinicas = listaVets.length
        ? `\n\n**Veterinarias verificadas en VetStec que puedes contactar ahora:**\n${listaVets.join('\n')}`
        : '\n\nExplora el **Directorio** para localizar la clínica verificada más cercana a tu ubicación.';

      const acciones = [{ type: 'route', label: 'Ver clínicas en Directorio', to: '/directorio' }];
      if (veterinarias[0]?.telefono_whatsapp) {
        acciones.push({
          type: 'external',
          label: `💬 WhatsApp ${veterinarias[0].nombre_establecimiento}`,
          href: buildWhatsAppUrl(
            veterinarias[0].telefono_whatsapp,
            `Hola ${veterinarias[0].nombre_establecimiento}, los vi en VetStec y necesito orientación para una consulta veterinaria.`
          ),
        });
      }

      return {
        texto: `${alerta}${bloqueClinicas}`,
        actions: acciones,
        sugerencias: ['¿Cómo agendo una cita?', 'Ver todas las veterinarias', 'Horarios de atención'],
        contexto: { ultimoNegocioId: veterinarias[0]?.id || null },
      };
    }

    // 3. Búsqueda por Código Postal
    if (cpMatch) {
      const cp = cpMatch[1];
      const exactos = establecimientos.filter((e) => String(e.codigo_postal || '').trim() === cp);
      const cercanos = !exactos.length
        ? establecimientos.filter((e) => String(e.codigo_postal || '').slice(0, 3) === cp.slice(0, 3))
        : [];

      if (exactos.length) {
        const detalle = exactos.map((e) =>
          `• **${e.nombre_establecimiento}** (${TIPOS_NEGOCIO[e.tipo_servicio] || e.tipo_servicio}) — ${e.direccion || 'Dirección registrada'} · ${resumirHorario(e.horarios)}`
        ).join('\n');

        return {
          texto: `Encontré **${exactos.length}** establecimiento(s) verificado(s) en el código postal **${cp}**:\n\n${detalle}`,
          actions: [{ type: 'route', label: 'Abrir Directorio', to: '/directorio' }],
          sugerencias: [`Servicios de ${exactos[0].nombre_establecimiento}`, '¿Cómo agendo una cita?'],
          contexto: { ultimoNegocioId: exactos[0].id },
        };
      }

      if (cercanos.length) {
        const detalle = cercanos.slice(0, 3).map((e) =>
          `• **${e.nombre_establecimiento}** (CP ${e.codigo_postal}) — ${TIPOS_NEGOCIO[e.tipo_servicio] || e.tipo_servicio}`
        ).join('\n');

        return {
          texto: `No hay establecimientos registrados exactamente en el CP **${cp}**, pero encontré opciones en zonas cercanas:\n\n${detalle}`,
          actions: [{ type: 'route', label: 'Ver en el Directorio', to: '/directorio' }],
          sugerencias: ['Ver todas las clínicas', 'Registrar mi veterinaria'],
          contexto: { ultimoNegocioId: cercanos[0].id },
        };
      }

      return {
        texto: `Por ahora no tenemos establecimientos registrados en el CP **${cp}**. Actualmente contamos con **${establecimientos.length}** opciones verificadas que puedes consultar en el Directorio.`,
        actions: [{ type: 'route', label: 'Explorar Directorio completo', to: '/directorio' }],
        sugerencias: ['¿Qué veterinarias hay disponibles?', '¿Qué estéticas hay?'],
        contexto: {},
      };
    }

    // 4. Consulta sobre un establecimiento específico
    if (negocioMencionado) {
      const srvs = Array.isArray(negocioMencionado.servicios) ? negocioMencionado.servicios : [];
      const textoServicios = srvs.length
        ? srvs.slice(0, 5).map((s) => `• ${s.nombre}${s.duracion_min ? ` (${s.duracion_min} min)` : ''}${s.precio != null ? ` — **${formatearMoneda(s.precio)}**` : ''}`).join('\n')
        : '• Aún no ha publicado su lista detallada de servicios, pero puedes consultarle directo por WhatsApp.';

      const acciones = [{ type: 'route', label: 'Ver ficha y agendar', to: '/directorio' }];
      if (negocioMencionado.telefono_whatsapp) {
        acciones.push({
          type: 'external',
          label: '💬 Escribir por WhatsApp',
          href: buildWhatsAppUrl(
            negocioMencionado.telefono_whatsapp,
            `Hola ${negocioMencionado.nombre_establecimiento}, los encontré en VetStec y me gustaría pedir informes.`
          ),
        });
      }

      return {
        texto: [
          `**${negocioMencionado.nombre_establecimiento}** (${TIPOS_NEGOCIO[negocioMencionado.tipo_servicio] || negocioMencionado.tipo_servicio})`,
          `• **Dirección:** ${negocioMencionado.direccion || 'No especificada'}${negocioMencionado.codigo_postal ? ` · CP ${negocioMencionado.codigo_postal}` : ''}`,
          `• **Horario:** ${resumirHorario(negocioMencionado.horarios)}`,
          `• **Disponibilidad en línea:** ${negocioMencionado.dias_con_cupo > 0 ? `${negocioMencionado.dias_con_cupo} día(s) con cupo abierto esta semana` : 'Consulta disponibilidad directa'}`,
          ``,
          `**Servicios registrados:**`,
          textoServicios,
        ].join('\n'),
        actions: acciones,
        sugerencias: ['¿Cómo agendo una cita?', 'Ver otros establecimientos'],
        contexto: { ultimoNegocioId: negocioMencionado.id },
      };
    }

    // 5. Búsqueda de servicios o precios (vacunas, baño, corte, consulta, etc.)
    if (/\b(vacun|desparasit|consulta|esteriliz|cirugia|limpieza dental|bano|corte|unas|peluqueria|precio|cuanto cuesta|costo)/.test(q)) {
      if (/\b(gratis|uso|plataforma|crear cuenta|registrarse)\b/.test(q)) {
        return {
          texto: 'El uso de **VetStec** para dueños de mascotas (explorar el directorio, revisar horarios y solicitar citas) es **100 % gratuito** y no requiere crear cuenta. El costo de cada consulta o estética lo define directamente cada establecimiento.',
          actions: [{ type: 'route', label: 'Explorar Directorio', to: '/directorio' }],
          sugerencias: ['¿Qué servicios ofrecen las clínicas?', '¿Cómo agendo una cita?'],
          contexto: {},
        };
      }

      const coincidencias = [];
      for (const est of establecimientos) {
        for (const srv of est.servicios || []) {
          const nSrv = normalizar(srv.nombre);
          if (
            q.split(/\s+/).some((tok) => tok.length >= 4 && nSrv.includes(tok)) ||
            /\b(servicio|servicios|precio|precios|cuanto cuesta)\b/.test(q)
          ) {
            coincidencias.push({
              negocio: est.nombre_establecimiento,
              idNegocio: est.id,
              servicio: srv.nombre,
              precio: srv.precio,
              duracion: srv.duracion_min,
            });
          }
        }
      }

      if (coincidencias.length) {
        const muestra = coincidencias.slice(0, 5).map((m) =>
          `• **${m.servicio}** en *${m.negocio}*${m.duracion ? ` (${m.duracion} min)` : ''}${m.precio != null ? ` — **${formatearMoneda(m.precio)}**` : ''}`
        ).join('\n');

        return {
          texto: `Estos son algunos **servicios y precios reales** publicados actualmente por nuestros establecimientos verificados:\n\n${muestra}`,
          actions: [{ type: 'route', label: 'Agendar en el Directorio', to: '/directorio' }],
          sugerencias: [`Ver datos de ${coincidencias[0].negocio}`, '¿Cómo agendo una cita?'],
          contexto: { ultimoNegocioId: coincidencias[0].idNegocio },
        };
      }
    }

    // 6. Consultar clínicas veterinarias o estéticas disponibles en el directorio
    if (/\b(veterinari|estetic|clinic|directorio|establecimiento|disponibl|cerca|recomiend|donde llevar|opcion)/.test(q)) {
      const soloEstetica = /\bestetica/.test(q) && !/\bveterinaria/.test(q);
      const soloVet = /\bveterinaria|\bclinica/.test(q) && !/\bestetica/.test(q);

      const filtrados = establecimientos.filter((e) => {
        if (soloEstetica) return ['ESTETICA', 'AMBAS'].includes(e.tipo_servicio);
        if (soloVet) return ['VETERINARIA', 'AMBAS'].includes(e.tipo_servicio);
        return true;
      });

      if (!filtrados.length) {
        return {
          texto: 'En este momento aún no hay establecimientos publicados con ese filtro, pero puedes revisar el Directorio completo o registrar tu negocio.',
          actions: [{ type: 'route', label: 'Ir al Directorio', to: '/directorio' }],
          sugerencias: ['Registrar mi veterinaria', 'Contactar soporte'],
          contexto: {},
        };
      }

      const listado = filtrados.slice(0, 4).map((e) =>
        `• **${e.nombre_establecimiento}** (${TIPOS_NEGOCIO[e.tipo_servicio] || e.tipo_servicio}${e.codigo_postal ? ` · CP ${e.codigo_postal}` : ''}) — ${resumirHorario(e.horarios)}`
      ).join('\n');

      return {
        texto: `Actualmente tenemos **${filtrados.length}** establecimiento(s) verificado(s)${soloEstetica ? ' de estética' : soloVet ? ' veterinarios' : ''}:\n\n${listado}\n\nPuedes preguntarme por cualquiera de ellos o escribir tu **código postal de 5 dígitos** para filtrar por zona.`,
        actions: [{ type: 'route', label: 'Explorar en Directorio', to: '/directorio' }],
        sugerencias: filtrados[0]
          ? [`Información de ${filtrados[0].nombre_establecimiento}`, '¿Cómo agendo una cita?']
          : ['¿Cómo agendo una cita?'],
        contexto: { ultimoNegocioId: filtrados[0]?.id || null },
      };
    }

    // 7. Cómo agendar o consultar disponibilidad de citas
    if (/\b(cita|citas|agendar|reservar|reserva|cupo|horario|horarios|disponibilidad)\b/.test(q)) {
      const conCupo = establecimientos.filter((e) => Number(e.dias_con_cupo) > 0);
      const extraCupo = conCupo.length
        ? `\n\n📌 **Con agenda abierta esta semana:** ${conCupo.slice(0, 3).map((e) => `*${e.nombre_establecimiento}*`).join(', ')}.`
        : '';

      return {
        texto: `Para **solicitar una cita** sin crear cuenta:\n• **1.** Entra al **Directorio** y abre el establecimiento que prefieras.\n• **2.** Ve a la pestaña **📅 Citas**, elige un día disponible y selecciona la hora.\n• **3.** Escribe el nombre de tu mascota y tu teléfono/WhatsApp para enviar la solicitud.${extraCupo}`,
        actions: [{ type: 'route', label: 'Ir a agendar al Directorio', to: '/directorio' }],
        sugerencias: ['¿Qué veterinarias hay disponibles?', '¿Tiene costo usar VetStec?'],
        contexto: { ultimoNegocioId: conCupo[0]?.id || null },
      };
    }

    // 8. Registrar negocio / soy propietario / iniciar sesión
    if (/\b(registrar|registro|dar de alta|mi veterinaria|mi estetica|mi clinica|soy dueno|soy propietario|iniciar sesion|acceso|entrar a mi cuenta)\b/.test(q)) {
      const esLogin = /\b(iniciar sesion|acceso|entrar a mi cuenta|ya tengo cuenta|login)\b/.test(q);
      if (esLogin) {
        return {
          texto: 'Si ya registraste y verificaste tu establecimiento, entra desde **Iniciar sesión** para abrir tu **Panel del Propietario** y administrar citas, servicios, productos y horarios.',
          actions: [{ type: 'route', label: 'Iniciar sesión', to: '/acceso' }],
          sugerencias: ['Registrar un nuevo establecimiento', 'Problemas con mi cuenta'],
          contexto: {},
        };
      }

      return {
        texto: 'Para **registrar tu veterinaria o estética canina** en VetStec:\n• **1.** Elige tu categoría y captura datos de contacto y dirección con pin en el mapa.\n• **2.** Adjunta tu respaldo (cédula profesional para veterinarias o fotografía de fachada para estéticas).\n• **3.** Verifica tu correo con el código de 6 dígitos; nuestro equipo aprobará tu solicitud para publicarte en el Directorio.',
        actions: [{ type: 'route', label: 'Registrar establecimiento', to: '/registro' }],
        sugerencias: ['Ya tengo cuenta, iniciar sesión', 'Contactar a VetStec'],
        contexto: {},
      };
    }

    // 9. Contacto / soporte / correo oficial
    if (/\b(contacto|soporte|correo|email|queja|sugerencia|ayuda|humano|vincular|problema)\b/.test(q)) {
      const acciones = [{ type: 'route', label: 'Abrir formulario de Contacto', to: '/contacto' }];
      if (correoSoporte) {
        acciones.push({
          type: 'external',
          label: `✉️ ${correoSoporte}`,
          href: `mailto:${correoSoporte}?subject=${encodeURIComponent('Consulta desde Asistente VetStec')}`,
        });
      }

      return {
        texto: `Puedes comunicarte directamente con el equipo de **VetStec** desde nuestra sección de **Contacto**${correoSoporte ? ` o escribirnos al correo oficial **${correoSoporte}**` : ''}. Cada mensaje genera un folio de atención y recibe respuesta directa en tu correo.`,
        actions: acciones,
        sugerencias: ['Explorar Directorio', 'Registrar mi establecimiento'],
        contexto: {},
      };
    }

    // 10. Saludos / agradecimiento / ayuda general
    if (/\b(hola|buenos dias|buenas tardes|buenas noches|que tal|hey|gracias|muchas gracias|que haces|quien eres)\b/.test(q)) {
      if (/\bgracias\b/.test(q)) {
        return {
          texto: '¡Con gusto! 🐾 Si necesitas buscar otra clínica, revisar precios de servicios o agendar una cita, aquí sigo para ayudarte.',
          actions: [{ type: 'route', label: 'Ir al Directorio', to: '/directorio' }],
          sugerencias: ['Ver veterinarias disponibles', '¿Cómo agendo una cita?'],
          contexto: contextoPrevio || {},
        };
      }

      return {
        texto: `¡Hola! 🐾 Soy el asistente inteligente de **VetStec**. Estoy conectado en tiempo real con los **${establecimientos.length}** establecimientos verificados de la plataforma.\n\nPuedo ayudarte a:\n• Buscar **veterinarias o estéticas** (por nombre o código postal).\n• Consultar **servicios, precios y horarios** reales.\n• Darte orientación inicial si tu mascota tiene algún síntoma.\n• Guiarte para **agendar citas** o **registrar tu negocio**.`,
        actions: [{ type: 'route', label: 'Explorar Directorio', to: '/directorio' }],
        sugerencias: ['¿Qué veterinarias hay disponibles?', '¿Qué servicios y precios hay?', '¿Cómo agendo una cita?'],
        contexto: {},
      };
    }

    // Fallback inteligente con contexto real
    return {
      texto: `Puedo ayudarte a consultar información real de nuestros **${establecimientos.length}** establecimientos activos, buscar por **código postal** (ej. *09300*), revisar **precios de servicios**, orientarte ante síntomas en tu mascota o guiarte para **agendar una cita**. ¿Qué te gustaría consultar?`,
      actions: [
        { type: 'route', label: 'Ver Directorio', to: '/directorio' },
        { type: 'route', label: 'Contacto VetStec', to: '/contacto' },
      ],
      sugerencias: ['Ver veterinarias disponibles', '¿Qué servicios y precios hay?', 'Registrar mi veterinaria'],
      contexto: contextoPrevio || {},
    };
  }

  /* =========================================================
     MOTOR CONTEXTUAL DEL PROPIETARIO (CON DATOS DE SU SUCURSAL)
     ========================================================= */

  function responderPropietarioLocal(mensaje, snap, correoSoporte = '') {
    const q = normalizar(mensaje);
    const s = snap.activa;

    if (!s) {
      return {
        texto: 'No encontré una sucursal activa vinculada todavía. Si acabas de registrarte o necesitas vincular tu establecimiento, contáctanos desde Soporte.',
        actions: [{ type: 'route', label: 'Contactar soporte', to: '/contacto' }],
        sugerencias: ['¿Cómo funciona la verificación?'],
      };
    }

    const esAprobada = s.estado === 'APROBADO';

    // 1. Diagnóstico general / resumen operativo en vivo
    if (/\b(diagnostico|resumen|como va|estado|que me falta|pendient|hoy\b|general|hola\b|buenos dias|buenas tardes|buenas noches|ayuda\b)/.test(q) && !/\b(stock|inventario|producto)/.test(q)) {
      if (!esAprobada) {
        return {
          texto: [
            `📋 **Estado actual de “${s.nombre_establecimiento}”:** **${s.estado}**`,
            s.motivo_rechazo ? `• **Observación de revisión:** ${s.motivo_rechazo}` : '• Tu solicitud se encuentra en proceso de validación por el equipo de VetStec.',
            `• Una vez aprobada se desbloquearán automáticamente tus módulos de **Citas**, **Servicios**, **Productos** y **Personal y horarios**.`,
          ].join('\n'),
          actions: s.estado === 'RECHAZADO'
            ? [{ type: 'panel-tab', label: '📋 Ver ficha general', tab: 'resumen' }]
            : [{ type: 'route', label: 'Contactar soporte', to: '/contacto' }],
          sugerencias: ['¿Cómo aparezco en el directorio?', 'Editar datos de mi sucursal'],
        };
      }

      const alertas = [];
      if (Number(s.total_servicios) === 0) alertas.push('⚠️ Aún no tienes **servicios** registrados.');
      if (Number(s.empleados_activos) === 0) alertas.push('⚠️ No tienes **personal activo** para asignar citas.');
      if (Number(s.dias_abiertos) === 0) alertas.push('⚠️ Tu **horario semanal** tiene todos los días cerrados.');
      if (Number(s.dias_cupo_activo) === 0) alertas.push('⚠️ No has publicado **cupo diario** para los próximos 7 días.');
      if (snap.solicitudesPendientes.length > 0) {
        alertas.push(`🔔 Tienes **${snap.solicitudesPendientes.length}** solicitud(es) web esperando confirmación.`);
      }
      if (snap.productosStockBajo.length > 0) {
        alertas.push(`📦 Tienes **${snap.productosStockBajo.length}** producto(s) con stock bajo o agotado.`);
      }

      const estadoOperativo = alertas.length
        ? alertas.join('\n')
        : '✅ ¡Todo en orden! Tienes servicios, equipo, horarios y cupo configurados sin alertas críticas.';

      const acciones = [];
      if (snap.solicitudesPendientes.length > 0 || snap.citasHoy.length > 0) {
        acciones.push({ type: 'panel-tab', label: '📅 Abrir Citas y Agenda', tab: 'citas' });
      } else if (Number(s.total_servicios) === 0) {
        acciones.push({ type: 'panel-tab', label: '🩺 Registrar Servicios', tab: 'servicios' });
      } else if (Number(s.dias_abiertos) === 0 || Number(s.empleados_activos) === 0) {
        acciones.push({ type: 'panel-tab', label: '👩‍⚕️ Configurar Personal y Horarios', tab: 'personal' });
      } else if (snap.productosStockBajo.length > 0) {
        acciones.push({ type: 'panel-tab', label: '🛍️ Ver Productos', tab: 'productos' });
      }

      return {
        texto: [
          `🩺 **Resumen en vivo de “${s.nombre_establecimiento}”**`,
          `• **Directorio público:** ${s.activo_directorio ? '🟢 Visible' : '⚪ Oculta'}`,
          `• **Citas hoy:** ${snap.citasHoy.length} programada(s) · **Solicitudes por confirmar:** ${snap.solicitudesPendientes.length}`,
          `• **Catálogo y equipo:** ${s.total_servicios} servicio(s), ${s.total_productos} producto(s), ${s.empleados_activos} integrante(s) activo(s), ${s.dias_abiertos}/7 días abiertos.`,
          ``,
          estadoOperativo,
        ].join('\n'),
        actions: acciones,
        sugerencias: [
          '¿Tengo citas o solicitudes hoy?',
          '¿Qué productos tienen stock bajo?',
          '¿Por qué aparezco o no en el directorio?',
        ],
      };
    }

    // 2. Visibilidad en el directorio y verificación
    if (/\b(directorio|aparecer|aparezco|visibl|publica|verificac|aproba)/.test(q)) {
      const checks = [
        `${esAprobada ? '✅' : '⏳'} **Verificación VetStec:** ${s.estado}`,
        `${s.activo_directorio ? '✅' : '⚠️'} **Publicación en directorio:** ${s.activo_directorio ? 'Activada' : 'Inactiva'}`,
        `${Number(s.total_servicios) > 0 ? '✅' : '⚠️'} **Servicios en ficha:** ${s.total_servicios} registrado(s)`,
        `${Number(s.dias_abiertos) > 0 ? '✅' : '⚠️'} **Horario de atención:** ${s.dias_abiertos}/7 días abiertos`,
        `${Number(s.dias_cupo_activo) > 0 ? '✅' : 'ℹ️'} **Cupo de citas web:** ${s.dias_cupo_activo} día(s) con reservas activas esta semana`,
      ];

      return {
        texto: `Estado de presencia pública para **${s.nombre_establecimiento}**:\n\n${checks.join('\n')}\n\nRecuerda: editar teléfono, correo o descripción conserva tu aprobación, mientras que cambiar nombre, categoría o dirección envía la sucursal a una nueva revisión.`,
        actions: esAprobada
          ? [{ type: 'panel-tab', label: '📋 Ver Vista General', tab: 'resumen' }]
          : [],
        sugerencias: ['Diagnóstico de mi sucursal', 'Publicar cupo de citas'],
      };
    }

    // 3. Citas, solicitudes web, cupo diario y WhatsApp a clientes
    if (/\b(cita|citas|solicitud|solicitudes|agenda|cupo|reservas|whatsapp|cliente|confirmar)\b/.test(q)) {
      if (!esAprobada) {
        return {
          texto: `El módulo de **Citas y agenda** se habilitará en cuanto **${s.nombre_establecimiento}** cambie su estado de **${s.estado}** a **APROBADO**.`,
          actions: [],
          sugerencias: ['¿Cómo aparezco en el directorio?'],
        };
      }

      const lineasCitas = snap.citasHoy.length
        ? snap.citasHoy.map((c) => `• **${c.hora.slice(0, 5)}** — ${c.mascota || 'Mascota'} (${c.servicio || 'Servicio'}) · *${c.estado}*`).join('\n')
        : '• No tienes citas confirmadas para el día de hoy.';

      const lineasSol = snap.solicitudesPendientes.length
        ? snap.solicitudesPendientes.map((sol) => `• **${sol.fecha} ${sol.hora.slice(0, 5)}** — Mascota: *${sol.nombre_mascota}* (Tel. ${sol.telefono})`).join('\n')
        : '• No hay solicitudes web pendientes de confirmar.';

      return {
        texto: [
          `📅 **Agenda de “${s.nombre_establecimiento}”**`,
          `• **Días con cupo web activo (próximos 7 días):** ${s.dias_cupo_activo}`,
          ``,
          `**Solicitudes web pendientes (${snap.solicitudesPendientes.length}):**`,
          lineasSol,
          ``,
          `**Citas programadas hoy (${snap.citasHoy.length}):**`,
          lineasCitas,
          ``,
          `💡 En la tabla de citas puedes pulsar **✓ Confirmar** para asignar servicio/personal y **💬 WhatsApp** para avisarle al cliente en un clic.`,
        ].join('\n'),
        actions: [{ type: 'panel-tab', label: '📅 Ir a Citas y Agenda', tab: 'citas' }],
        sugerencias: ['Configurar horarios semanales', 'Diagnóstico de mi sucursal'],
      };
    }

    // 4. Productos, inventario y alertas de stock bajo
    if (/\b(producto|inventario|stock|existencia|agotad|entrada|salida|movimiento|merma|caducidad)/.test(q)) {
      if (!esAprobada) {
        return {
          texto: 'El control de **Productos e inventario** estará disponible en cuanto tu sucursal sea aprobada.',
          actions: [],
          sugerencias: ['Estado de mi sucursal'],
        };
      }

      const detalleStock = snap.productosStockBajo.length
        ? `⚠️ **Artículos con stock bajo o agotado:**\n` +
        snap.productosStockBajo.map((p) => `• **${p.nombre_producto}** — Existencia: **${p.stock_actual}** (mínimo: ${p.stock_minimo})`).join('\n')
        : '✅ Todos tus productos registrados están por encima del stock mínimo configurado.';

      return {
        texto: [
          `🛍️ **Inventario interno de “${s.nombre_establecimiento}”**`,
          `• **Total de artículos registrados:** ${s.total_productos}`,
          ``,
          detalleStock,
          ``,
          `Para sumar compras o descontar ventas/mermas, entra a **Productos** y pulsa **📦 Movimientos** en el artículo correspondiente.`,
        ].join('\n'),
        actions: [{ type: 'panel-tab', label: '🛍️ Abrir Productos e Inventario', tab: 'productos' }],
        sugerencias: ['Revisar servicios activos', 'Diagnóstico de mi sucursal'],
      };
    }

    // 5. Servicios y precios
    if (/\b(servicio|servicios|catalogo|consulta|bano|corte|precio|duracion)\b/.test(q)) {
      if (!esAprobada) {
        return {
          texto: 'Podrás dar de alta tus **Servicios** en cuanto tu sucursal quede aprobada por VetStec.',
          actions: [],
          sugerencias: ['Estado de mi sucursal'],
        };
      }

      const listaSrv = snap.serviciosActivos.length
        ? snap.serviciosActivos.slice(0, 5).map((sv) =>
          `• **${sv.nombre_servicio}** (${sv.tiempo_estimado_minutos} min) — **${formatearMoneda(sv.precio_base)}**`
        ).join('\n')
        : '• Aún no has dado de alta ningún servicio. Registra al menos uno para poder agendar citas y mostrarlos en el Directorio.';

      return {
        texto: `🩺 **Catálogo de servicios (${s.total_servicios} en total):**\n\n${listaSrv}`,
        actions: [{ type: 'panel-tab', label: '🩺 Ir a Servicios', tab: 'servicios' }],
        sugerencias: ['Configurar personal y horarios', 'Abrir agenda de citas'],
      };
    }

    // 6. Personal, equipo y horarios semanales
    if (/\b(horario|horarios|personal|empleado|empleados|equipo|integrante|veterinario|estilista|apertura|cierre|lunes|domingo)\b/.test(q)) {
      if (!esAprobada) {
        return {
          texto: 'El módulo de **Personal y horarios** se desbloquea automáticamente al aprobarse tu sucursal.',
          actions: [],
          sugerencias: ['Estado de mi sucursal'],
        };
      }

      return {
        texto: [
          `👩‍⚕️ **Equipo y horarios de “${s.nombre_establecimiento}”**`,
          `• **Personal activo:** ${s.empleados_activos} de ${s.total_empleados} registrado(s)`,
          `• **Horario semanal:** ${s.dias_abiertos} de 7 días abiertos al público`,
          ``,
          `En **Personal y horarios** tienes dos subpestañas: **👥 Equipo de trabajo** (para dar de alta veterinarios o estilistas) y **🕒 Horario semanal** (incluye el botón rápido *⚡ Copiar Lunes a Viernes*).`,
        ].join('\n'),
        actions: [{ type: 'panel-tab', label: '👩‍⚕️ Abrir Personal y Horarios', tab: 'personal' }],
        sugerencias: ['Publicar cupo de citas', 'Diagnóstico de mi sucursal'],
      };
    }

    // 7. Sucursales adicionales / edición / soporte
    if (/\b(sucursal|sucursales|agregar sucursal|editar|direccion|mapa|telefono|soporte|contacto)\b/.test(q)) {
      return {
        texto: `Actualmente tu red (**${snap.red?.nombre || s.nombre_establecimiento}**) cuenta con **${snap.sucursales.length}** sucursal(es) vinculada(s).\n• Usa **+ Nueva sucursal** arriba a la derecha para registrar otra ubicación.\n• Usa **✎ Editar datos y ubicación** para actualizar teléfono, descripción o punto en el mapa.${correoSoporte ? `\n• Si necesitas soporte técnico escríbenos a **${correoSoporte}**.` : ''}`,
        actions: [
          { type: 'panel-tab', label: '📋 Ir a Vista General', tab: 'resumen' },
          { type: 'route', label: 'Soporte VetStec', to: '/contacto' },
        ],
        sugerencias: ['Diagnóstico de mi sucursal', '¿Tengo citas o solicitudes hoy?'],
      };
    }

    // Fallback operativo inteligente con métricas reales
    return {
      texto: `Estoy conectado en vivo con **${s.nombre_establecimiento}** (${s.total_servicios} servicios, ${s.total_productos} productos, ${snap.solicitudesPendientes.length} solicitudes web pendientes y ${snap.citasHoy.length} citas hoy). Pregúntame por tu **agenda de hoy**, **stock bajo**, **horarios** o pide un **diagnóstico completo**.`,
      actions: esAprobada
        ? [
          { type: 'panel-tab', label: '📅 Ver Citas', tab: 'citas' },
          { type: 'panel-tab', label: '🛍️ Ver Inventario', tab: 'productos' },
        ]
        : [],
      sugerencias: [
        'Diagnóstico de mi sucursal',
        '¿Tengo citas o solicitudes hoy?',
        '¿Qué productos tienen stock bajo?',
      ],
    };
  }

  /* =========================================================
     ENDPOINTS REST DE LOS ASISTENTES IA
     ========================================================= */

  app.post('/api/asistente/publico', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!verificarLimiteIp(req.ip)) {
      return res.status(429).json({
        success: false,
        message: 'Has enviado muchos mensajes seguidos. Espera unos segundos e inténtalo de nuevo.',
      });
    }

    const mensaje = typeof req.body?.mensaje === 'string' ? req.body.mensaje.trim() : '';
    if (!mensaje || mensaje.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Escribe una consulta de hasta 500 caracteres.',
      });
    }

    try {
      const establecimientos = await obtenerSnapshotPublico();
      const correoSoporte = obtenerCorreoContacto?.() || '';
      const baseLocal = responderPublicoLocal(
        mensaje,
        establecimientos,
        req.body?.contexto || {},
        correoSoporte
      );

      const resumenBd = establecimientos
        .slice(0, 20)
        .map((e) => {
          const srvs = (e.servicios || [])
            .slice(0, 6)
            .map((s) => `${s.nombre} ($${Number(s.precio).toFixed(0)}, ${s.duracion_min}m)`)
            .join('; ');
          return `- #${e.id} ${e.nombre_establecimiento} [${TIPOS_NEGOCIO[e.tipo_servicio] || e.tipo_servicio}] | CP: ${e.codigo_postal || 's/d'} | Dir: ${e.direccion || 's/d'} | WhatsApp: ${e.telefono_whatsapp || 's/d'} | Horario: ${resumirHorario(e.horarios)} | Cupo 7d: ${e.dias_con_cupo} días | Servicios: ${srvs || 'sin lista publicada'}`;
        })
        .join('\n');

      const respuestaLLM = await consultarGemini({
        systemInstruction: [
          'Eres el Asistente Virtual Público de VetStec (plataforma web mexicana de directorio y citas para veterinarias y estéticas caninas).',
          'Responde SIEMPRE en español claro, cálido, conciso (máximo 120 palabras) y usando viñetas cortas o **negritas** cuando ayude a la lectura.',
          'REGLAS ESTRICTAS:',
          '1) Usa ÚNICAMENTE los establecimientos reales listados abajo; nunca inventes clínicas, teléfonos ni precios.',
          '2) En el Directorio público solo se muestran Servicios y Citas (NO hay venta pública de productos en el directorio).',
          '3) Solicitar citas en el Directorio es 100% gratuito y sin crear cuenta.',
          '4) Si describen síntomas graves en una mascota, indica acudir de inmediato a valoración presencial, no automedicar y sugiere las veterinarias reales disponibles.',
          correoSoporte ? `5) Correo oficial de soporte VetStec: ${correoSoporte} (sección /contacto).` : '',
          '',
          `ESTABLECIMIENTOS ACTIVOS EN DIRECTORIO (${establecimientos.length}):`,
          resumenBd || 'Sin establecimientos publicados en este momento.',
        ].join('\n'),
        mensaje,
        interactionId: req.body?.interactionId,
      });

      return res.json({
        success: true,
        data: {
          respuesta: respuestaLLM ? respuestaLLM.texto : baseLocal.texto,
          actions: baseLocal.actions || [],
          sugerencias: baseLocal.sugerencias || [],
          contexto: baseLocal.contexto || {},
          interactionId: respuestaLLM?.interactionId || null,
          modo: respuestaLLM ? 'gemini' : 'contextual-bd',
        },
      });
    } catch (error) {
      console.error('Error en asistente público:', error.message);
      return res.status(500).json({
        success: false,
        message: 'No pude consultar la información en este momento. Intenta nuevamente.',
      });
    }
  });

  app.post('/api/asistente/propietario', requireSesion, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const mensaje = typeof req.body?.mensaje === 'string' ? req.body.mensaje.trim() : '';
    if (!mensaje || mensaje.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Escribe una consulta de hasta 500 caracteres.',
      });
    }

    try {
      const snap = await obtenerSnapshotPropietario(
        req.auth.usuario.id,
        req.auth.negocio.id,
        req.body?.idSucursal
      );
      const correoSoporte = obtenerCorreoContacto?.() || '';
      const baseLocal = responderPropietarioLocal(mensaje, snap, correoSoporte);

      const s = snap.activa;
      const contextoPropietario = s
        ? [
          `Sucursal activa: #${s.id} "${s.nombre_establecimiento}" (${TIPOS_NEGOCIO[s.tipo_servicio] || s.tipo_servicio})`,
          `Estado verificación: ${s.estado}${s.motivo_rechazo ? ` | Motivo rechazo: ${s.motivo_rechazo}` : ''}`,
          `Visible en directorio: ${s.activo_directorio ? 'Sí' : 'No'} | Total sucursales en red: ${snap.sucursales.length}`,
          `Métricas: ${s.total_servicios} servicios, ${s.total_productos} productos, ${s.empleados_activos}/${s.total_empleados} empleados activos, ${s.dias_abiertos}/7 días abiertos, ${s.dias_cupo_activo} días con cupo web próximo.`,
          `Solicitudes web pendientes (${snap.solicitudesPendientes.length}): ${snap.solicitudesPendientes.map((x) => `${x.fecha} ${x.hora.slice(0, 5)} ${x.nombre_mascota}`).join(', ') || 'ninguna'}`,
          `Citas hoy (${snap.citasHoy.length}): ${snap.citasHoy.map((c) => `${c.hora.slice(0, 5)} ${c.mascota || ''} (${c.estado})`).join(', ') || 'ninguna'}`,
          `Productos con stock bajo/agotado (${snap.productosStockBajo.length}): ${snap.productosStockBajo.map((p) => `${p.nombre_producto} (${p.stock_actual}/${p.stock_minimo})`).join(', ') || 'ninguno'}`,
        ].join('\n')
        : 'Sin sucursal activa encontrada.';

      const respuestaLLM = await consultarGemini({
        systemInstruction: [
          'Eres el Copiloto Operativo para Propietarios de VetStec.',
          'Responde SIEMPRE en español claro, ejecutivo, práctico (máximo 130 palabras) usando viñetas y **negritas**.',
          'Usa los datos reales en vivo de la sucursal del propietario incluidos abajo para responder con precisión exacta (nombres reales de productos con stock bajo, citas de hoy, solicitudes pendientes, requisitos faltantes).',
          'Nota importante: los productos se administran solo como inventario interno en el panel; en el Directorio público únicamente aparecen Servicios y Citas.',
          '',
          'DATOS EN VIVO DE LA SUCURSAL DEL PROPIETARIO:',
          contextoPropietario,
        ].join('\n'),
        mensaje,
        interactionId: req.body?.interactionId,
      });

      return res.json({
        success: true,
        data: {
          respuesta: respuestaLLM ? respuestaLLM.texto : baseLocal.texto,
          actions: baseLocal.actions || [],
          sugerencias: baseLocal.sugerencias || [],
          interactionId: respuestaLLM?.interactionId || null,
          modo: respuestaLLM ? 'gemini' : 'contextual-bd',
        },
      });
    } catch (error) {
      console.error('Error en copiloto propietario:', error.message);
      return res.status(500).json({
        success: false,
        message: 'No pude consultar los datos operativos de tu sucursal. Intenta nuevamente.',
      });
    }
  });
};
