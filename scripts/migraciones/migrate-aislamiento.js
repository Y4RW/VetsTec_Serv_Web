
const TABLAS = [
  'empleados', 'clientes', 'mascotas', 'servicios', 'proveedores',
  'productos', 'movimientos_inventario', 'citas', 'ventas',
  'reportes_financieros_historicos', 'cronometro_servicios', 'pagos_temporales',
];
const RELACIONES = [
  ['mascotas', 'id_cliente', 'clientes'],
  ['productos', 'id_proveedor', 'proveedores'],
  ['movimientos_inventario', 'id_producto', 'productos'],
  ['movimientos_inventario', 'id_empleado', 'empleados'],
  ['citas', 'id_mascota', 'mascotas'],
  ['citas', 'id_empleado', 'empleados'],
  ['citas', 'id_servicio', 'servicios'],
  ['ventas', 'id_cliente', 'clientes'],
  ['ventas', 'id_empleado', 'empleados'],
  ['cronometro_servicios', 'id_cita', 'citas'],
  ['pagos_temporales', 'id_venta', 'ventas'],
];

async function agregarRestriccion(client, tabla, nombre, definicion) {
  const existe = await client.query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = $1::regclass AND conname = $2
  `, [`public.${tabla}`, nombre]);
  if (!existe.rows.length) {
    // tabla, nombre y definicion se construyen solo con constantes de este archivo.
    await client.query(`ALTER TABLE public.${tabla} ADD CONSTRAINT ${nombre} ${definicion}`);
  }
}

async function migrar(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");

    // Se comprueba todo antes de cambiar el esquema.
    for (const tabla of ['configuracion_negocio', ...TABLAS]) {
      const resultado = await client.query('SELECT to_regclass($1) AS tabla', [`public.${tabla}`]);
      if (!resultado.rows[0].tabla) throw new Error(`No existe public.${tabla}. No se aplicó la migración.`);
    }

    for (const tabla of TABLAS) {
      await client.query(`ALTER TABLE public.${tabla} ADD COLUMN IF NOT EXISTS id_negocio INTEGER`);
      await agregarRestriccion(client, tabla, `vst_${tabla}_negocio_fk`,
        'FOREIGN KEY (id_negocio) REFERENCES public.configuracion_negocio(id) ON DELETE RESTRICT NOT VALID');
      await client.query(`ALTER TABLE public.${tabla} VALIDATE CONSTRAINT vst_${tabla}_negocio_fk`);

      await agregarRestriccion(client, tabla, `vst_${tabla}_id_negocio_uq`, 'UNIQUE (id, id_negocio)');
      await client.query(`CREATE INDEX IF NOT EXISTS vst_${tabla}_negocio_idx ON public.${tabla} (id_negocio)`);

      // NOT VALID conserva filas antiguas sin dueño, pero exige negocio para
      // toda fila nueva y para cualquier fila que se actualice después.
      await agregarRestriccion(client, tabla, `vst_${tabla}_negocio_requerido`,
        'CHECK (id_negocio IS NOT NULL) NOT VALID');
    }

    for (const [tabla, columna, destino] of RELACIONES) {
      const nombre = `vst_${tabla}_${columna}_mismo_negocio`;
      await agregarRestriccion(client, tabla, nombre,
        `FOREIGN KEY (${columna}, id_negocio) REFERENCES public.${destino}(id, id_negocio)
         DEFERRABLE INITIALLY IMMEDIATE NOT VALID`);
      await client.query(`ALTER TABLE public.${tabla} VALIDATE CONSTRAINT ${nombre}`);
    }

    // Las sesiones de VetStec se comprueban en Node, no en Supabase Auth.
    // El acceso de Node requiere el rol dueño de las tablas o BYPASSRLS.
    for (const tabla of TABLAS) {
      await client.query(`ALTER TABLE public.${tabla} ENABLE ROW LEVEL SECURITY`);
      await client.query(`REVOKE ALL ON TABLE public.${tabla} FROM PUBLIC`);
      await client.query(`DO $vst$
        DECLARE rol TEXT;
        BEGIN
          FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
              EXECUTE format('REVOKE ALL ON TABLE public.${tabla} FROM %I', rol);
            END IF;
          END LOOP;
        END $vst$`);
    }

    const resumen = [];
    for (const tabla of TABLAS) {
      const resultado = await client.query(`
        SELECT COUNT(*)::integer AS total,
               COUNT(*) FILTER (WHERE id_negocio IS NULL)::integer AS sin_negocio
        FROM public.${tabla}
      `);
      const fila = resultado.rows[0];
      resumen.push({ tabla, ...fila });
      if (fila.sin_negocio === 0) {
        await client.query(`ALTER TABLE public.${tabla} VALIDATE CONSTRAINT vst_${tabla}_negocio_requerido`);
      }
    }
    const productos = await client.query(`
      SELECT id, nombre_producto, id_proveedor, id_negocio
      FROM public.productos WHERE id_negocio IS NULL ORDER BY id LIMIT 100
    `);
    const proveedores = await client.query(`
      SELECT id, nombre_empresa, id_negocio
      FROM public.proveedores WHERE id_negocio IS NULL ORDER BY id LIMIT 100
    `);
    await client.query('COMMIT');
    return { resumen, productos: productos.rows, proveedores: proveedores.rows };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  require('dotenv').config({ quiet: true });
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Ejecuta desde la raíz del proyecto, donde está .env.');
    process.exitCode = 1;
    return;
  }
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  try {
    const informe = await migrar(pool);
    console.log('\nBase de aislamiento preparada. No se asignaron ni borraron registros.');
    console.table(informe.resumen);
    console.log('\nProductos pendientes de asignación (máximo 100):');
    console.table(informe.productos);
    console.log('\nProveedores pendientes de asignación (máximo 100):');
    console.table(informe.proveedores);
    console.log('\nLas filas sin negocio no se muestran en la API privada.');
    console.log('No les asignes un negocio hasta confirmar su pertenencia.');
  } catch (error) {
    console.error('No se pudo completar la migración. Los cambios de esta ejecución se revierten.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) main().catch(() => { process.exitCode = 1; });
module.exports = { migrar };