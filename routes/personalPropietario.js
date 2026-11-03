const { createHash } = require('node:crypto');

const fallo = (status, message) =>
  Object.assign(new Error(message), { status });

const hash = datos =>
  createHash('sha256').update(JSON.stringify(datos)).digest('hex');

const tipos = [
  'VETERINARIO',
  'ESTILISTA',
  'AMBO',
  'ADMINISTRATIVO',
];

async function consultar(db, id) {
  const empleados = await db.query(`
    SELECT
      id, nombre, apellido, correo, telefono,
      tipo_personal, id_rol, activo, id_negocio
    FROM public.empleados
    WHERE id_negocio=$1
    ORDER BY id
  `, [id]);

  const horarios = await db.query(`
    SELECT
      dia_semana,
      hora_apertura::text AS hora_apertura,
      hora_cierre::text AS hora_cierre,
      cerrado
    FROM public.horarios_negocio
    WHERE id_negocio=$1
    ORDER BY dia_semana
  `, [id]);

  const datos = {
    empleados: empleados.rows,
    horarios: horarios.rows,
  };

  return {
    ...datos,
    version: hash(datos),
  };
}

function texto(valor, nombre, maximo, opcional = false) {
  if (opcional && (valor === null || valor === undefined)) return '';

  if (
    typeof valor !== 'string' ||
    (!opcional && !valor.trim()) ||
    valor.trim().length > maximo
  ) {
    throw fallo(400, `Revisa ${nombre}; máximo ${maximo} caracteres.`);
  }

  return valor.trim();
}

function idValido(valor) {
  return Number.isInteger(valor) && valor > 0 && valor <= 2147483647;
}

module.exports = function registrarPersonal(app, {
  pool,
  requireSucursal,
}) {
  const base = '/api/propietario/sucursales/:idSucursal/personal';

  async function manejar(req, res) {
    let db;

    try {
      const id = req.sucursal.id;
      db = await pool.connect();

      await db.query('BEGIN');
      await db.query("SET LOCAL lock_timeout='5s'");
      await db.query("SET LOCAL statement_timeout='20s'");

      // Coordina cambios privados y solicitudes públicas.
      const negocio = await db.query(`
        SELECT n.id, v.estado
        FROM public.configuracion_negocio n
        JOIN public.verificacion_negocio v ON v.id_negocio=n.id
        JOIN public.redes_sucursales s ON s.id_negocio=n.id
        WHERE n.id=$1 AND s.id_red=$2
        FOR UPDATE OF n, v, s
      `, [id, req.propietario.id]);

      if (!negocio.rows.length) {
        throw fallo(404, 'Sucursal no encontrada.');
      }

      if (negocio.rows[0].estado !== 'APROBADO') {
        throw fallo(403, 'La sucursal necesita aprobación.');
      }

      const acceso = await db.query(`
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

      if (!acceso.rows.length) {
        throw fallo(403, 'Tu acceso de propietario ya no está activo.');
      }

      const actual = await consultar(db, id);

      if (req.method === 'POST') {
        const body = req.body;

        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some(
            c => !['version', 'operacion', 'datos'].includes(c)
          ) ||
          typeof body.version !== 'string' ||
          !['empleado', 'horarios'].includes(body.operacion)
        ) {
          throw fallo(400, 'Solicitud inválida.');
        }

        if (body.version !== actual.version) {
          throw fallo(
            409,
            'Los datos cambiaron. Recarga antes de guardar.'
          );
        }

        if (body.operacion === 'empleado') {
          const d = body.datos;

          const permitidos = [
            'id', 'nombre', 'apellido', 'correo',
            'telefono', 'tipo_personal', 'activo',
          ];

          if (
            !d ||
            typeof d !== 'object' ||
            Array.isArray(d) ||
            Object.keys(d).some(c => !permitidos.includes(c)) ||
            typeof d.activo !== 'boolean' ||
            !tipos.includes(d.tipo_personal) ||
            (d.id !== undefined && !idValido(d.id))
          ) {
            throw fallo(400, 'Datos del empleado inválidos.');
          }

          const nombre = texto(d.nombre, 'nombre', 100);
          const apellido = texto(d.apellido, 'apellido', 100);
          const correo = texto(d.correo, 'correo', 150).toLowerCase();
          const telefono = texto(d.telefono, 'teléfono', 20, true);

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            throw fallo(400, 'Escribe un correo válido.');
          }

          if (telefono && !/^[0-9+() .-]{7,20}$/.test(telefono)) {
            throw fallo(400, 'Revisa el teléfono.');
          }

          if (d.id !== undefined) {
            const empleado = await db.query(`
              SELECT id, activo, tipo_personal
              FROM public.empleados
              WHERE id=$1 AND id_negocio=$2
              FOR UPDATE
            `, [d.id, id]);

            if (!empleado.rows.length) {
              throw fallo(404, 'Empleado no encontrado.');
            }

            const anterior = empleado.rows[0];

            if (
              !d.activo ||
              anterior.tipo_personal !== d.tipo_personal
            ) {
// Protege citas futuras activas y servicios en proceso.
              const citas = await db.query(`
                SELECT 1
                FROM public.citas
                WHERE id_empleado=$1
                  AND id_negocio=$2
                  AND COALESCE(estado,'PROGRAMADA')
                    IN ('PROGRAMADA','RETRASADA','EN_PROCESO')
                  AND (
                    fecha_hora_programada >= CURRENT_TIMESTAMP
                    OR estado='EN_PROCESO'
                  )
                LIMIT 1
              `, [d.id, id]);

              if (citas.rows.length) {
                throw fallo(
                  409,
                  'El empleado tiene citas futuras. Revisa sus asignaciones antes de desactivarlo o cambiar su tipo.'
                );
              }
            }

            await db.query(`
              UPDATE public.empleados SET
                nombre=$1,
                apellido=$2,
                correo=$3,
                telefono=$4,
                tipo_personal=$5,
                activo=$6
              WHERE id=$7 AND id_negocio=$8
            `, [
              nombre, apellido, correo, telefono || null,
              d.tipo_personal, d.activo, d.id, id,
            ]);
          } else {
            await db.query(`
              INSERT INTO public.empleados (
                nombre, apellido, correo, telefono,
                tipo_personal, activo, id_negocio, id_rol
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,NULL)
            `, [
              nombre, apellido, correo, telefono || null,
              d.tipo_personal, d.activo, id,
            ]);
          }
        } else {
          const dias = body.datos;

          if (
            !Array.isArray(dias) ||
            dias.length !== 7 ||
            new Set(dias.map(d => d?.dia_semana)).size !== 7
          ) {
            throw fallo(400, 'Debes proporcionar los siete días.');
          }

          for (const d of dias) {
            if (
              !d ||
              typeof d !== 'object' ||
              Object.keys(d).some(c => ![
                'dia_semana', 'hora_apertura', 'hora_cierre', 'cerrado',
              ].includes(c)) ||
              !Number.isInteger(d.dia_semana) ||
              d.dia_semana < 0 ||
              d.dia_semana > 6 ||
              typeof d.cerrado !== 'boolean'
            ) {
              throw fallo(400, 'Día inválido.');
            }

            if (!d.cerrado) {
              const patron = /^([01]\d|2[0-3]):[0-5]\d$/;

              if (
                typeof d.hora_apertura !== 'string' ||
                typeof d.hora_cierre !== 'string' ||
                !patron.test(d.hora_apertura) ||
                !patron.test(d.hora_cierre) ||
                d.hora_apertura >= d.hora_cierre
              ) {
                throw fallo(
                  400,
                  'La apertura debe ser anterior al cierre, dentro del mismo día.'
                );
              }
            }
          }

          const anteriores = new Map(
            actual.horarios.map(d => [d.dia_semana, d])
          );

          const cambiados = dias.filter(d => {
            const a = anteriores.get(d.dia_semana);

            return !a ||
              a.cerrado !== d.cerrado ||
              (!d.cerrado && (
                a.hora_apertura?.slice(0, 5) !== d.hora_apertura ||
                a.hora_cierre?.slice(0, 5) !== d.hora_cierre
              ));
          });

          if (cambiados.length) {
            const numeros = cambiados.map(d => d.dia_semana);

            // Protege solicitudes públicas todavía activas.
            const solicitudes = await db.query(`
              SELECT 1
              FROM public.solicitudes_cita_publicas
              WHERE id_negocio=$1
                AND fecha_solicitada >= CURRENT_DATE
                AND estado IN ('PENDIENTE','ACEPTADA','CONFIRMADA')
                AND EXTRACT(DOW FROM fecha_solicitada)::int = ANY($2::int[])
              LIMIT 1
            `, [id, numeros]);

            const citas = await db.query(`
              SELECT 1
              FROM public.citas
              WHERE id_negocio=$1
                AND COALESCE(estado,'PROGRAMADA')
                  IN ('PROGRAMADA','RETRASADA','EN_PROCESO')
                AND (
                  fecha_hora_programada >= CURRENT_TIMESTAMP
                  OR estado='EN_PROCESO'
                )
                AND EXTRACT(
                  DOW FROM fecha_hora_programada
                )::int = ANY($2::int[])
              LIMIT 1
            `, [id, numeros]);

            if (solicitudes.rows.length || citas.rows.length) {
              throw fallo(
                409,
                'Hay citas o solicitudes futuras en los días modificados. Revísalas antes de cambiar esos horarios.'
              );
            }

            for (const d of cambiados) {
              await db.query(`
                INSERT INTO public.horarios_negocio (
                  id_negocio, dia_semana,
                  hora_apertura, hora_cierre, cerrado
                )
                VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT (id_negocio, dia_semana)
                DO UPDATE SET
                  hora_apertura=EXCLUDED.hora_apertura,
                  hora_cierre=EXCLUDED.hora_cierre,
                  cerrado=EXCLUDED.cerrado
              `, [
                id,
                d.dia_semana,
                d.cerrado ? null : d.hora_apertura,
                d.cerrado ? null : d.hora_cierre,
                d.cerrado,
              ]);
            }
          }
        }
      }

      const data = await consultar(db, id);
      await db.query('COMMIT');

      res.json({ success: true, data });
    } catch (e) {
      if (db) await db.query('ROLLBACK').catch(() => {});

      if (!e.status) {
        console.error('Personal y horarios:', e.code || 'ERROR');
      }

      res.status(e.status || (e.code === '23505' ? 409 : 503)).json({
        success: false,
        message: e.status
          ? e.message
          : e.code === '23505'
            ? 'Ese correo ya está registrado.'
            : 'No se pudo confirmar la operación. Recarga antes de reintentar.',
      });
    } finally {
      db?.release();
    }
  }

  // Hereda los middlewares de sesión y propietario.
  app.get(base, requireSucursal, manejar);
  app.post(base, requireSucursal, manejar);
};