require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const registroUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const permitidos = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!permitidos.includes(file.mimetype)) {
      return cb(
        new Error("Solo se permiten imágenes JPG, PNG o WEBP")
      );
    }

    cb(null, true);
  },
});

const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    realtime: {
      transport: WebSocket,
    },
  }
);

const PORT = process.env.PORT || 3000;

const emailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

/* =========================================================
   MIDDLEWARES
   ========================================================= */

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin(origin, callback) {
      // Permite peticiones sin origin:
      // Postman, Thunder Client, navegador directo, etc.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error('Origen no permitido por CORS')
      );
    },
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ],
  })
);

app.use(express.json());

/* =========================================================
   POSTGRESQL
   ========================================================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Supabase requiere SSL
  ssl: {
    rejectUnauthorized: false,
  },
});

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT NOW() AS server_time'
    );

    res.status(200).json({
      success: true,
      message: 'VetStec API funcionando correctamente',
      database: 'connected',
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error(
      'Error verificando la base de datos:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'La API funciona, pero no hay conexión con la BD',
      database: 'disconnected',
    });
  }
});

/* =========================================================
   PRODUCTOS
   Ruta que ya tenían
   ========================================================= */

app.get('/api/productos/:id', async (req, res) => {
  const productoId = req.params.id;

  try {
    const queryText =
      'SELECT * FROM productos WHERE id = $1';

    const { rows } = await pool.query(
      queryText,
      [productoId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Producto con ID ${productoId} no encontrado`,
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error(
      'Error consultando producto:',
      error.message
    );

    res.status(500).json({
      success: false,
      message:
        'Error del servidor al consultar el producto',
    });
  }
});

/* =========================================================
   API EXTERNA - RAZAS DE PERROS
   ========================================================= */

app.get('/api/razas-perros', async (req, res) => {
  try {
    const response = await axios.get(
      'https://dog.ceo/api/breeds/list/all',
      {
        timeout: 8000,
      }
    );

    res.json({
      success: true,
      origen: 'API Externa (Dog CEO)',
      data: response.data.message,
    });
  } catch (error) {
    console.error(
      'Error consultando Dog CEO:',
      error.message
    );

    res.status(502).json({
      success: false,
      message:
        'No fue posible consultar el catálogo de razas',
    });
  }
});

/* =========================================================
   DIRECTORIO PÚBLICO - ESTABLECIMIENTOS
   ========================================================= */

app.get('/api/establecimientos', async (req, res) => {
  try {
    const query = `
      SELECT
        n.id,
        n.nombre_establecimiento,
        n.tipo_servicio,
        n.telefono_whatsapp,
        n.direccion,
        n.codigo_postal,
        n.correo_contacto,
        n.descripcion,
        n.logo_url,
        n.latitud,
        n.longitud,

        COALESCE(
          json_agg(
            json_build_object(
              'dia_semana', h.dia_semana,
              'hora_apertura', h.hora_apertura,
              'hora_cierre', h.hora_cierre,
              'cerrado', h.cerrado
            )
            ORDER BY h.dia_semana
          )
          FILTER (WHERE h.id IS NOT NULL),
          '[]'::json
        ) AS horarios

      FROM configuracion_negocio n

      LEFT JOIN horarios_negocio h
        ON h.id_negocio = n.id

      WHERE n.activo_directorio = TRUE

      GROUP BY n.id

      ORDER BY n.nombre_establecimiento ASC;
    `;

    const { rows } = await pool.query(query);

    res.status(200).json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error(
      'Error consultando establecimientos:',
      error.message
    );

    res.status(500).json({
      success: false,
      message:
        'No fue posible consultar los establecimientos',
    });
  }
});

/* =========================================================
   DIRECTORIO - DISPONIBILIDAD DE UN ESTABLECIMIENTO
   ========================================================= */

function convertirHoraAMinutos(hora) {
  if (!hora) {
    return null;
  }

  const [horas, minutos] = hora
    .slice(0, 5)
    .split(':')
    .map(Number);

  return horas * 60 + minutos;
}

function minutosAHora(minutosTotales) {
  const horas = Math.floor(
    minutosTotales / 60
  );

  const minutos =
    minutosTotales % 60;

  return `${String(horas).padStart(
    2,
    '0'
  )}:${String(minutos).padStart(
    2,
    '0'
  )}`;
}

function generarHorarios(
  horaApertura,
  horaCierre,
  horariosOcupados = []
) {
  const inicio =
    convertirHoraAMinutos(
      horaApertura
    );

  const fin =
    convertirHoraAMinutos(
      horaCierre
    );

  if (
    inicio === null ||
    fin === null ||
    inicio >= fin
  ) {
    return [];
  }

  const ocupados = new Set(
    horariosOcupados.map(
      (hora) => hora.slice(0, 5)
    )
  );

  const horarios = [];

  /*
   * Por ahora utilizamos intervalos de
   * 60 minutos.
   *
   * Posteriormente podremos sustituir esto
   * por la duración real de los servicios.
   */
  for (
    let minuto = inicio;
    minuto < fin;
    minuto += 60
  ) {
    const hora =
      minutosAHora(minuto);

    if (!ocupados.has(hora)) {
      horarios.push(hora);
    }
  }

  return horarios;
}

app.get(
  '/api/establecimientos/:id/disponibilidad',
  async (req, res) => {
    const negocioId =
      Number(req.params.id);

    if (
      !Number.isInteger(
        negocioId
      ) ||
      negocioId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'El identificador del establecimiento no es válido',
      });
    }

    try {
      /* =============================================
         VERIFICAR QUE EL NEGOCIO EXISTA
         ============================================= */

      const negocioResult =
        await pool.query(
          `
            SELECT
              id,
              nombre_establecimiento
            FROM configuracion_negocio
            WHERE id = $1
              AND activo_directorio = TRUE
            LIMIT 1
          `,
          [negocioId]
        );

      if (
        negocioResult.rows
          .length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            'Establecimiento no encontrado',
        });
      }

      /* =============================================
         DISPONIBILIDAD DE LOS PRÓXIMOS 7 DÍAS
         ============================================= */

      const disponibilidadResult =
        await pool.query(
          `
            SELECT
              d.id,
              d.fecha,
              d.capacidad_maxima,
              d.activo,

              h.hora_apertura,
              h.hora_cierre,
              h.cerrado,

              COUNT(s.id)::integer
                AS solicitudes_actuales

            FROM disponibilidad_negocio d

            LEFT JOIN horarios_negocio h
              ON h.id_negocio =
                d.id_negocio

              AND h.dia_semana =
                EXTRACT(
                  DOW FROM d.fecha
                )::integer

            LEFT JOIN solicitudes_cita_publicas s
              ON s.id_negocio =
                d.id_negocio

              AND s.fecha_solicitada =
                d.fecha

              AND s.estado IN (
                'PENDIENTE',
                'ACEPTADA',
                'CONFIRMADA'
              )

            WHERE d.id_negocio = $1

              AND d.fecha >=
                CURRENT_DATE + 1

              AND d.fecha <=
                CURRENT_DATE + 7

            GROUP BY
              d.id,
              d.fecha,
              d.capacidad_maxima,
              d.activo,
              h.hora_apertura,
              h.hora_cierre,
              h.cerrado

            ORDER BY
              d.fecha ASC
          `,
          [negocioId]
        );

      const disponibilidad = [];

      for (
        const dia of
        disponibilidadResult.rows
      ) {
        const ocupadosResult =
          await pool.query(
            `
              SELECT
                hora_solicitada

              FROM solicitudes_cita_publicas

              WHERE id_negocio = $1

                AND fecha_solicitada = $2

                AND estado IN (
                  'PENDIENTE',
                  'ACEPTADA',
                  'CONFIRMADA'
                )
            `,
            [
              negocioId,
              dia.fecha,
            ]
          );

        const horariosOcupados =
          ocupadosResult.rows.map(
            (item) =>
              item.hora_solicitada
          );

        const utilizados =
          dia.solicitudes_actuales;

        const capacidad =
          dia.capacidad_maxima;

        const restantes =
          Math.max(
            capacidad -
              utilizados,
            0
          );

        let estado =
          'available';

        /*
         * Si el negocio cerró ese día,
         * la disponibilidad está desactivada
         * o ya llegó a su capacidad:
         */
        if (
          !dia.activo ||
          dia.cerrado ||
          !dia.hora_apertura ||
          !dia.hora_cierre ||
          restantes === 0
        ) {
          estado = 'full';
        } else {
          /*
           * Consideramos disponibilidad limitada
           * cuando queda 40% o menos
           * de la capacidad.
           */
          const limite =
            Math.max(
              1,
              Math.ceil(
                capacidad * 0.4
              )
            );

          if (
            restantes <= limite
          ) {
            estado =
              'limited';
          }
        }

        let horarios = [];

        if (
          estado !== 'full'
        ) {
          horarios =
            generarHorarios(
              dia.hora_apertura,
              dia.hora_cierre,
              horariosOcupados
            );
        }

        disponibilidad.push({
          date: dia.fecha,
          status: estado,

          capacity:
            capacidad,

          used:
            utilizados,

          remaining:
            restantes,

          openTime:
            dia.hora_apertura,

          closeTime:
            dia.hora_cierre,

          slots:
            horarios,
        });
      }

      res.status(200).json({
        success: true,

        establishment: {
          id:
            negocioResult.rows[0]
              .id,

          name:
            negocioResult.rows[0]
              .nombre_establecimiento,
        },

        total:
          disponibilidad.length,

        data:
          disponibilidad,
      });
    } catch (error) {
      console.error(
        'Error consultando disponibilidad:',
        error.message
      );

      res.status(500).json({
        success: false,

        message:
          'No fue posible consultar la disponibilidad',
      });
    }
  }
);

/* =========================================================
   SOLICITUD PÚBLICA DE CITA
   ========================================================= */

app.post('/api/solicitudes-cita', async (req, res) => {
  const {
    idNegocio,
    nombreMascota,
    telefono,
    fecha,
    hora,
  } = req.body;

  const negocioId = Number(idNegocio);

  const mascota =
    typeof nombreMascota === 'string'
      ? nombreMascota.trim()
      : '';

  const telefonoLimpio =
    typeof telefono === 'string'
      ? telefono.replace(/\D/g, '')
      : '';

  /* =========================
     VALIDACIONES BÁSICAS
     ========================= */

  if (
    !Number.isInteger(negocioId) ||
    negocioId <= 0
  ) {
    return res.status(400).json({
      success: false,
      message:
        'El establecimiento seleccionado no es válido.',
    });
  }

  if (
    mascota.length < 1 ||
    mascota.length > 80
  ) {
    return res.status(400).json({
      success: false,
      message:
        'Escribe un nombre válido para la mascota.',
    });
  }

  if (telefonoLimpio.length !== 10) {
    return res.status(400).json({
      success: false,
      message:
        'El teléfono debe contener 10 dígitos.',
    });
  }

  if (
    typeof fecha !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha)
  ) {
    return res.status(400).json({
      success: false,
      message:
        'La fecha seleccionada no es válida.',
    });
  }

  if (
    typeof hora !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)
  ) {
    return res.status(400).json({
      success: false,
      message:
        'El horario seleccionado no es válido.',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    /* =========================
       VERIFICAR NEGOCIO
       ========================= */

    const negocioResult =
      await client.query(
        `
          SELECT
            id,
            nombre_establecimiento

          FROM configuracion_negocio

          WHERE id = $1
            AND activo_directorio = TRUE

          LIMIT 1
        `,
        [negocioId]
      );

    if (negocioResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message:
          'El establecimiento ya no se encuentra disponible.',
      });
    }

    /* =========================
       VERIFICAR FECHA
       ========================= */

    const fechaResult =
      await client.query(
        `
          SELECT
            ($1::date > CURRENT_DATE)
              AS es_futura
        `,
        [fecha]
      );

    if (!fechaResult.rows[0].es_futura) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        success: false,
        message:
          'Solo puedes solicitar citas para fechas futuras.',
      });
    }

    /* ==================================================
       BLOQUEAMOS LA DISPONIBILIDAD DE ESE DÍA
       Esto ayuda a evitar concurrencia.
       ================================================== */

    const disponibilidadResult =
      await client.query(
        `
          SELECT
            id,
            capacidad_maxima,
            activo

          FROM disponibilidad_negocio

          WHERE id_negocio = $1
            AND fecha = $2

          FOR UPDATE
        `,
        [
          negocioId,
          fecha,
        ]
      );

    if (
      disponibilidadResult.rows.length === 0 ||
      !disponibilidadResult.rows[0].activo
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'El establecimiento no publicó disponibilidad para ese día.',
      });
    }

    /* =========================
       VERIFICAR HORARIO
       ========================= */

    const horarioResult =
      await client.query(
        `
          SELECT
            hora_apertura,
            hora_cierre,
            cerrado

          FROM horarios_negocio

          WHERE id_negocio = $1

            AND dia_semana =
              EXTRACT(
                DOW FROM $2::date
              )::integer

          LIMIT 1
        `,
        [
          negocioId,
          fecha,
        ]
      );

    if (
      horarioResult.rows.length === 0 ||
      horarioResult.rows[0].cerrado
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'El establecimiento permanece cerrado ese día.',
      });
    }

    const horario =
      horarioResult.rows[0];

    const dentroDelHorario =
      await client.query(
        `
          SELECT
            (
              $1::time >= $2::time
              AND
              $1::time < $3::time
            ) AS valido
        `,
        [
          hora,
          horario.hora_apertura,
          horario.hora_cierre,
        ]
      );

    if (!dentroDelHorario.rows[0].valido) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'El horario seleccionado se encuentra fuera del horario de atención.',
      });
    }

    /* =========================
       CAPACIDAD DEL DÍA
       ========================= */

    const cantidadResult =
      await client.query(
        `
          SELECT
            COUNT(*)::integer AS total

          FROM solicitudes_cita_publicas

          WHERE id_negocio = $1
            AND fecha_solicitada = $2

            AND estado IN (
              'PENDIENTE',
              'ACEPTADA',
              'CONFIRMADA'
            )
        `,
        [
          negocioId,
          fecha,
        ]
      );

    const utilizadas =
      cantidadResult.rows[0].total;

    const capacidad =
      disponibilidadResult.rows[0]
        .capacidad_maxima;

    if (utilizadas >= capacidad) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'Ese día ya alcanzó su capacidad máxima. Selecciona otra fecha.',
      });
    }

    /* =========================
       HORARIO YA OCUPADO
       ========================= */

    const horarioOcupado =
      await client.query(
        `
          SELECT id

          FROM solicitudes_cita_publicas

          WHERE id_negocio = $1
            AND fecha_solicitada = $2
            AND hora_solicitada = $3::time

            AND estado IN (
              'PENDIENTE',
              'ACEPTADA',
              'CONFIRMADA'
            )

          LIMIT 1
        `,
        [
          negocioId,
          fecha,
          hora,
        ]
      );

    if (horarioOcupado.rows.length > 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'Ese horario acaba de ser solicitado. Selecciona otro horario.',
      });
    }

    /* =========================
       GUARDAR SOLICITUD
       ========================= */

    const insertResult =
      await client.query(
        `
          INSERT INTO solicitudes_cita_publicas (
            id_negocio,
            nombre_mascota,
            telefono,
            fecha_solicitada,
            hora_solicitada,
            estado
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'PENDIENTE'
          )

          RETURNING
            id,
            id_negocio,
            nombre_mascota,
            fecha_solicitada,
            hora_solicitada,
            estado,
            fecha_solicitud
        `,
        [
          negocioId,
          mascota,
          telefonoLimpio,
          fecha,
          hora,
        ]
      );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,

      message:
        'Solicitud enviada correctamente.',

      data: insertResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(
      'Error registrando solicitud de cita:',
      error.message
    );

    res.status(500).json({
      success: false,
      message:
        'No fue posible registrar la solicitud de cita.',
    });
  } finally {
    client.release();
  }
});

/* =========================================================
   CONTACTO PÚBLICO
   ========================================================= */

app.post('/api/contacto', async (req, res) => {
  const {
    nombre,
    correo,
    descripcion,
  } = req.body;

  const nombreLimpio =
    typeof nombre === 'string'
      ? nombre.trim()
      : '';

  const correoLimpio =
    typeof correo === 'string'
      ? correo.trim().toLowerCase()
      : '';

  const descripcionLimpia =
    typeof descripcion === 'string'
      ? descripcion.trim()
      : '';

  /* =========================
     VALIDACIONES
     ========================= */

  if (
    nombreLimpio.length < 2 ||
    nombreLimpio.length > 120
  ) {
    return res.status(400).json({
      success: false,
      message:
        'Escribe un nombre válido.',
    });
  }

  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !emailRegex.test(correoLimpio) ||
    correoLimpio.length > 150
  ) {
    return res.status(400).json({
      success: false,
      message:
        'Escribe un correo electrónico válido.',
    });
  }

  if (
    descripcionLimpia.length < 10 ||
    descripcionLimpia.length > 2000
  ) {
    return res.status(400).json({
      success: false,
      message:
        'El mensaje debe contener entre 10 y 2000 caracteres.',
    });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO mensajes_contacto (
          nombre,
          correo,
          descripcion,
          estado
        )

        VALUES (
          $1,
          $2,
          $3,
          'NUEVO'
        )

        RETURNING
          id,
          nombre,
          correo,
          estado,
          fecha_envio
      `,
      [
        nombreLimpio,
        correoLimpio,
        descripcionLimpia,
      ]
    );

    res.status(201).json({
      success: true,
      message:
        'Tu mensaje fue enviado correctamente.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error(
      'Error registrando mensaje de contacto:',
      error.message
    );

    res.status(500).json({
      success: false,
      message:
        'No fue posible enviar tu mensaje. Inténtalo nuevamente.',
    });
  }
});

async function subirArchivoASupabase(
  file,
  bucket,
  carpeta = 'general',
  esPublico = false
) {
  if (!file) {
    throw new Error('No se recibió ningún archivo');
  }

  const tiposPermitidos = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  const extension = tiposPermitidos[file.mimetype];

  if (!extension) {
    throw new Error(
      'Solo se permiten imágenes JPG, PNG o WEBP'
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error(
      'La imagen no puede superar los 5 MB'
    );
  }

  const nombreArchivo =
    `${carpeta}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(nombreArchivo, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  if (esPublico) {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(nombreArchivo);

    return {
      path: nombreArchivo,
      publicUrl: data.publicUrl,
    };
  }

  return {
    path: nombreArchivo,
  };
}

app.post(
  "/api/registro-negocio",
  registroUpload.fields([
    { name: "logo", maxCount: 1 },
    { name: "evidencia", maxCount: 1 },
  ]),
  async (req, res) => {
    const client = await pool.connect();

    let logoPath = null;
    let evidenciaPath = null;

    try {
      const {
        nombreEstablecimiento,
        tipoServicio,
        telefonoWhatsapp,
        correoContacto,
        direccion,
        codigoPostal,
        descripcion,
        latitud,
        longitud,
        correo,
        password,
        nombreResponsable,
        cedulaProfesional,
      } = req.body;

      // ==========================================
      // VALIDACIONES
      // ==========================================

      const tiposPermitidos = [
        "VETERINARIA",
        "ESTETICA",
        "AMBAS",
      ];

      if (
        !nombreEstablecimiento ||
        !tipoServicio ||
        !telefonoWhatsapp ||
        !correoContacto ||
        !direccion ||
        !codigoPostal ||
        !latitud ||
        !longitud ||
        !correo ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Faltan datos obligatorios para realizar el registro.",
        });
      }

      if (!tiposPermitidos.includes(tipoServicio)) {
        return res.status(400).json({
          success: false,
          message: "Tipo de establecimiento no válido.",
        });
      }

      if (!/^\d{5}$/.test(codigoPostal)) {
        return res.status(400).json({
          success: false,
          message:
            "El código postal debe contener 5 dígitos.",
        });
      }

      if (password.length < 10) {
        return res.status(400).json({
          success: false,
          message:
            "La contraseña debe tener al menos 10 caracteres.",
        });
      }

      // Veterinaria o negocio mixto:
      // requiere responsable y cédula.
      if (
        ["VETERINARIA", "AMBAS"].includes(tipoServicio) &&
        (!nombreResponsable || !cedulaProfesional)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Las veterinarias deben indicar al responsable veterinario y su cédula profesional.",
        });
      }

      // Estética:
      // requiere fotografía del establecimiento.
      if (
        tipoServicio === "ESTETICA" &&
        !req.files?.evidencia?.[0]
      ) {
        return res.status(400).json({
          success: false,
          message:
            "La estética debe adjuntar una fotografía del establecimiento.",
        });
      }

      // Revisar correo duplicado
      const usuarioExistente = await client.query(
        `
        SELECT id
        FROM usuarios_negocio
        WHERE LOWER(correo) = LOWER($1)
        LIMIT 1
        `,
        [correo]
      );

      if (usuarioExistente.rowCount > 0) {
        return res.status(409).json({
          success: false,
          message:
            "Ya existe una cuenta registrada con ese correo.",
        });
      }

      await client.query("BEGIN");

      // ==========================================
      // CREAR NEGOCIO
      // ==========================================

      const negocioResult = await client.query(
        `
        INSERT INTO configuracion_negocio (
          nombre_establecimiento,
          tipo_servicio,
          telefono_whatsapp,
          direccion,
          codigo_postal,
          correo_contacto,
          descripcion,
          latitud,
          longitud,
          activo_directorio
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, FALSE
        )
        RETURNING id
        `,
        [
          nombreEstablecimiento.trim(),
          tipoServicio,
          telefonoWhatsapp.trim(),
          direccion.trim(),
          codigoPostal.trim(),
          correoContacto.trim().toLowerCase(),
          descripcion?.trim() || null,
          latitud || null,
          longitud || null,
        ]
      );

      const idNegocio = negocioResult.rows[0].id;

      // ==========================================
      // SUBIR LOGO
      // ==========================================

      let logoUrl = null;

      if (req.files?.logo?.[0]) {
        const resultadoLogo =
          await subirArchivoASupabase(
            req.files.logo[0],
            "logos-negocios",
            `negocio-${idNegocio}`,
            true
          );

        logoPath = resultadoLogo.path;
        logoUrl = resultadoLogo.publicUrl;

        await client.query(
          `
          UPDATE configuracion_negocio
          SET logo_url = $1
          WHERE id = $2
          `,
          [logoUrl, idNegocio]
        );
      }

      // ==========================================
      // SUBIR EVIDENCIA PRIVADA
      // ==========================================

      if (req.files?.evidencia?.[0]) {
        const resultadoEvidencia =
          await subirArchivoASupabase(
            req.files.evidencia[0],
            "evidencias-negocios",
            `negocio-${idNegocio}`,
            false
          );

        evidenciaPath = resultadoEvidencia.path;
      }

      // ==========================================
      // CONTRASEÑA CIFRADA
      // ==========================================

      const passwordHash = await bcrypt.hash(
        password,
        12
      );

      const usuarioResult = await client.query(
        `
        INSERT INTO usuarios_negocio (
          id_negocio,
          correo,
          password_hash,
          correo_verificado,
          dos_pasos_activo,
          activo
        )
        VALUES ($1, $2, $3, FALSE, FALSE, TRUE)
        RETURNING id
        `,
        [
          idNegocio,
          correo.trim().toLowerCase(),
          passwordHash,
        ]
      );

      // ==========================================
      // VERIFICACIÓN DEL NEGOCIO
      // ==========================================

      await client.query(
        `
        INSERT INTO verificacion_negocio (
          id_negocio,
          estado,
          nombre_responsable,
          cedula_profesional,
          foto_establecimiento_url
        )
        VALUES ($1, 'PENDIENTE', $2, $3, $4)
        `,
        [
          idNegocio,
          nombreResponsable?.trim() || null,
          cedulaProfesional?.trim() || null,
          evidenciaPath,
        ]
      );

      await client.query("COMMIT");

      let correoEnviado = true;

      try {
        await crearYEnviarCodigoVerificacion(
          usuarioResult.rows[0].id,
          correo.trim().toLowerCase(),
          nombreEstablecimiento.trim()
        );
      } catch (emailError) {
        correoEnviado = false;

        console.error(
          "⚠️ El negocio se registró, pero no se pudo enviar el correo:",
          emailError.message
        );
      }

      return res.status(201).json({
        success: true,
        message: correoEnviado
          ? "Solicitud registrada. Revisa tu correo para verificar tu cuenta."
          : "Solicitud registrada, pero no pudimos enviar el código. Puedes solicitar uno nuevo.",
        data: {
          idNegocio,
          idUsuario: usuarioResult.rows[0].id,
          estado: "PENDIENTE",
          activoDirectorio: false,
          correoVerificacionEnviado: correoEnviado,
        },
      });

    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      // Si falló la BD después de subir archivos,
      // eliminamos los archivos huérfanos.
      if (logoPath) {
        await supabase.storage
          .from("logos-negocios")
          .remove([logoPath])
          .catch(() => {});
      }

      if (evidenciaPath) {
        await supabase.storage
          .from("evidencias-negocios")
          .remove([evidenciaPath])
          .catch(() => {});
      }

      console.error(
        "❌ Error en registro de negocio:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "No fue posible completar el registro.",
      });
    } finally {
      client.release();
    }
  }
);

app.post("/api/enviar-codigo-verificacion", async (req, res) => {
  const client = await pool.connect();

  try {
    const { correo } = req.body;

    if (!correo) {
      return res.status(400).json({
        success: false,
        message: "Debes indicar el correo.",
      });
    }

    const usuarioResult = await client.query(
      `
      SELECT
        u.id,
        u.correo,
        u.correo_verificado,
        n.nombre_establecimiento
      FROM usuarios_negocio u
      INNER JOIN configuracion_negocio n
        ON n.id = u.id_negocio
      WHERE LOWER(u.correo) = LOWER($1)
      LIMIT 1
      `,
      [correo.trim()]
    );

    if (usuarioResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No existe una cuenta con ese correo.",
      });
    }

    const usuario = usuarioResult.rows[0];

    if (usuario.correo_verificado) {
      return res.status(400).json({
        success: false,
        message: "Este correo ya fue verificado.",
      });
    }

    await crearYEnviarCodigoVerificacion(
      usuario.id,
      usuario.correo,
      usuario.nombre_establecimiento
    );

    return res.json({
      success: true,
      message:
        "Se envió un código de verificación al correo registrado.",
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error(
      "❌ Error enviando código:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "No fue posible enviar el código de verificación.",
    });
  } finally {
    client.release();
  }
});

app.post("/api/verificar-correo", async (req, res) => {
  const client = await pool.connect();

  try {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
      return res.status(400).json({
        success: false,
        message: "Correo y código son obligatorios.",
      });
    }

    if (!/^\d{6}$/.test(String(codigo))) {
      return res.status(400).json({
        success: false,
        message: "El código debe contener 6 dígitos.",
      });
    }

    const usuarioResult = await client.query(
      `
      SELECT id, correo_verificado
      FROM usuarios_negocio
      WHERE LOWER(correo) = LOWER($1)
      LIMIT 1
      `,
      [correo.trim()]
    );

    if (usuarioResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No existe una cuenta con ese correo.",
      });
    }

    const usuario = usuarioResult.rows[0];

    if (usuario.correo_verificado) {
      return res.json({
        success: true,
        message: "El correo ya se encuentra verificado.",
      });
    }

    const tokenResult = await client.query(
      `
      SELECT *
      FROM tokens_seguridad
      WHERE id_usuario = $1
        AND tipo = 'VERIFICAR_CORREO'
        AND usado = FALSE
      ORDER BY fecha_creacion DESC
      LIMIT 1
      `,
      [usuario.id]
    );

    if (tokenResult.rowCount === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No existe un código de verificación vigente.",
      });
    }

    const token = tokenResult.rows[0];

    if (new Date(token.fecha_expiracion) < new Date()) {
      await client.query(
        `
        UPDATE tokens_seguridad
        SET usado = TRUE
        WHERE id = $1
        `,
        [token.id]
      );

      return res.status(400).json({
        success: false,
        message:
          "El código ha expirado. Solicita uno nuevo.",
      });
    }

    if (token.intentos >= 5) {
      return res.status(429).json({
        success: false,
        message:
          "Se alcanzó el límite de intentos. Solicita un nuevo código.",
      });
    }

    const codigoCorrecto = await bcrypt.compare(
      String(codigo),
      token.codigo_hash
    );

    if (!codigoCorrecto) {
      await client.query(
        `
        UPDATE tokens_seguridad
        SET intentos = intentos + 1
        WHERE id = $1
        `,
        [token.id]
      );

      return res.status(400).json({
        success: false,
        message: "El código no es correcto.",
      });
    }

    await client.query("BEGIN");

    await client.query(
      `
      UPDATE usuarios_negocio
      SET correo_verificado = TRUE
      WHERE id = $1
      `,
      [usuario.id]
    );

    await client.query(
      `
      UPDATE tokens_seguridad
      SET usado = TRUE
      WHERE id = $1
      `,
      [token.id]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Correo verificado correctamente.",
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error(
      "❌ Error verificando correo:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "No fue posible verificar el correo.",
    });
  } finally {
    client.release();
  }
});

async function crearYEnviarCodigoVerificacion(
  idUsuario,
  correo,
  nombreEstablecimiento
) {
  const codigo = crypto
    .randomInt(100000, 1000000)
    .toString();

  const codigoHash = await bcrypt.hash(codigo, 10);

  await pool.query(
    `
    UPDATE tokens_seguridad
    SET usado = TRUE
    WHERE id_usuario = $1
      AND tipo = 'VERIFICAR_CORREO'
      AND usado = FALSE
    `,
    [idUsuario]
  );

  await pool.query(
    `
    INSERT INTO tokens_seguridad (
      id_usuario,
      tipo,
      codigo_hash,
      fecha_expiracion,
      usado,
      intentos
    )
    VALUES (
      $1,
      'VERIFICAR_CORREO',
      $2,
      CURRENT_TIMESTAMP + INTERVAL '10 minutes',
      FALSE,
      0
    )
    `,
    [idUsuario, codigoHash]
  );

  await emailTransporter.sendMail({
    from: `"VetStec" <${process.env.EMAIL_USER}>`,
    to: correo,
    subject: "Verifica tu correo - VetStec",
    text: `
Hola.

Gracias por registrar ${nombreEstablecimiento} en VetStec.

Tu código de verificación es:

${codigo}

El código estará disponible durante 10 minutos.

Si tú no realizaste este registro, puedes ignorar este mensaje.

Equipo VetStec
    `,
  });
}

/* =========================================================
   404 PARA RUTAS API INEXISTENTES
   ========================================================= */

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado',
  });
});

/* =========================================================
   MANEJO GENERAL DE ERRORES
   ========================================================= */

app.use((error, req, res, next) => {
  console.error(
    'Error interno:',
    error.message
  );

  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
  });
});

/* =========================================================
   SERVIDOR
   ========================================================= */

async function startServer() {
  try {
    await pool.query('SELECT 1');

    console.log(
      '✅ PostgreSQL conectado correctamente'
    );

    app.listen(PORT, () => {
      console.log(
        `🐾 VetStec API: http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      '❌ No fue posible conectar con PostgreSQL'
    );

    console.error(error.message);

    process.exit(1);
  }
}

startServer();