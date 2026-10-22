require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

async function migrar(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS historial_revision_negocio (
        id BIGSERIAL PRIMARY KEY,
        id_negocio INTEGER NOT NULL REFERENCES configuracion_negocio(id) ON DELETE RESTRICT,
        id_admin INTEGER NOT NULL REFERENCES administradores_vetstec(id) ON DELETE RESTRICT,
        administrador_nombre VARCHAR(120) NOT NULL,
        estado_anterior VARCHAR(20) NOT NULL CHECK (estado_anterior = 'PENDIENTE'),
        estado_nuevo VARCHAR(20) NOT NULL CHECK (estado_nuevo IN ('APROBADO', 'RECHAZADO')),
        motivo TEXT,
        observaciones TEXT,
        fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (estado_nuevo <> 'RECHAZADO' OR length(btrim(motivo)) >= 10 AND motivo IS NOT NULL)
      );
      CREATE INDEX IF NOT EXISTS idx_historial_revision_negocio_fecha
        ON historial_revision_negocio (id_negocio, fecha DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_verificacion_estado_fecha
        ON verificacion_negocio (estado, fecha_solicitud, id);
      CREATE INDEX IF NOT EXISTS idx_usuarios_negocio_publicacion
        ON usuarios_negocio (id_negocio) WHERE activo AND correo_verificado;

      -- Estas tablas se consultan desde Node; no desde la API pública de Supabase.
      ALTER TABLE historial_revision_negocio ENABLE ROW LEVEL SECURITY;
      ALTER TABLE verificacion_negocio ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE historial_revision_negocio, verificacion_negocio FROM PUBLIC;
      REVOKE ALL ON SEQUENCE historial_revision_negocio_id_seq FROM PUBLIC;
      DO $$
      DECLARE nombre_rol TEXT;
      BEGIN
        FOREACH nombre_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = nombre_rol) THEN
            EXECUTE format('REVOKE ALL ON TABLE historial_revision_negocio, verificacion_negocio FROM %I', nombre_rol);
            EXECUTE format('REVOKE ALL ON SEQUENCE historial_revision_negocio_id_seq FROM %I', nombre_rol);
          END IF;
        END LOOP;
      END $$;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Ejecuta desde la raíz del proyecto.');
    process.exitCode = 1;
  } else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    migrar(pool)
      .then(() => console.log('Revisión de solicitudes preparada correctamente.'))
      .catch((error) => { console.error('No se pudo preparar la revisión:', error.message); process.exitCode = 1; })
      .finally(() => pool.end());
  }
}
module.exports = { migrar };