require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function inspectDatabase() {
  try {
    console.log('\n🔍 Revisando estructura de VetStec...\n');

    const result = await pool.query(`
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    if (result.rows.length === 0) {
      console.log('⚠️ No se encontraron tablas en public.');
      return;
    }

    let currentTable = '';

    for (const column of result.rows) {
      if (column.table_name !== currentTable) {
        currentTable = column.table_name;

        console.log('\n========================================');
        console.log(`📦 TABLA: ${currentTable}`);
        console.log('========================================');
      }

      console.log(
        `  ${column.column_name} | ${column.data_type} | NULL: ${column.is_nullable}`
      );
    }

    console.log('\n✅ Inspección terminada.\n');
  } catch (error) {
    console.error('\n❌ Error inspeccionando la BD:');
    console.error(error.message);
  } finally {
    await pool.end();
  }
}

inspectDatabase();