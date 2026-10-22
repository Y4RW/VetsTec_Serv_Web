const ACCIONES = ['diagnostico','asignar-red','desactivar-usuario','activar-usuario',
  'cerrar-sesiones','desactivar-propietario','activar-propietario'];
function argumentos(args) {
  const accion = args[0] || 'diagnostico';
  if (!ACCIONES.includes(accion)) throw new Error('Acción no reconocida: ' + ACCIONES.join(', '));
  const opciones = { accion, aplicar: false };
  for (let i=1; i<args.length; i++) {
    const k=args[i];
    if (k==='--aplicar') { if(opciones.aplicar) throw new Error('Opción repetida.'); opciones.aplicar=true; continue; }
    if (!['--usuario','--red','--correo'].includes(k) || !args[i+1] || args[i+1].startsWith('--')) {
      throw new Error('Opciones: --usuario ID --red ID --correo CORREO [--aplicar]');
    }
    if(opciones[k.slice(2)]!==undefined) throw new Error('Opción repetida: '+k);
    opciones[k.slice(2)]=args[++i];
  }
  if(accion==='diagnostico' && args.length>1) throw new Error('El diagnóstico no recibe opciones.');
  return opciones;
}
async function diagnostico(pool) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN READ ONLY');
    await c.query("SET LOCAL statement_timeout='15s'");
    const redes=(await c.query(`
      SELECT r.id AS id_red, r.nombre AS red, p.id_usuario AS propietario,
        u.correo AS correo_propietario, p.activo AS acceso_propietario_activo,
        u.activo AS cuenta_activa, u.correo_verificado,
        (SELECT COUNT(*)::int FROM public.redes_sucursales s WHERE s.id_red=r.id) AS sucursales,
        (SELECT COUNT(*)::int FROM public.usuarios_negocio x
          JOIN public.redes_sucursales s ON s.id_negocio=x.id_negocio WHERE s.id_red=r.id) AS cuentas_asociadas,
        CASE WHEN p.id_usuario IS NOT NULL THEN
          CASE WHEN EXISTS (SELECT 1 FROM public.redes_sucursales s
            WHERE s.id_red=r.id AND s.id_negocio=u.id_negocio)
            THEN 'ASIGNADA: revisar estado del acceso' ELSE 'REVISAR: cuenta fuera de la red' END
          WHEN NOT EXISTS (SELECT 1 FROM public.usuarios_negocio x
            JOIN public.redes_sucursales s ON s.id_negocio=x.id_negocio WHERE s.id_red=r.id)
            THEN 'SIN CUENTA: no asignar a otra persona'
          ELSE 'SIN PROPIETARIO: confirmar titularidad' END AS diagnostico
      FROM public.redes_negocio r
      LEFT JOIN public.redes_propietarios p ON p.id_red=r.id
      LEFT JOIN public.usuarios_negocio u ON u.id=p.id_usuario ORDER BY r.id
    `)).rows;
    const cuentas=(await c.query(`
      SELECT s.id_red, n.id AS id_negocio, n.nombre_establecimiento, u.id AS id_usuario,
        u.correo, u.activo, u.correo_verificado,
        COALESCE(v.estado,'PENDIENTE') AS estado,
        (SELECT COUNT(*)::int FROM public.sesiones_negocio se WHERE se.id_usuario=u.id
          AND se.fecha_expiracion>CURRENT_TIMESTAMP
          AND se.ultimo_uso>CURRENT_TIMESTAMP-INTERVAL '30 minutes') AS sesiones_vigentes
      FROM public.configuracion_negocio n
      LEFT JOIN public.redes_sucursales s ON s.id_negocio=n.id
      LEFT JOIN public.usuarios_negocio u ON u.id_negocio=n.id
      LEFT JOIN public.verificacion_negocio v ON v.id_negocio=n.id
      ORDER BY s.id_red NULLS LAST, n.id, u.id
    `)).rows;
    const protecciones=(await c.query(`
      SELECT c.relname AS tabla, c.relrowsecurity AS rls,
        EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
          AND (has_table_privilege(r.oid,c.oid,'SELECT') OR has_table_privilege(r.oid,c.oid,'INSERT')
            OR has_table_privilege(r.oid,c.oid,'UPDATE') OR has_table_privilege(r.oid,c.oid,'DELETE'))) AS acceso_publico
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('usuarios_negocio','sesiones_negocio','intentos_acceso_negocio','tokens_seguridad',
         'redes_negocio','redes_sucursales','redes_propietarios','productos','proveedores',
         'empleados','servicios','citas','ventas') ORDER BY c.relname
    `)).rows;
    const disparadores=(await c.query(`SELECT tgname AS disparador, tgenabled AS habilitado
      FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
        ('vetstec_revocar_sesiones_usuario','vetstec_revocar_sesiones_propietario') ORDER BY tgname`)).rows;
    await c.query('COMMIT');
    return { redes, cuentas, protecciones, disparadores };
  } catch(e) { await c.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { c.release(); }
}
function entero(valor, nombre) {
  if(!/^[1-9]\d*$/.test(String(valor)) || !Number.isSafeInteger(Number(valor))) throw new Error('Falta '+nombre+' válido.');
  return Number(valor);
}
async function administrar(pool, o) {
  if(!ACCIONES.includes(o.accion) || o.accion==='diagnostico') throw new Error('Acción de administración inválida.');
  const id=entero(o.usuario,'--usuario');
  const esRed=['asignar-red','desactivar-propietario','activar-propietario'].includes(o.accion);
  const red=esRed ? entero(o.red,'--red') : null;
  if(!o.correo) throw new Error('Confirma el correo de esa cuenta con --correo.');
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query("SET LOCAL statement_timeout='15s'");
    await c.query('SELECT pg_advisory_xact_lock(4875332027)');
    const usuario=(await c.query(`SELECT id, correo, id_negocio, activo, correo_verificado
      FROM public.usuarios_negocio WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!usuario || usuario.correo.toLowerCase()!==o.correo.trim().toLowerCase()) {
      throw new Error('El ID y el correo no corresponden a la misma cuenta. No se cambió nada.');
    }
    let propietario;
    if(esRed) {
      const r=(await c.query('SELECT id FROM public.redes_negocio WHERE id=$1 FOR UPDATE',[red])).rows[0];
      if(!r) throw new Error('La red no existe.');
      propietario=(await c.query('SELECT id_usuario, activo FROM public.redes_propietarios WHERE id_red=$1 FOR UPDATE',[red])).rows[0];
      if(o.accion==='asignar-red' && propietario) throw new Error('La red ya tiene propietario. Este script no transfiere propiedad.');
      if(o.accion!=='asignar-red' && propietario?.id_usuario!==id) throw new Error('La cuenta no es la propietaria de esa red.');
      if(o.accion==='asignar-red' || o.accion==='activar-propietario') {
        const pertenece=await c.query('SELECT 1 FROM public.redes_sucursales WHERE id_red=$1 AND id_negocio=$2 FOR SHARE',[red,usuario.id_negocio]);
        if(!pertenece.rowCount) throw new Error('La cuenta pertenece a otro negocio/red. No se vinculará automáticamente.');
        if(!usuario.activo || !usuario.correo_verificado) throw new Error('La cuenta debe estar activa y tener correo verificado.');
      }
    }
    const vista={ accion:o.accion, id_usuario:id, correo:usuario.correo, id_negocio:usuario.id_negocio,
      ...(red ? { id_red:red }:{}), aplicado:o.aplicar===true };
    if(o.aplicar) {
      if(o.accion==='asignar-red') await c.query('INSERT INTO public.redes_propietarios(id_red,id_usuario,activo) VALUES($1,$2,TRUE)',[red,id]);
      else if(o.accion.endsWith('-usuario')) await c.query('UPDATE public.usuarios_negocio SET activo=$1 WHERE id=$2',[o.accion==='activar-usuario',id]);
      else if(o.accion.endsWith('-propietario')) await c.query('UPDATE public.redes_propietarios SET activo=$1 WHERE id_red=$2 AND id_usuario=$3',[o.accion==='activar-propietario',red,id]);
      // Revocar también si se repite una desactivación: ninguna sesión antigua se recupera al reactivar.
      await c.query('DELETE FROM public.sesiones_negocio WHERE id_usuario=$1',[id]);
      await c.query('COMMIT');
    } else await c.query('ROLLBACK');
    return vista;
  } catch(e) { await c.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { c.release(); }
}
async function main() {
  const o=argumentos(process.argv.slice(2));
  require('dotenv').config({ quiet:true });
  if(!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL. Ejecuta desde la raíz del proyecto.');
  const { Pool }=require('pg');
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,connectionTimeoutMillis:10000});
  try {
    if(o.accion==='diagnostico') {
      const r=await diagnostico(pool);
      for(const [nombre,filas] of Object.entries(r)) { console.log('\n'+nombre.toUpperCase()); console.table(filas); }
      console.log('\nSolo lectura. Tener redes sin propietario no autoriza asignarlas a tu cuenta.');
    } else {
      console.table([await administrar(pool,o)]);
      console.log(o.aplicar ? 'Cambio aplicado. Esa cuenta deberá iniciar sesión nuevamente.' :
        'Vista previa: no se cambió nada. Revisa identidad y titularidad antes de repetir con --aplicar.');
    }
  } finally { await pool.end(); }
}
if(require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={ diagnostico, administrar, argumentos };
