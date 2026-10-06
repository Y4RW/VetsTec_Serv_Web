require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function inspectRelations() {
  try {
    console.log('\n🔎 ANALIZANDO ARQUITECTURA DE VETSTEC\n');

    /* =============================================
       NEGOCIOS REGISTRADOS
       ============================================= */

    const businesses = await pool.query(`
      SELECT
        id,
        nombre_establecimiento,
        tipo_servicio
      FROM configuracion_negocio
      ORDER BY id
      LIMIT 20;
    `);

    console.log('========================================');
    console.log('🏥 NEGOCIOS EN configuracion_negocio');
    console.log('========================================');

    console.log(
      `Cantidad encontrada: ${businesses.rows.length}\n`
    );

    for (const business of businesses.rows) {
      console.log(
        `ID ${business.id} | ${business.nombre_establecimiento} | ${business.tipo_servicio}`
      );
    }

    /* =============================================
       CANTIDAD DE REGISTROS
       ============================================= */

    const importantTables = [
      'configuracion_negocio',
      'empleados',
      'servicios',
      'citas',
      'clientes',
      'mascotas',
      'productos',
      'proveedores',
      'ventas',
    ];

    console.log('\n========================================');
    console.log('📊 CANTIDAD DE REGISTROS');
    console.log('========================================');

    for (const table of importantTables) {
      const result = await pool.query(
        `SELECT COUNT(*)::integer AS total FROM ${table}`
      );

      console.log(
        `${table}: ${result.rows[0].total}`
      );
    }

    /* =============================================
       PRIMARY KEYS Y FOREIGN KEYS
       ============================================= */

    const relations = await pool.query(`
      SELECT
        tc.table_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type IN (
          'PRIMARY KEY',
          'FOREIGN KEY'
        )
      ORDER BY
        tc.table_name,
        tc.constraint_type,
        kcu.column_name;
    `);

    console.log('\n========================================');
    console.log('🔗 RELACIONES DE LA BASE DE DATOS');
    console.log('========================================');

    let previousTable = '';

    for (const relation of relations.rows) {
      if (previousTable !== relation.table_name) {
        previousTable = relation.table_name;

        console.log(
          `\n📦 ${relation.table_name}`
        );
      }

      if (relation.constraint_type === 'PRIMARY KEY') {
        console.log(
          `   🔑 PK: ${relation.column_name}`
        );
      }

      if (relation.constraint_type === 'FOREIGN KEY') {
        console.log(
          `   🔗 ${relation.column_name} -> ${relation.foreign_table}.${relation.foreign_column}`
        );
      }
    }

    console.log(
      '\n✅ Análisis terminado sin modificar la BD.\n'
    );
  } catch (error) {
    console.error('\n❌ Error:');
    console.error(error.message);
  } finally {
    await pool.end();
  }
}

inspectRelations();