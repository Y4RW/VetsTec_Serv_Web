
const NEGOCIO_ID = 9;
const NEGOCIO_NOMBRE = 'Prueba de Registro Vet 2';
const PROVEEDOR_ID = 1;
const PROVEEDOR_NOMBRE = 'Distribuidora Veterinaria CDMX';
const PRODUCTOS = [
  { id: 1, nombre: 'Champú Antipulgas 500ml' },
  { id: 2, nombre: 'Jabón Medicado Avena' },
];

async function asignar(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");

    const negocio = await client.query(`
      SELECT n.id, n.nombre_establecimiento, v.estado
      FROM public.configuracion_negocio n
      JOIN public.verificacion_negocio v ON v.id_negocio = n.id
      WHERE n.id = $1 FOR UPDATE OF n, v
    `, [NEGOCIO_ID]);
    const destino = negocio.rows[0];
    if (!destino || destino.nombre_establecimiento !== NEGOCIO_NOMBRE) {
      throw new Error('El negocio 9 no coincide con Prueba de Registro Vet 2. Revisa el destino.');
    }
    if (destino.estado !== 'APROBADO') throw new Error('El establecimiento 9 todavía no está aprobado.');
    const cuenta = await client.query(`
      SELECT id FROM public.usuarios_negocio
      WHERE id_negocio = $1 AND activo = TRUE AND correo_verificado = TRUE
      ORDER BY id LIMIT 1 FOR SHARE
    `, [NEGOCIO_ID]);
    if (!cuenta.rows.length) throw new Error('El negocio 9 necesita una cuenta activa con correo verificado.');

    const proveedor = await client.query(`
      SELECT id, nombre_empresa, id_negocio FROM public.proveedores
      WHERE id = $1 FOR UPDATE
    `, [PROVEEDOR_ID]);
    const prov = proveedor.rows[0];
    if (!prov || prov.nombre_empresa !== PROVEEDOR_NOMBRE) {
      throw new Error('El proveedor 1 no coincide con Distribuidora Veterinaria CDMX.');
    }
    if (prov.id_negocio !== null && prov.id_negocio !== NEGOCIO_ID) {
      throw new Error('El proveedor ya pertenece a otro negocio. No se reasignará.');
    }

    const ids = PRODUCTOS.map(p => p.id);
    const productos = await client.query(`
      SELECT id, nombre_producto, id_proveedor, id_negocio FROM public.productos
      WHERE id = ANY($1::integer[]) ORDER BY id FOR UPDATE
    `, [ids]);
    for (const esperado of PRODUCTOS) {
      const producto = productos.rows.find(p => p.id === esperado.id);
      if (!producto || producto.nombre_producto !== esperado.nombre || producto.id_proveedor !== PROVEEDOR_ID) {
        throw new Error(`El producto ${esperado.id} no coincide con el diagnóstico. Revisa su nombre y proveedor.`);
      }
      if (producto.id_negocio !== null && producto.id_negocio !== NEGOCIO_ID) {
        throw new Error(`El producto ${esperado.id} ya pertenece a otro negocio. No se reasignará.`);
      }
    }

    // El proveedor se asigna primero para satisfacer la relación compuesta.
    const cambioProveedor = await client.query(`
      UPDATE public.proveedores SET id_negocio = $1
      WHERE id = $2 AND id_negocio IS NULL RETURNING id
    `, [NEGOCIO_ID, PROVEEDOR_ID]);
    const cambioProductos = await client.query(`
      UPDATE public.productos SET id_negocio = $1
      WHERE id = ANY($2::integer[]) AND id_negocio IS NULL RETURNING id
    `, [NEGOCIO_ID, ids]);

    const resultado = await client.query(`
      SELECT p.id, p.nombre_producto, p.id_negocio,
             n.nombre_establecimiento, pr.nombre_empresa AS proveedor
      FROM public.productos p
      JOIN public.configuracion_negocio n ON n.id = p.id_negocio
      JOIN public.proveedores pr ON pr.id = p.id_proveedor AND pr.id_negocio = p.id_negocio
      WHERE p.id = ANY($1::integer[]) ORDER BY p.id
    `, [ids]);
    if (resultado.rows.length !== 2 || resultado.rows.some(p => p.id_negocio !== NEGOCIO_ID)) {
      throw new Error('No se pudo comprobar la asignación completa.');
    }
    await client.query('COMMIT');
    return {
      cambios: cambioProveedor.rows.length + cambioProductos.rows.length,
      productos: resultado.rows,
    };
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
    const resultado = await asignar(pool);
    console.log(resultado.cambios
      ? 'Asignación completada: 2 productos y 1 proveedor vinculados al negocio 9.'
      : 'Los 2 productos y el proveedor ya estaban asignados al negocio 9.');
    console.table(resultado.productos);
    console.log('Comprueba /api/productos con la cuenta de Prueba de Registro Vet 2.');
  } catch (error) {
    console.error('La asignación no se completó; se revierten los cambios de esta ejecución.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) main().catch(() => { process.exitCode = 1; });
module.exports = { asignar };