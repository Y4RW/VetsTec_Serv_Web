const TABLAS = [
  'usuarios_negocio', 'sesiones_negocio', 'intentos_acceso_negocio', 'tokens_seguridad',
  'redes_negocio', 'redes_sucursales', 'redes_propietarios',
  'empleados', 'clientes', 'mascotas', 'servicios', 'proveedores', 'productos',
  'movimientos_inventario', 'citas', 'ventas', 'reportes_financieros_historicos',
  'cronometro_servicios', 'pagos_temporales',
];
async function migrar(pool) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query("SET LOCAL statement_timeout='30s'");
    await c.query('SELECT pg_advisory_xact_lock(4875332027)');
    for (const tabla of TABLAS) {
      const r = await c.query('SELECT to_regclass($1) AS tabla', ['public.' + tabla]);
      if (!r.rows[0].tabla) throw new Error('Falta ' + tabla + '. Completa primero las migraciones anteriores.');
    }
    await c.query(`ALTER TABLE public.redes_propietarios
      ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE`);
    await c.query(`
      CREATE OR REPLACE FUNCTION public.vetstec_revocar_sesiones_usuario()
      RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
      BEGIN
        IF OLD.activo IS DISTINCT FROM NEW.activo
          OR OLD.correo_verificado IS DISTINCT FROM NEW.correo_verificado
          OR OLD.password_hash IS DISTINCT FROM NEW.password_hash
          OR OLD.correo IS DISTINCT FROM NEW.correo
          OR OLD.id_negocio IS DISTINCT FROM NEW.id_negocio
          OR OLD.dos_pasos_activo IS DISTINCT FROM NEW.dos_pasos_activo THEN
          DELETE FROM public.sesiones_negocio WHERE id_usuario=OLD.id;
        END IF;
        RETURN NEW;
      END $$;
      DROP TRIGGER IF EXISTS vetstec_revocar_sesiones_usuario ON public.usuarios_negocio;
      CREATE TRIGGER vetstec_revocar_sesiones_usuario
        AFTER UPDATE ON public.usuarios_negocio FOR EACH ROW
        EXECUTE FUNCTION public.vetstec_revocar_sesiones_usuario();

      CREATE OR REPLACE FUNCTION public.vetstec_revocar_sesiones_propietario()
      RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
      BEGIN
        IF TG_OP='DELETE' THEN
          DELETE FROM public.sesiones_negocio WHERE id_usuario=OLD.id_usuario;
          RETURN OLD;
        ELSIF TG_OP='INSERT' THEN
          DELETE FROM public.sesiones_negocio WHERE id_usuario=NEW.id_usuario;
          RETURN NEW;
        END IF;
        IF OLD.id_usuario IS DISTINCT FROM NEW.id_usuario
          OR OLD.id_red IS DISTINCT FROM NEW.id_red
          OR OLD.activo IS DISTINCT FROM NEW.activo THEN
          DELETE FROM public.sesiones_negocio
            WHERE id_usuario IN (OLD.id_usuario, NEW.id_usuario);
        END IF;
        RETURN NEW;
      END $$;
      DROP TRIGGER IF EXISTS vetstec_revocar_sesiones_propietario ON public.redes_propietarios;
      CREATE TRIGGER vetstec_revocar_sesiones_propietario
        AFTER INSERT OR UPDATE OR DELETE ON public.redes_propietarios FOR EACH ROW
        EXECUTE FUNCTION public.vetstec_revocar_sesiones_propietario();
    `);
    // Solo el servidor usa DATABASE_URL. anon/authenticated no acceden a datos privados.
    const roles = (await c.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')")).rows;
    for (const tabla of TABLAS) {
      await c.query(`ALTER TABLE public.${tabla} ENABLE ROW LEVEL SECURITY`);
      await c.query(`REVOKE ALL ON TABLE public.${tabla} FROM PUBLIC`);
      for (const { rolname } of roles) await c.query(`REVOKE ALL ON TABLE public.${tabla} FROM ${rolname}`);
    }
    for (const funcion of ['vetstec_revocar_sesiones_usuario', 'vetstec_revocar_sesiones_propietario']) {
      await c.query(`REVOKE ALL ON FUNCTION public.${funcion}() FROM PUBLIC`);
      for (const { rolname } of roles) await c.query(`REVOKE ALL ON FUNCTION public.${funcion}() FROM ${rolname}`);
    }
    const revocadas = await c.query(`DELETE FROM public.sesiones_negocio s USING public.usuarios_negocio u
      WHERE s.id_usuario=u.id AND (NOT u.activo OR NOT u.correo_verificado OR u.dos_pasos_activo)`);
    await c.query('COMMIT');
    return { tablas_protegidas: TABLAS.length, sesiones_invalidas_revocadas: revocadas.rowCount };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
if (require.main === module) {
  require('dotenv').config({ quiet: true });
  const { Pool } = require('pg');
  if (!process.env.DATABASE_URL) { console.error('Falta DATABASE_URL. Ejecuta desde la raíz.'); process.exitCode=1; }
  else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000 });
    migrar(pool).then(r => {
      console.log('Permisos preparados. No se asignaron propietarios ni se borraron registros del negocio.');
      console.table([r]);
    }).catch(e => { console.error('Migración revertida:', e.message); process.exitCode=1; })
      .finally(() => pool.end());
  }
}
module.exports = { migrar, TABLAS };
