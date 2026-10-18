require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },
});

async function inspectRequests() {
  try {
    const result =
      await pool.query(`
        SELECT
          s.id,
          n.nombre_establecimiento,
          s.nombre_mascota,
          s.fecha_solicitada,
          s.hora_solicitada,
          s.estado,
          s.fecha_solicitud

        FROM solicitudes_cita_publicas s

        INNER JOIN configuracion_negocio n
          ON n.id = s.id_negocio

        ORDER BY
          s.fecha_solicitud DESC

        LIMIT 20;
      `);

    console.log(
      '\n📅 SOLICITUDES DE CITA\n'
    );

    if (result.rows.length === 0) {
      console.log(
        'No hay solicitudes registradas.'
      );

      return;
    }

    for (const request of result.rows) {
      console.log(
        `----------------------------------`
      );

      console.log(
        `ID: ${request.id}`
      );

      console.log(
        `Establecimiento: ${request.nombre_establecimiento}`
      );

      console.log(
        `Mascota: ${request.nombre_mascota}`
      );

      console.log(
        `Fecha: ${request.fecha_solicitada}`
      );

      console.log(
        `Hora: ${request.hora_solicitada}`
      );

      console.log(
        `Estado: ${request.estado}`
      );
    }

    console.log('');
  } catch (error) {
    console.error(
      '❌ Error:',
      error.message
    );
  } finally {
    await pool.end();
  }
}

inspectRequests();