require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function migrateAuth() {
  const client = await pool.connect();

  try {
    console.log("\n🔐 Preparando módulo de registro y seguridad...\n");

    // Revisamos los negocios ANTES de modificar la estructura.
    const before = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE activo_directorio = TRUE)::int AS activos
      FROM configuracion_negocio;
    `);

    console.log("📊 Antes de la migración:");
    console.log(`   Negocios registrados: ${before.rows[0].total}`);
    console.log(`   Negocios activos en directorio: ${before.rows[0].activos}`);

    await client.query("BEGIN");

    // =====================================================
    // 1. USUARIOS DE LOS NEGOCIOS
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios_negocio (
        id SERIAL PRIMARY KEY,

        id_negocio INTEGER NOT NULL
          REFERENCES configuracion_negocio(id)
          ON DELETE CASCADE,

        correo VARCHAR(150) NOT NULL,
        password_hash TEXT NOT NULL,

        correo_verificado BOOLEAN NOT NULL DEFAULT FALSE,
        dos_pasos_activo BOOLEAN NOT NULL DEFAULT FALSE,

        activo BOOLEAN NOT NULL DEFAULT TRUE,

        fecha_creacion TIMESTAMP WITHOUT TIME ZONE
          NOT NULL DEFAULT CURRENT_TIMESTAMP,

        ultimo_acceso TIMESTAMP WITHOUT TIME ZONE
      );
    `);

    // Evita registrar el mismo correo dos veces,
    // incluso si cambia mayúsculas/minúsculas.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      idx_usuarios_negocio_correo
      ON usuarios_negocio (LOWER(correo));
    `);

    // =====================================================
    // 2. VERIFICACIÓN DE VETERINARIAS / ESTÉTICAS
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS verificacion_negocio (
        id SERIAL PRIMARY KEY,

        id_negocio INTEGER NOT NULL UNIQUE
          REFERENCES configuracion_negocio(id)
          ON DELETE CASCADE,

        estado VARCHAR(20)
          NOT NULL DEFAULT 'PENDIENTE'
          CHECK (
            estado IN (
              'PENDIENTE',
              'APROBADO',
              'RECHAZADO',
              'SUSPENDIDO'
            )
          ),

        nombre_responsable VARCHAR(150),
        cedula_profesional VARCHAR(30),

        foto_establecimiento_url TEXT,

        motivo_rechazo TEXT,
        observaciones_revision TEXT,

        fecha_solicitud TIMESTAMP WITHOUT TIME ZONE
          NOT NULL DEFAULT CURRENT_TIMESTAMP,

        fecha_revision TIMESTAMP WITHOUT TIME ZONE
      );
    `);

    // =====================================================
    // 3. CÓDIGOS DE SEGURIDAD
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS tokens_seguridad (
        id SERIAL PRIMARY KEY,

        id_usuario INTEGER NOT NULL
          REFERENCES usuarios_negocio(id)
          ON DELETE CASCADE,

        tipo VARCHAR(30) NOT NULL
          CHECK (
            tipo IN (
              'VERIFICAR_CORREO',
              'RECUPERAR_PASSWORD',
              'DOS_PASOS'
            )
          ),

        codigo_hash TEXT NOT NULL,

        fecha_expiracion TIMESTAMP WITHOUT TIME ZONE NOT NULL,

        usado BOOLEAN NOT NULL DEFAULT FALSE,

        intentos SMALLINT NOT NULL DEFAULT 0
          CHECK (intentos >= 0),

        fecha_creacion TIMESTAMP WITHOUT TIME ZONE
          NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_tokens_seguridad_usuario
      ON tokens_seguridad(id_usuario);
    `);

    // =====================================================
    // 4. LOS NUEVOS NEGOCIOS NO APARECERÁN AUTOMÁTICAMENTE
    // =====================================================

    await client.query(`
      ALTER TABLE configuracion_negocio
      ALTER COLUMN activo_directorio
      SET DEFAULT FALSE;
    `);

    await client.query("COMMIT");

    // Verificamos que NO hayamos alterado los negocios existentes.
    const after = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE activo_directorio = TRUE)::int AS activos
      FROM configuracion_negocio;
    `);

    console.log("\n✅ Migración realizada correctamente.");

    console.log("\n📊 Después de la migración:");
    console.log(`   Negocios registrados: ${after.rows[0].total}`);
    console.log(`   Negocios activos en directorio: ${after.rows[0].activos}`);

    if (
      before.rows[0].total === after.rows[0].total &&
      before.rows[0].activos === after.rows[0].activos
    ) {
      console.log("\n🛡️ Los registros anteriores NO fueron modificados.");
    } else {
      console.log("\n⚠️ Revisa los conteos de los negocios.");
    }

    console.log("\n📦 Tablas preparadas:");
    console.log("   • usuarios_negocio");
    console.log("   • verificacion_negocio");
    console.log("   • tokens_seguridad");

    console.log(
      "\nℹ️ Los negocios nuevos tendrán activo_directorio = false por defecto."
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("\n❌ Error en la migración:");
    console.error(error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateAuth();