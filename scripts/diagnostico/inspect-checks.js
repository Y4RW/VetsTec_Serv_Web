require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function inspectChecks() {
  try {
    console.log('\n🔍 Revisando restricciones CHECK...\n');

    const result = await pool.query(`
      SELECT
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'configuracion_negocio'::regclass
        AND contype = 'c';
    `);

    if (result.rows.length === 0) {
      console.log(
        'No se encontraron restricciones CHECK.'
      );
      return;
    }

    for (const constraint of result.rows) {
      console.log(
        `📌 ${constraint.constraint_name}`
      );

      console.log(
        `   ${constraint.definition}\n`
      );
    }
  } catch (error) {
    console.error(
      '❌ Error revisando restricciones:'
    );

    console.error(error.message);
  } finally {
    await pool.end();
  }
}

inspectChecks();