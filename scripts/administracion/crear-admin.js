require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { createInterface } = require('node:readline/promises');
const { Writable } = require('node:stream');

async function crearAdministrador(pool, { nombre, correo, password }) {
  nombre = typeof nombre === 'string' ? nombre.trim() : '';
  correo = typeof correo === 'string' ? correo.trim().toLowerCase() : '';
  if (!nombre || nombre.length > 120) {
    throw new Error('El nombre debe tener entre 1 y 120 caracteres.');
  }
  if (correo.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new Error('Escribe un correo válido, de hasta 150 caracteres.');
  }
  if (typeof password !== 'string' || [...password].length < 15 ||
      Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Usa al menos 15 caracteres y como máximo 72 bytes de contraseña.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const resultado = await pool.query(`
      INSERT INTO administradores_vetstec (nombre, correo, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, nombre, correo, rol
    `, [nombre, correo, passwordHash]);
    return resultado.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('Ese correo ya tiene una cuenta administradora. No se modificó.');
    }
    throw error;
  }
}

async function main() {
  let rl;
  let pool;
  try {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('Ejecuta este comando directamente en una terminal interactiva.');
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('Falta DATABASE_URL. Ejecuta desde la raíz del proyecto.');
    }
    let ocultar = false;
    const salida = new Writable({
      write(texto, encoding, done) {
        if (!ocultar) process.stdout.write(texto, encoding);
        done();
      },
    });
    const control = new AbortController();
    rl = createInterface({
      input: process.stdin, output: salida, terminal: true, historySize: 0,
    });
    rl.on('SIGINT', () => control.abort());
    rl.on('close', () => control.abort());
    async function preguntar(texto, secreto = false) {
      const respuesta = rl.question(texto, { signal: control.signal });
      ocultar = secreto;
      try {
        return await respuesta;
      } finally {
        ocultar = false;
        if (secreto) process.stdout.write('\n');
      }
    }
    console.log('Crear cuenta administradora de VetStec. Ctrl+C cancela.');
    console.log('Usa una contraseña nueva para VetStec, diferente a la del correo.');
    const nombre = await preguntar('Nombre de la persona administradora: ');
    const correo = await preguntar('Correo administrativo: ');
    const password = await preguntar('Contraseña de VetStec (mínimo 15 caracteres; no se mostrará): ', true);
    const confirmacion = await preguntar('Repite la contraseña (no se mostrará): ', true);
    if (password !== confirmacion) throw new Error('Las contraseñas no coinciden.');
    rl.close();
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const admin = await crearAdministrador(pool, { nombre, correo, password });
    console.log(`Cuenta creada: ${admin.correo} (ID ${admin.id}).`);
    console.log('Ya puedes iniciar sesión en /admin/acceso.');
  } catch (error) {
    console.error(error.name === 'AbortError'
      ? 'Operación cancelada. No se creó ninguna cuenta.'
      : `No se creó la cuenta: ${error.message}`);
    process.exitCode = 1;
  } finally {
    rl?.close();
    await pool?.end();
  }
}

if (require.main === module) main();
module.exports = { crearAdministrador };