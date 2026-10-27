const { createHash } = require('node:crypto');
const { reservas, minutos } = require('../lib/agendaCitas');

const fallo = (status, message) =>
  Object.assign(new Error(message), { status });

const entero = n =>
  Number.isInteger(n) && n > 0 && n <= 2147483647;

function texto(v, max) {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    v.trim().length > max
  ) {
    throw fallo(
      400,
      'Completa los textos obligatorios sin exceder su longitud.'
    );
  }

  return v.trim();
}

async function fechaValida(db, fecha) {
  if (
    typeof fecha !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha)
  ) {
    throw fallo(400, 'Fecha inválida.');
  }

  await db.query('SELECT $1::date', [fecha]);
}

async function consultar(db, id, fecha) {
  const citas = await db.query(`
    SELECT
      c.id,
      c.id_mascota,
      c.id_empleado,
      c.id_servicio,
      c.id_solicitud_publica,
      c.estado,
      to_char(c.fecha_hora_programada,'YYYY-MM-DD') AS fecha,
      to_char(c.fecha_hora_programada,'HH24:MI') AS hora,
      m.nombre_mascota,
      cl.nombre_dueno,
      e.nombre || ' ' || e.apellido AS empleado,
      s.nombre_servicio,
      t.hora_inicio::text,
      t.hora_fin::text,
      t.duracion_real_minutos
    FROM public.citas c
    LEFT JOIN public.mascotas m
      ON m.id=c.id_mascota
      AND m.id_negocio=c.id_negocio
    LEFT JOIN public.clientes cl
      ON cl.id=m.id_cliente
      AND cl.id_negocio=c.id_negocio
    LEFT JOIN public.empleados e
      ON e.id=c.id_empleado
      AND e.id_negocio=c.id_negocio
    LEFT JOIN public.servicios s
      ON s.id=c.id_servicio
      AND s.id_negocio=c.id_negocio
    LEFT JOIN public.cronometro_servicios t
      ON t.id_cita=c.id
      AND t.id_negocio=c.id_negocio
    WHERE c.id_negocio=$1
      AND c.fecha_hora_programada::date=$2::date
    ORDER BY c.fecha_hora_programada,c.id
  `, [id, fecha]);

  const solicitudes = await db.query(`
    SELECT
      s.id,
      s.nombre_mascota,
      s.telefono,
      s.estado,
      s.fecha_solicitada::text AS fecha,
      s.hora_solicitada::text AS hora,
      c.id AS id_cita
    FROM public.solicitudes_cita_publicas s
    LEFT JOIN public.citas c
      ON c.id_solicitud_publica=s.id
      AND c.id_negocio=s.id_negocio
    WHERE s.id_negocio=$1
      AND s.fecha_solicitada=$2::date
    ORDER BY s.hora_solicitada,s.id
  `, [id, fecha]);

  const mascotas = await db.query(`
    SELECT
      m.id,
      m.nombre_mascota,
      cl.nombre_dueno,
      cl.telefono_celular
    FROM public.mascotas m
    JOIN public.clientes cl
      ON cl.id=m.id_cliente
      AND cl.id_negocio=m.id_negocio
    WHERE m.id_negocio=$1
    ORDER BY m.nombre_mascota,m.id
  `, [id]);

  const servicios = await db.query(`
    SELECT
      id,
      nombre_servicio,
      tipo_servicio,
      tiempo_estimado_minutos
    FROM public.servicios
    WHERE id_negocio=$1
    ORDER BY id
  `, [id]);

  const empleados = await db.query(`
    SELECT id,nombre,apellido,tipo_personal
    FROM public.empleados
    WHERE id_negocio=$1
      AND activo=TRUE
    ORDER BY id
  `, [id]);

  const disponibilidad = await db.query(`
    SELECT capacidad_maxima,activo
    FROM public.disponibilidad_negocio
    WHERE id_negocio=$1
      AND fecha=$2::date
  `, [id, fecha]);

  const total = await db.query(`
    SELECT COUNT(*)::int AS total
    FROM public.citas
    WHERE id_negocio=$1
  `, [id]);

  const datos = {
    citas: citas.rows,
    solicitudes: solicitudes.rows,
    mascotas: mascotas.rows,
    servicios: servicios.rows,
    empleados: empleados.rows,
    disponibilidad: disponibilidad.rows[0] || null,
    total: total.rows[0].total,
  };

  const version = createHash('sha256')
    .update(JSON.stringify(datos))
    .digest('hex');

  return {
    ...datos,
    version,
  };
}

module.exports = function registrarCitas(app, {
  pool,
  requireSucursal,
}) {
  const ruta = '/api/propietario/sucursales/:idSucursal/citas';

  async function manejar(req, res) {
    let db;

    try {
      db = await pool.connect();

      await db.query('BEGIN');
      await db.query("SET LOCAL lock_timeout='5s'");
      await db.query("SET LOCAL statement_timeout='20s'");

      const id = req.sucursal.id;

      // Coordina cambios con solicitudes públicas y otros módulos.
      const negocio = await db.query(`
        SELECT n.tipo_servicio,v.estado
        FROM public.configuracion_negocio n
        JOIN public.verificacion_negocio v
          ON v.id_negocio=n.id
        JOIN public.redes_sucursales r
          ON r.id_negocio=n.id
        WHERE n.id=$1
          AND r.id_red=$2
        FOR UPDATE OF n,v,r
      `, [id, req.propietario.id]);

      if (
        !negocio.rows.length ||
        negocio.rows[0].estado !== 'APROBADO'
      ) {
        throw fallo(403, 'La sucursal ya no está autorizada.');
      }

      const acceso = await db.query(`
        SELECT p.id_red
        FROM public.redes_propietarios p
        JOIN public.usuarios_negocio u
          ON u.id=p.id_usuario
        JOIN public.redes_sucursales r
          ON r.id_negocio=u.id_negocio
          AND r.id_red=p.id_red
        WHERE p.id_red=$1
          AND p.id_usuario=$2
          AND u.id_negocio=$3
          AND p.activo=TRUE
          AND u.activo=TRUE
          AND u.correo_verificado=TRUE
          AND u.dos_pasos_activo=FALSE
        FOR UPDATE OF p,u
      `, [
        req.propietario.id,
        req.auth.usuario.id,
        req.auth.negocio.id,
      ]);

      if (!acceso.rows.length) {
        throw fallo(403, 'Tu acceso ya no está activo.');
      }

      const reloj = (await db.query(`
        SELECT
          CURRENT_DATE::text AS hoy,
          CURRENT_TIMESTAMP::timestamp::text AS ahora,
          current_setting('TimeZone') AS zona
      `)).rows[0];

      const fecha = req.query.fecha || reloj.hoy;
      await fechaValida(db, fecha);

      const actual = await consultar(db, id, fecha);

      if (req.method === 'POST') {
        const b = req.body;

        if (
          !b ||
          typeof b !== 'object' ||
          Array.isArray(b) ||
          ![
            'guardar',
            'estado',
            'rechazar',
            'disponibilidad',
          ].includes(b.operacion)
        ) {
          throw fallo(400, 'Operación inválida.');
        }

        if (b.version !== actual.version) {
          throw fallo(
            409,
            'La agenda cambió. Actualiza antes de guardar.'
          );
        }

        const d = b.datos;

        if (
          !d ||
          typeof d !== 'object' ||
          Array.isArray(d)
        ) {
          throw fallo(400, 'Datos inválidos.');
        }

        if (b.operacion === 'guardar') {
          await fechaValida(db, d.fecha);

          if (
            typeof d.hora !== 'string' ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora) ||
            !entero(d.id_servicio) ||
            !entero(d.id_empleado)
          ) {
            throw fallo(400, 'Revisa hora, servicio y empleado.');
          }

          let anterior = null;

          if (d.id != null) {
            if (!entero(d.id)) {
              throw fallo(400, 'Cita inválida.');
            }

            anterior = (await db.query(`
              SELECT *
              FROM public.citas
              WHERE id=$1 AND id_negocio=$2
              FOR UPDATE
            `, [d.id, id])).rows[0];

            if (!anterior) {
              throw fallo(404, 'Cita no encontrada.');
            }

            if (
              !['PROGRAMADA', 'RETRASADA'].includes(anterior.estado)
            ) {
              throw fallo(
                409,
                'Solo se pueden editar citas programadas o retrasadas.'
              );
            }
          }

          const solicitudId = anterior
            ? anterior.id_solicitud_publica
            : (d.id_solicitud_publica ?? null);

          if (solicitudId !== null && !entero(solicitudId)) {
            throw fallo(400, 'Solicitud inválida.');
          }

          if (solicitudId && !anterior) {
            const s = (await db.query(`
              SELECT
                s.*,
                s.fecha_solicitada::text AS fecha,
                to_char(s.hora_solicitada,'HH24:MI') AS hora
              FROM public.solicitudes_cita_publicas s
              WHERE s.id=$1 AND s.id_negocio=$2
              FOR UPDATE
            `, [solicitudId, id])).rows[0];

            if (!s) {
              throw fallo(404, 'Solicitud no encontrada.');
            }

            if (
              !['PENDIENTE', 'ACEPTADA', 'CONFIRMADA'].includes(s.estado)
            ) {
              throw fallo(409, 'La solicitud ya no está activa.');
            }

            const vinculada = await db.query(`
              SELECT id
              FROM public.citas
              WHERE id_solicitud_publica=$1
            `, [solicitudId]);

            if (vinculada.rows.length) {
              throw fallo(
                409,
                'La solicitud ya tiene una cita. Actualiza la agenda.'
              );
            }

            if (d.fecha !== s.fecha || d.hora !== s.hora) {
              throw fallo(
                400,
                'Confirma primero en la fecha y hora solicitadas.'
              );
            }
          }

          const servicio = (await db.query(`
            SELECT *
            FROM public.servicios
            WHERE id=$1 AND id_negocio=$2
            FOR SHARE
          `, [d.id_servicio, id])).rows[0];

          const empleado = (await db.query(`
            SELECT *
            FROM public.empleados
            WHERE id=$1
              AND id_negocio=$2
              AND activo=TRUE
            FOR SHARE
          `, [d.id_empleado, id])).rows[0];

          if (!servicio || !empleado) {
            throw fallo(
              400,
              'Servicio o empleado no disponible en esta sucursal.'
            );
          }

          const tipo = servicio.tipo_servicio;

          if (
            !['VETERINARIA', 'ESTETICA'].includes(tipo) ||
            ![tipo, 'AMBAS'].includes(negocio.rows[0].tipo_servicio) ||
            ![
              tipo === 'VETERINARIA' ? 'VETERINARIO' : 'ESTILISTA',
              'AMBO',
            ].includes(empleado.tipo_personal)
          ) {
            throw fallo(
              400,
              'El empleado o la sucursal no corresponde al tipo de servicio.'
            );
          }

          const duracion = servicio.tiempo_estimado_minutos;

          if (
            !Number.isInteger(duracion) ||
            duracion <= 0 ||
            duracion > 1440
          ) {
            throw fallo(
              400,
              'El servicio necesita una duración válida.'
            );
          }

          const inicio = minutos(d.hora);
          const fin = inicio + duracion;

          const horario = (await db.query(`
            SELECT *
            FROM public.horarios_negocio
            WHERE id_negocio=$1
              AND dia_semana=EXTRACT(DOW FROM $2::date)::int
          `, [id, d.fecha])).rows[0];

          if (
            !horario ||
            horario.cerrado ||
            !horario.hora_apertura ||
            !horario.hora_cierre ||
            inicio < minutos(horario.hora_apertura) ||
            fin > minutos(horario.hora_cierre)
          ) {
            throw fallo(
              409,
              'El servicio completo debe quedar dentro del horario de atención.'
            );
          }

          const futura = (await db.query(`
            SELECT
              $1::date+$2::time >
              CURRENT_TIMESTAMP::timestamp AS valida
          `, [d.fecha, d.hora])).rows[0].valida;

          if (!futura) {
            throw fallo(
              400,
              'La cita debe comenzar en una fecha y hora futuras.'
            );
          }

          const ocupadas = await reservas(
            db,
            id,
            d.fecha,
            anterior?.id || null,
            solicitudId
          );

          const cupo = (await db.query(`
            SELECT *
            FROM public.disponibilidad_negocio
            WHERE id_negocio=$1 AND fecha=$2::date
            FOR UPDATE
          `, [id, d.fecha])).rows[0];

          if (
            cupo &&
            (!cupo.activo || ocupadas.length >= cupo.capacidad_maxima)
          ) {
            throw fallo(
              409,
              'La disponibilidad del día está desactivada o sin cupo.'
            );
          }

          const cruce = ocupadas.some(r =>
            r.tipo === 'solicitud'
              ? r.inicio >= inicio && r.inicio < fin
              : (
                r.id_empleado === d.id_empleado ||
                r.id_empleado === null
              ) && inicio < r.fin && fin > r.inicio
          );

          if (cruce) {
            throw fallo(
              409,
              'Se cruza con otra cita del empleado o con una solicitud sin asignar.'
            );
          }

          const enProceso = await db.query(`
            SELECT id
            FROM public.citas
            WHERE id_negocio=$1
              AND id_empleado=$2
              AND estado='EN_PROCESO'
              AND ($3::integer IS NULL OR id<>$3)
          `, [id, d.id_empleado, anterior?.id || null]);

          if (d.fecha === reloj.hoy && enProceso.rows.length) {
            throw fallo(
              409,
              'El empleado tiene un servicio en proceso. Finalízalo antes de agregar otra cita para hoy.'
            );
          }

          if (
            d.id_mascota != null &&
            !entero(d.id_mascota)
          ) {
            throw fallo(400, 'Mascota inválida.');
          }

          let mascota = anterior?.id_mascota || d.id_mascota;

          if (mascota) {
            if (!entero(mascota)) {
              throw fallo(400, 'Mascota inválida.');
            }

            const existe = await db.query(`
              SELECT m.id
              FROM public.mascotas m
              JOIN public.clientes c
                ON c.id=m.id_cliente
                AND c.id_negocio=m.id_negocio
              WHERE m.id=$1 AND m.id_negocio=$2
              FOR SHARE OF m,c
            `, [mascota, id]);

            if (!existe.rows.length) {
              throw fallo(
                400,
                'Mascota o cliente ajeno a esta sucursal.'
              );
            }
          } else {
            const nuevo = d.nuevo || {};

            const dueno = texto(nuevo.nombre_dueno, 150);
            const telefono = texto(nuevo.telefono, 20);
            const nombre = texto(nuevo.nombre_mascota, 100);
            const raza = texto(nuevo.raza, 100);

            if (
              !/^[0-9+() .-]{7,20}$/.test(telefono) ||
              typeof nuevo.peso !== 'number' ||
              !Number.isFinite(nuevo.peso) ||
              nuevo.peso <= 0 ||
              nuevo.peso > 999.99
            ) {
              throw fallo(
                400,
                'Revisa teléfono y peso (mayor que cero, máximo 999.99 kg).'
              );
            }

            const cliente = (await db.query(`
              INSERT INTO public.clientes (
                nombre_dueno,
                telefono_celular,
                id_negocio
              )
              VALUES ($1,$2,$3)
              RETURNING id
            `, [dueno, telefono, id])).rows[0].id;

            mascota = (await db.query(`
              INSERT INTO public.mascotas (
                id_cliente,
                nombre_mascota,
                raza_mascota,
                peso_kg,
                id_negocio
              )
              VALUES ($1,$2,$3,$4,$5)
              RETURNING id
            `, [
              cliente,
              nombre,
              raza,
              nuevo.peso,
              id,
            ])).rows[0].id;
          }

          if (anterior) {
            await db.query(`
              UPDATE public.citas SET
                id_servicio=$1,
                id_empleado=$2,
                fecha_hora_programada=$3::date+$4::time,
                estado='PROGRAMADA',
                recordatorio_enviado=FALSE
              WHERE id=$5 AND id_negocio=$6
            `, [
              d.id_servicio,
              d.id_empleado,
              d.fecha,
              d.hora,
              anterior.id,
              id,
            ]);
          } else {
            await db.query(`
              INSERT INTO public.citas (
                id_negocio,
                id_mascota,
                id_empleado,
                id_servicio,
                fecha_hora_programada,
                estado,
                id_solicitud_publica
              )
              VALUES (
                $1,$2,$3,$4,
                $5::date+$6::time,
                'PROGRAMADA',
                $7
              )
            `, [
              id,
              mascota,
              d.id_empleado,
              d.id_servicio,
              d.fecha,
              d.hora,
              solicitudId,
            ]);
          }

          if (solicitudId) {
            await db.query(`
              UPDATE public.solicitudes_cita_publicas SET
                estado='CONFIRMADA',
                fecha_solicitada=$1::date,
                hora_solicitada=$2::time
              WHERE id=$3 AND id_negocio=$4
            `, [
              d.fecha,
              d.hora,
              solicitudId,
              id,
            ]);
          }
        } else if (b.operacion === 'rechazar') {
          if (!entero(d.id)) {
            throw fallo(400, 'Solicitud inválida.');
          }

          const resultado = await db.query(`
            UPDATE public.solicitudes_cita_publicas s
            SET estado='RECHAZADA'
            WHERE s.id=$1
              AND s.id_negocio=$2
              AND s.estado IN ('PENDIENTE','ACEPTADA','CONFIRMADA')
              AND NOT EXISTS (
                SELECT 1
                FROM public.citas c
                WHERE c.id_solicitud_publica=s.id
              )
            RETURNING s.id
          `, [d.id, id]);

          if (!resultado.rows.length) {
            throw fallo(
              409,
              'La solicitud ya cambió o tiene una cita vinculada.'
            );
          }
        } else if (b.operacion === 'estado') {
          if (!entero(d.id)) {
            throw fallo(400, 'Cita inválida.');
          }

          const cita = (await db.query(`
            SELECT
              *,
              fecha_hora_programada <=
                CURRENT_TIMESTAMP::timestamp AS puede_iniciar
            FROM public.citas
            WHERE id=$1 AND id_negocio=$2
            FOR UPDATE
          `, [d.id, id])).rows[0];

          if (!cita) {
            throw fallo(404, 'Cita no encontrada.');
          }

          const cambios = {
            PROGRAMADA: [
              'RETRASADA',
              'EN_PROCESO',
              'CANCELADA',
            ],
            RETRASADA: [
              'EN_PROCESO',
              'CANCELADA',
            ],
            EN_PROCESO: [
              'FINALIZADA',
            ],
          };

          if (!cambios[cita.estado]?.includes(d.estado)) {
            throw fallo(409, 'Cambio de estado no permitido.');
          }

          if (
            ['RETRASADA', 'EN_PROCESO'].includes(d.estado) &&
            !cita.puede_iniciar
          ) {
            throw fallo(409, 'Todavía no llega la hora programada.');
          }

          if (d.estado === 'EN_PROCESO') {
            if (
              !cita.id_mascota ||
              !cita.id_servicio ||
              !cita.id_empleado
            ) {
              throw fallo(
                409,
                'La cita necesita mascota, servicio y empleado antes de iniciar.'
              );
            }

            const habilitado = await db.query(`
              SELECT id
              FROM public.empleados
              WHERE id=$1
                AND id_negocio=$2
                AND activo=TRUE
              FOR SHARE
            `, [cita.id_empleado, id]);

            const ocupacion = await db.query(`
              SELECT id
              FROM public.citas
              WHERE id_negocio=$1
                AND id_empleado=$2
                AND estado='EN_PROCESO'
            `, [id, cita.id_empleado]);

            if (
              !habilitado.rows.length ||
              ocupacion.rows.length
            ) {
              throw fallo(
                409,
                'El empleado no está activo o ya atiende otra cita.'
              );
            }

            await db.query(`
              INSERT INTO public.cronometro_servicios (
                id_cita,
                id_negocio,
                hora_inicio
              )
              VALUES (
                $1,
                $2,
                CURRENT_TIMESTAMP::timestamp
              )
            `, [d.id, id]);
          }

          if (d.estado === 'FINALIZADA') {
            const cronometro = await db.query(`
              UPDATE public.cronometro_servicios SET
                hora_fin=CURRENT_TIMESTAMP::timestamp,
                duracion_real_minutos=GREATEST(
                  0,
                  CEIL(
                    EXTRACT(
                      EPOCH FROM (
                        CURRENT_TIMESTAMP::timestamp-hora_inicio
                      )
                    )/60
                  )::int
                )
              WHERE id_cita=$1
                AND id_negocio=$2
                AND hora_inicio IS NOT NULL
                AND hora_fin IS NULL
              RETURNING id
            `, [d.id, id]);

            if (!cronometro.rows.length) {
              throw fallo(
                409,
                'No existe un cronómetro abierto para esta cita.'
              );
            }
          }

          await db.query(`
            UPDATE public.citas
            SET estado=$1
            WHERE id=$2 AND id_negocio=$3
          `, [d.estado, d.id, id]);

          if (
            cita.id_solicitud_publica &&
            ['CANCELADA', 'FINALIZADA'].includes(d.estado)
          ) {
            await db.query(`
              UPDATE public.solicitudes_cita_publicas
              SET estado=$1
              WHERE id=$2 AND id_negocio=$3
            `, [
              d.estado === 'FINALIZADA'
                ? 'ATENDIDA'
                : 'CANCELADA',
              cita.id_solicitud_publica,
              id,
            ]);
          }
        } else {
          if (
            !entero(d.capacidad_maxima) ||
            typeof d.activo !== 'boolean'
          ) {
            throw fallo(
              400,
              'Capacidad o disponibilidad inválidas.'
            );
          }

          if (fecha < reloj.hoy) {
            throw fallo(
              400,
              'No puedes modificar disponibilidad pasada.'
            );
          }

          const ocupadas = await reservas(db, id, fecha);

          if (d.capacidad_maxima < ocupadas.length) {
            throw fallo(
              409,
              'La capacidad no puede ser menor a las reservas existentes.'
            );
          }

          await db.query(`
            INSERT INTO public.disponibilidad_negocio (
              id_negocio,
              fecha,
              capacidad_maxima,
              activo
            )
            VALUES ($1,$2::date,$3,$4)
            ON CONFLICT (id_negocio,fecha)
            DO UPDATE SET
              capacidad_maxima=EXCLUDED.capacidad_maxima,
              activo=EXCLUDED.activo
          `, [
            id,
            fecha,
            d.capacidad_maxima,
            d.activo,
          ]);
        }
      }

      const data = req.method === 'POST'
        ? await consultar(db, id, fecha)
        : actual;

      await db.query('COMMIT');

      res.set('Cache-Control', 'no-store');

      return res.json({
        success: true,
        data: {
          ...data,
          fecha,
          ...reloj,
        },
      });
    } catch (e) {
      if (db) {
        await db.query('ROLLBACK').catch(() => {});
      }

      const status = e.status || (
        ['22007', '22008'].includes(e.code)
          ? 400
          : ['23505', '23503', '55P03', '40P01'].includes(e.code)
            ? 409
            : 503
      );

      if (!e.status) {
        console.error('Citas:', e.code || 'ERROR');
      }

      return res.status(status).json({
        success: false,
        message: e.status
          ? e.message
          : 'No se pudo confirmar la operación. Actualiza antes de reintentar.',
      });
    } finally {
      db?.release();
    }
  }

  // Hereda autenticación y permisos de routes/propietario.js.
  app.get(ruta, requireSucursal, manejar);
  app.post(ruta, requireSucursal, manejar);
};