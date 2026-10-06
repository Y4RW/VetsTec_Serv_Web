require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function migratePublicModule() {
  const client = await pool.connect();

  try {
    console.log('\n🐾 Preparando módulo público de VetStec...\n');

    await client.query('BEGIN');

    /* =====================================================
       CONFIGURACIÓN DEL NEGOCIO
       ===================================================== */

    await client.query(`
      ALTER TABLE configuracion_negocio
      ADD COLUMN IF NOT EXISTS codigo_postal VARCHAR(5);
    `);

    await client.query(`
      ALTER TABLE configuracion_negocio
      ADD COLUMN IF NOT EXISTS correo_contacto VARCHAR(150);
    `);

    await client.query(`
      ALTER TABLE configuracion_negocio
      ADD COLUMN IF NOT EXISTS descripcion TEXT;
    `);

    await client.query(`
      ALTER TABLE configuracion_negocio
      ADD COLUMN IF NOT EXISTS logo_url TEXT;
    `);

    await client.query(`
      ALTER TABLE configuracion_negocio
      ADD COLUMN IF NOT EXISTS latitud NUMERIC(9,6);
    `);

    await client.query(`
      ALTER TABLE configuracion_negocio
      ADD COLUMN IF NOT EXISTS longitud NUMERIC(9,6);
    `);

    await client.query(`
      ALTER TABLE configuracion_negocio
      ADD COLUMN IF NOT EXISTS activo_directorio BOOLEAN
      NOT NULL DEFAULT TRUE;
    `);

    /* =====================================================
       HORARIOS DEL NEGOCIO
       ===================================================== */

    await client.query(`
      CREATE TABLE IF NOT EXISTS horarios_negocio (
        id SERIAL PRIMARY KEY,

        id_negocio INTEGER NOT NULL
          REFERENCES configuracion_negocio(id)
          ON DELETE CASCADE,

        dia_semana SMALLINT NOT NULL
          CHECK (dia_semana BETWEEN 0 AND 6),

        hora_apertura TIME,
        hora_cierre TIME,

        cerrado BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      ux_horarios_negocio_dia
      ON horarios_negocio(id_negocio, dia_semana);
    `);

    /* =====================================================
       CAPACIDAD / DISPONIBILIDAD
       ===================================================== */

    await client.query(`
      CREATE TABLE IF NOT EXISTS disponibilidad_negocio (
        id SERIAL PRIMARY KEY,

        id_negocio INTEGER NOT NULL
          REFERENCES configuracion_negocio(id)
          ON DELETE CASCADE,

        fecha DATE NOT NULL,

        capacidad_maxima INTEGER NOT NULL DEFAULT 5
          CHECK (capacidad_maxima > 0),

        activo BOOLEAN NOT NULL DEFAULT TRUE,

        UNIQUE (id_negocio, fecha)
      );
    `);

    /* =====================================================
       SOLICITUDES PÚBLICAS DE CITA
       ===================================================== */

    await client.query(`
      CREATE TABLE IF NOT EXISTS solicitudes_cita_publicas (
        id SERIAL PRIMARY KEY,

        id_negocio INTEGER NOT NULL
          REFERENCES configuracion_negocio(id)
          ON DELETE CASCADE,

        nombre_mascota VARCHAR(80) NOT NULL,

        telefono VARCHAR(20) NOT NULL,

        fecha_solicitada DATE NOT NULL,

        hora_solicitada TIME NOT NULL,

        estado VARCHAR(30)
          NOT NULL DEFAULT 'PENDIENTE',

        fecha_solicitud TIMESTAMP
          NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_solicitudes_negocio_fecha
      ON solicitudes_cita_publicas(
        id_negocio,
        fecha_solicitada
      );
    `);

    /* =====================================================
       CONTACTO / SATISFACCIÓN
       ===================================================== */

    await client.query(`
      CREATE TABLE IF NOT EXISTS mensajes_contacto (
        id SERIAL PRIMARY KEY,

        nombre VARCHAR(120) NOT NULL,

        correo VARCHAR(150) NOT NULL,

        descripcion TEXT NOT NULL,

        estado VARCHAR(20)
          NOT NULL DEFAULT 'NUEVO',

        fecha_envio TIMESTAMP
          NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_mensajes_contacto_fecha
      ON mensajes_contacto(fecha_envio);
    `);

    await client.query('COMMIT');

    console.log('✅ Módulo público preparado correctamente.');
    console.log('');
    console.log('Se agregó soporte para:');
    console.log('🏥 Directorio de establecimientos');
    console.log('🕐 Horarios');
    console.log('📅 Disponibilidad');
    console.log('🐾 Solicitudes públicas de cita');
    console.log('✉️ Formulario de contacto');
    console.log('');
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('\n❌ No se pudo realizar la migración:');
    console.error(error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migratePublicModule();