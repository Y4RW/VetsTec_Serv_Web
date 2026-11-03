// Las fechas y horas representan la hora local configurada en PostgreSQL.
async function reservas(
  db,
  negocio,
  fecha,
  cita = null,
  solicitud = null
) {
  const { rows } = await db.query(`
    SELECT
      'solicitud' AS tipo,
      s.id,
      NULL::integer AS id_empleado,
      EXTRACT(EPOCH FROM s.hora_solicitada)/60 AS inicio,
      NULL::numeric AS fin
    FROM public.solicitudes_cita_publicas s
    WHERE s.id_negocio=$1
      AND s.fecha_solicitada=$2::date
      AND s.estado IN ('PENDIENTE','ACEPTADA','CONFIRMADA')
      AND ($4::integer IS NULL OR s.id<>$4)
      AND NOT EXISTS (
        SELECT 1
        FROM public.citas c
        WHERE c.id_solicitud_publica=s.id
          AND c.id_negocio=s.id_negocio
      )

    UNION ALL

    SELECT
      'cita',
      c.id,
      c.id_empleado,
      EXTRACT(
        EPOCH FROM (c.fecha_hora_programada-$2::date)
      )/60,
      EXTRACT(
        EPOCH FROM (
          c.fecha_hora_programada +
          make_interval(
            mins=>GREATEST(
              COALESCE(v.tiempo_estimado_minutos,60),
              1
            )
          ) - $2::date
        )
      )/60
    FROM public.citas c
    LEFT JOIN public.servicios v
      ON v.id=c.id_servicio
      AND v.id_negocio=c.id_negocio
    WHERE c.id_negocio=$1
      AND c.estado IS DISTINCT FROM 'CANCELADA'
      AND ($3::integer IS NULL OR c.id<>$3)
      AND c.fecha_hora_programada < $2::date+INTERVAL '1 day'
      AND c.fecha_hora_programada +
        make_interval(
          mins=>GREATEST(
            COALESCE(v.tiempo_estimado_minutos,60),
            1
          )
        ) > $2::date
  `, [negocio, fecha, cita, solicitud]);

  return rows.map(r => ({
    ...r,
    inicio: Number(r.inicio),
    fin: r.fin === null ? null : Number(r.fin),
  }));
}

function minutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function ocupaHora(reserva, minuto) {
  return reserva.tipo === 'solicitud'
    ? reserva.inicio === minuto
    : reserva.inicio <= minuto && minuto < reserva.fin;
}

module.exports = {
  reservas,
  minutos,
  ocupaHora,
};