require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },
});

async function inspectContact() {
  try {
    const result =
      await pool.query(`
        SELECT
          id,
          nombre,
          correo,
          descripcion,
          estado,
          fecha_envio

        FROM mensajes_contacto

        ORDER BY fecha_envio DESC

        LIMIT 20;
      `);

    console.log(
      '\n✉️ MENSAJES DE CONTACTO\n'
    );

    if (result.rows.length === 0) {
      console.log(
        'No hay mensajes registrados.'
      );

      return;
    }

    for (const message of result.rows) {
      console.log(
        '----------------------------------'
      );

      console.log(
        `ID: ${message.id}`
      );

      console.log(
        `Nombre: ${message.nombre}`
      );

      console.log(
        `Correo: ${message.correo}`
      );

      console.log(
        `Descripción: ${message.descripcion}`
      );

      console.log(
        `Estado: ${message.estado}`
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

inspectContact();