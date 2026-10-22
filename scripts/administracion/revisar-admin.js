
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { createInterface } = require('node:readline/promises');
const { Writable } = require('node:stream');

function normalizarCorreo(valor) {
  const correo = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (correo.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new Error('Escribe un correo válido.');
  }
  return correo;
}

async function buscarAdministrador(db, correo, bloquear = false) {
  const resultado = await db.query(`
    SELECT id, nombre, correo, activo, rol, password_hash
    FROM administradores_vetstec
    WHERE LOWER(correo) = $1
    ${bloquear ? 'FOR UPDATE' : ''}
  `, [normalizarCorreo(correo)]);
  if (resultado.rows.length !== 1) {
    throw new Error('No se encontró una cuenta única con ese correo en esta conexión. Revisa el correo y la DATABASE_URL del proyecto.');
  }
  return resultado.rows[0];
}

function exigirAcceso(admin) {
  if (admin.activo !== true) throw new Error('La cuenta está desactivada. Revisa su estado antes de continuar.');
  if (admin.rol !== 'ADMIN_VETSTEC') {
    throw new Error('El rol no coincide exactamente con ADMIN_VETSTEC. Este script no cambia permisos.');
  }
}

async function comprobarPassword(admin, password) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) return false;
  if (typeof admin.password_hash !== 'string' ||
      !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(admin.password_hash)) {
    throw new Error('El hash guardado no tiene el formato bcrypt esperado. Puedes restablecer la contraseña con --restablecer.');
  }
  return bcrypt.compare(password, admin.password_hash);
}

async function restablecerPassword(pool, correo, password, confirmacion) {
  correo = normalizarCorreo(correo);
  if (password !== confirmacion) throw new Error('Las contraseñas no coinciden. No se cambió nada.');
  if (typeof password !== 'string' || [...password].length < 15 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('La contraseña nueva debe tener al menos 15 caracteres y como máximo 72 bytes UTF-8.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await buscarAdministrador(client, correo, true);
    exigirAcceso(admin);
    await client.query('UPDATE administradores_vetstec SET password_hash = $1 WHERE id = $2', [passwordHash, admin.id]);
    await client.query('DELETE FROM sesiones_admin WHERE id_admin = $1', [admin.id]);
    const claveHash = crypto.createHash('sha256').update(`correo:${correo}`).digest('hex');
    await client.query('DELETE FROM intentos_acceso_admin WHERE clave_hash = $1', [claveHash]);
    await client.query('COMMIT');
    return { id: admin.id, correo: admin.correo };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  let rl;
  let pool;
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--restablecer')) {
      throw new Error('Uso: node scripts/administracion/revisar-admin.js [--restablecer]');
    }
    const restablecer = args[0] === '--restablecer';
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('Ejecuta el comando directamente en una terminal interactiva.');
    }
    if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL. Ejecuta desde la raíz del proyecto VetStec.');
    let ocultar = false;
    const salida = new Writable({
      write(texto, encoding, done) {
        if (!ocultar) process.stdout.write(texto, encoding);
        done();
      },
    });
    const control = new AbortController();
    rl = createInterface({ input: process.stdin, output: salida, terminal: true, historySize: 0 });
    rl.on('SIGINT', () => control.abort());
    rl.on('close', () => control.abort());
    async function preguntar(texto, secreto = false) {
      const respuesta = rl.question(texto, { signal: control.signal });
      ocultar = secreto;
      try { return await respuesta; }
      finally { ocultar = false; if (secreto) process.stdout.write('\n'); }
    }
    console.log(restablecer ? 'Restablecer contraseña administrativa de VetStec.' : 'Revisar acceso administrativo de VetStec. Esta revisión no cambia datos.');
    console.log(`Carpeta: ${process.cwd()}`);
    console.log('Usando DATABASE_URL del entorno y el .env de esta carpeta.');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      query_timeout: 15000,
    });
    const correo = normalizarCorreo(await preguntar('Correo administrativo: '));
    const admin = await buscarAdministrador(pool, correo);
    console.log(`Cuenta encontrada: ${admin.correo}`);
    console.log(`Activa: ${admin.activo === true ? 'SÍ' : 'NO'}`);
    console.log(`Rol exacto: ${JSON.stringify(admin.rol)}`);
    exigirAcceso(admin);
    if (restablecer) {
      console.log('Se actualizará la contraseña y se cerrarán todas las sesiones administrativas de esta cuenta.');
      const password = await preguntar('Nueva contraseña de VetStec (mínimo 15 caracteres, oculta): ', true);
      const confirmacion = await preguntar('Repite la nueva contraseña (oculta): ', true);
      rl.close();
      await restablecerPassword(pool, correo, password, confirmacion);
      console.log('CONTRASEÑA ACTUALIZADA. Las sesiones anteriores fueron revocadas.');
      console.log('Entra en http://localhost:5173/admin/acceso con la contraseña nueva.');
      console.log('Si aparece un límite por IP, espera el tiempo indicado por la página.');
    } else {
      const password = await preguntar('Contraseña que estás intentando usar (oculta): ', true);
      rl.close();
      if (await comprobarPassword(admin, password)) {
        console.log('CONTRASEÑA CORRECTA en esta conexión.');
        console.log('Si la web aún devuelve 401, reinicia el backend desde esta misma carpeta con npm run dev y escribe las credenciales manualmente.');
      } else {
        console.log('CONTRASEÑA NO COINCIDE con la guardada en esta conexión.');
        console.log('Para elegir una nueva: node scripts/administracion/revisar-admin.js --restablecer');
      }
    }
  } catch (error) {
    console.error(error.name === 'AbortError' ? 'Operación cancelada.' : `No se completó la operación: ${error.message}`);
    process.exitCode = 1;
  } finally {
    rl?.close();
    await pool?.end();
  }
}

if (require.main === module) main();
module.exports = { normalizarCorreo, buscarAdministrador, exigirAcceso, comprobarPassword, restablecerPassword };