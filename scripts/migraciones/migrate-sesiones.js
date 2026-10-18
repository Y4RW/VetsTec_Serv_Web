require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrar() {
  let client;
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('Falta DATABASE_URL. Ejecuta desde la raíz del proyecto.');
    }
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sesiones_negocio (
        token_hash CHAR(64) PRIMARY KEY,
        id_usuario INTEGER NOT NULL REFERENCES usuarios_negocio(id) ON DELETE CASCADE,
        fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        fecha_expiracion TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sesiones_negocio_usuario
        ON sesiones_negocio(id_usuario);
      CREATE INDEX IF NOT EXISTS idx_sesiones_negocio_expiracion
        ON sesiones_negocio(fecha_expiracion);
      CREATE TABLE IF NOT EXISTS intentos_acceso_negocio (
        clave_hash CHAR(64) PRIMARY KEY,
        intentos INTEGER NOT NULL CHECK (intentos > 0),
        reinicio TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_intentos_acceso_negocio_reinicio
        ON intentos_acceso_negocio(reinicio);
    `);
    await client.query('COMMIT');
    console.log('Sesiones e intentos de acceso preparados correctamente.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('No se pudo preparar el acceso:', error.message);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}

migrar();