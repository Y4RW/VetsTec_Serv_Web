require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

async function migrar() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Ejecuta desde la raíz del proyecto.');
    process.exitCode = 1;
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS administradores_vetstec (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        correo VARCHAR(150) NOT NULL,
        password_hash TEXT NOT NULL,
        rol VARCHAR(30) NOT NULL DEFAULT 'ADMIN_VETSTEC'
          CHECK (rol = 'ADMIN_VETSTEC'),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultimo_acceso TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_vetstec_correo
        ON administradores_vetstec (LOWER(correo));
      CREATE TABLE IF NOT EXISTS sesiones_admin (
        token_hash CHAR(64) PRIMARY KEY,
        id_admin INTEGER NOT NULL
          REFERENCES administradores_vetstec(id) ON DELETE CASCADE,
        fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        fecha_expiracion TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sesiones_admin_usuario
        ON sesiones_admin (id_admin);
      CREATE INDEX IF NOT EXISTS idx_sesiones_admin_expiracion
        ON sesiones_admin (fecha_expiracion);
      CREATE TABLE IF NOT EXISTS intentos_acceso_admin (
        clave_hash CHAR(64) PRIMARY KEY,
        intentos INTEGER NOT NULL CHECK (intentos > 0),
        reinicio TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_intentos_admin_reinicio
        ON intentos_acceso_admin (reinicio);

      -- El navegador no debe acceder directamente a estas tablas en Supabase.
      ALTER TABLE administradores_vetstec ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sesiones_admin ENABLE ROW LEVEL SECURITY;
      ALTER TABLE intentos_acceso_admin ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE administradores_vetstec, sesiones_admin, intentos_acceso_admin FROM PUBLIC;
      DO $$
      DECLARE nombre_rol TEXT;
      BEGIN
        FOREACH nombre_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = nombre_rol) THEN
            EXECUTE format(
              'REVOKE ALL ON TABLE administradores_vetstec, sesiones_admin, intentos_acceso_admin FROM %I',
              nombre_rol
            );
          END IF;
        END LOOP;
      END $$;
    `);
    await client.query('COMMIT');
    console.log('Tablas administrativas preparadas correctamente.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('No se pudo preparar la administración:', error.message);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}

migrar();