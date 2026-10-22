
 // Copiar a scripts/migraciones/migrate-sucursales.js
// Ejecutar desde la raíz: node scripts/migraciones/migrate-sucursales.js
// Cada establecimiento existente empieza en su propia red: no se fusionan negocios.
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

async function migrar() {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("SET LOCAL lock_timeout = '5s'");
    await cliente.query("SET LOCAL statement_timeout = '60s'");
    await cliente.query('SELECT pg_advisory_xact_lock(4875332026)');
    for (const tabla of ['configuracion_negocio', 'usuarios_negocio', 'verificacion_negocio']) {
      const { rows } = await cliente.query('SELECT to_regclass($1) AS tabla', [`public.${tabla}`]);
      if (!rows[0].tabla) throw new Error(`Falta la tabla ${tabla}`);
    }
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS public.redes_negocio (
        id BIGSERIAL PRIMARY KEY,
        nombre VARCHAR(160) NOT NULL CHECK (length(trim(nombre)) > 0),
        fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS public.redes_sucursales (
        id_negocio INTEGER PRIMARY KEY REFERENCES public.configuracion_negocio(id) ON DELETE RESTRICT,
        id_red BIGINT NOT NULL REFERENCES public.redes_negocio(id) ON DELETE RESTRICT,
        es_principal BOOLEAN NOT NULL DEFAULT FALSE,
        fecha_asociacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS redes_sucursales_principal_idx
        ON public.redes_sucursales(id_red) WHERE es_principal = TRUE;
      CREATE INDEX IF NOT EXISTS redes_sucursales_red_idx
        ON public.redes_sucursales(id_red);
      CREATE TABLE IF NOT EXISTS public.redes_propietarios (
        id_red BIGINT PRIMARY KEY REFERENCES public.redes_negocio(id) ON DELETE RESTRICT,
        id_usuario INTEGER NOT NULL REFERENCES public.usuarios_negocio(id) ON DELETE RESTRICT,
        fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS redes_propietarios_usuario_idx
        ON public.redes_propietarios(id_usuario);
    `);

    // No mezclamos los negocios previamente registrados. Un negocio existente = una red inicial.
    const negocios = await cliente.query(`
      SELECT n.id, n.nombre_establecimiento
      FROM public.configuracion_negocio n
      LEFT JOIN public.redes_sucursales s ON s.id_negocio = n.id
      WHERE s.id_negocio IS NULL ORDER BY n.id
    `);
    for (const negocio of negocios.rows) {
      const nombre = String(negocio.nombre_establecimiento || `Negocio ${negocio.id}`).trim();
      const nueva = await cliente.query(
        'INSERT INTO public.redes_negocio(nombre) VALUES ($1) RETURNING id', [nombre]
      );
      await cliente.query(`
        INSERT INTO public.redes_sucursales(id_red, id_negocio, es_principal)
        VALUES ($1, $2, TRUE)
      `, [nueva.rows[0].id, negocio.id]);
    }

    // Asignación inicial: si existe UNA cuenta asociada al establecimiento.
    // Con dos o más cuentas no se elige arbitrariamente a alguien como propietario.
    await cliente.query(`
      INSERT INTO public.redes_propietarios (id_red, id_usuario)
      SELECT s.id_red, MIN(u.id)::INTEGER
      FROM public.redes_sucursales s
      INNER JOIN public.usuarios_negocio u ON u.id_negocio = s.id_negocio
      GROUP BY s.id_red
      HAVING COUNT(DISTINCT u.id) = 1
      ON CONFLICT (id_red) DO NOTHING
    `);

    // Mantener estas relaciones fuera del acceso directo de Supabase anon/authenticated.
    for (const tabla of ['redes_negocio', 'redes_sucursales', 'redes_propietarios']) {
      await cliente.query(`ALTER TABLE public.${tabla} ENABLE ROW LEVEL SECURITY`);
      await cliente.query(`REVOKE ALL ON public.${tabla} FROM PUBLIC`);
      for (const rol of ['anon', 'authenticated']) {
        const existe = await cliente.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [rol]);
        if (existe.rowCount) await cliente.query(`REVOKE ALL ON public.${tabla} FROM ${rol}`);
      }
    }
    await cliente.query('REVOKE ALL ON SEQUENCE public.redes_negocio_id_seq FROM PUBLIC');
    for (const rol of ['anon', 'authenticated']) {
      const existe = await cliente.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [rol]);
      if (existe.rowCount) {
        await cliente.query(`REVOKE ALL ON SEQUENCE public.redes_negocio_id_seq FROM ${rol}`);
      }
    }

    const { rows } = await cliente.query(`
      SELECT (SELECT COUNT(*)::int FROM public.redes_negocio) AS redes,
             (SELECT COUNT(*)::int FROM public.redes_sucursales) AS sucursales,
             (SELECT COUNT(*)::int FROM public.redes_propietarios) AS propietarios,
             (SELECT COUNT(*)::int FROM public.redes_negocio r
               WHERE NOT EXISTS (SELECT 1 FROM public.redes_propietarios p WHERE p.id_red=r.id)
             ) AS redes_sin_propietario
    `);
    await cliente.query('COMMIT');
    console.log('Estructura preparada. No se borraron datos ni se unieron negocios diferentes.');
    console.table(rows);
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
    await pool.end();
  }
}

migrar().catch(error => { console.error('Migración revertida:', error.message); process.exitCode = 1; });
