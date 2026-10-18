require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function inspectRegistro() {
  try {
    const idNegocio = Number(process.argv[2]);

    if (!idNegocio) {
      console.log("❌ Indica el ID del negocio.");
      console.log("Ejemplo: node inspect-registro.js 7");
      return;
    }

    const result = await pool.query(
      `
      SELECT
        n.id AS id_negocio,
        n.nombre_establecimiento,
        n.tipo_servicio,
        n.telefono_whatsapp,
        n.correo_contacto,
        n.codigo_postal,
        n.logo_url,
        n.activo_directorio,

        u.id AS id_usuario,
        u.correo AS correo_acceso,
        u.correo_verificado,
        u.dos_pasos_activo,
        u.activo AS usuario_activo,
        CASE
          WHEN u.password_hash IS NOT NULL
            AND u.password_hash <> ''
          THEN TRUE
          ELSE FALSE
        END AS password_cifrada,

        v.estado AS estado_verificacion,
        v.nombre_responsable,
        v.cedula_profesional,
        v.foto_establecimiento_url,
        v.fecha_solicitud

      FROM configuracion_negocio n

      LEFT JOIN usuarios_negocio u
        ON u.id_negocio = n.id

      LEFT JOIN verificacion_negocio v
        ON v.id_negocio = n.id

      WHERE n.id = $1
      `,
      [idNegocio]
    );

    if (result.rowCount === 0) {
      console.log("❌ No se encontró el negocio.");
      return;
    }

    console.log("\n🔍 REGISTRO DEL NEGOCIO\n");
    console.table(result.rows);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
  }
}

inspectRegistro();