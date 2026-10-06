require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const negocios = [
  {
    nombre: 'Clínica Veterinaria Huellitas',
    tipo: 'VETERINARIA',
    telefono: '5512345678',
    direccion:
      'Av. Telecomunicaciones, Chinampac de Juárez, Iztapalapa, Ciudad de México',
    cp: '09208',
    correo: 'huellitas@ejemplo.com',
    descripcion:
      'Clínica veterinaria de prueba para validar el directorio de VetStec.',
  },
  {
    nombre: 'Estética Canina Patitas',
    tipo: 'ESTETICA',
    telefono: '5598765432',
    direccion:
      'Iztapalapa, Ciudad de México, 09000',
    cp: '09000',
    correo: 'patitas@ejemplo.com',
    descripcion:
      'Estética canina de prueba para validar el directorio de VetStec.',
  },
  {
    nombre: 'Vet & Groom PetCare',
    tipo: 'AMBAS',
    telefono: '5545678910',
    direccion:
      'Iztapalapa, Ciudad de México, 09310',
    cp: '09310',
    correo: 'petcare@ejemplo.com',
    descripcion:
      'Veterinaria y estética canina de prueba para validar el directorio de VetStec.',
  },
];

async function getOrCreateBusiness(client, negocio) {
  const existing = await client.query(
    `
      SELECT id
      FROM configuracion_negocio
      WHERE nombre_establecimiento = $1
        AND codigo_postal = $2
      LIMIT 1
    `,
    [
      negocio.nombre,
      negocio.cp,
    ]
  );

  if (existing.rows.length > 0) {
    console.log(
      `ℹ️ Ya existe: ${negocio.nombre}`
    );

    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `
      INSERT INTO configuracion_negocio (
        nombre_establecimiento,
        tipo_servicio,
        telefono_whatsapp,
        direccion,
        codigo_postal,
        correo_contacto,
        descripcion,
        activo_directorio
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        TRUE
      )
      RETURNING id
    `,
    [
      negocio.nombre,
      negocio.tipo,
      negocio.telefono,
      negocio.direccion,
      negocio.cp,
      negocio.correo,
      negocio.descripcion,
    ]
  );

  console.log(
    `✅ Insertado: ${negocio.nombre}`
  );

  return inserted.rows[0].id;
}

async function seedSchedules(client, businessId) {
  for (let day = 0; day <= 6; day += 1) {
    const isSunday = day === 0;

    await client.query(
      `
        INSERT INTO horarios_negocio (
          id_negocio,
          dia_semana,
          hora_apertura,
          hora_cierre,
          cerrado
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5
        )
        ON CONFLICT (
          id_negocio,
          dia_semana
        )
        DO UPDATE SET
          hora_apertura = EXCLUDED.hora_apertura,
          hora_cierre = EXCLUDED.hora_cierre,
          cerrado = EXCLUDED.cerrado
      `,
      [
        businessId,
        day,
        isSunday ? null : '09:00',
        isSunday ? null : '19:00',
        isSunday,
      ]
    );
  }
}

async function seedAvailability(client, businessId) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = new Date();

    date.setDate(date.getDate() + offset);

    const isoDate = date
      .toISOString()
      .split('T')[0];

    const capacities = [
      5,
      6,
      3,
      5,
      4,
      6,
      5,
    ];

    await client.query(
      `
        INSERT INTO disponibilidad_negocio (
          id_negocio,
          fecha,
          capacidad_maxima,
          activo
        )
        VALUES (
          $1,
          $2,
          $3,
          TRUE
        )
        ON CONFLICT (
          id_negocio,
          fecha
        )
        DO NOTHING
      `,
      [
        businessId,
        isoDate,
        capacities[offset - 1],
      ]
    );
  }
}

async function runSeed() {
  const client = await pool.connect();

  try {
    console.log(
      '\n🐾 Insertando datos de prueba de VetStec...\n'
    );

    await client.query('BEGIN');

    for (const negocio of negocios) {
      const id = await getOrCreateBusiness(
        client,
        negocio
      );

      await seedSchedules(client, id);
      await seedAvailability(client, id);
    }

    await client.query('COMMIT');

    console.log(
      '\n✅ Datos de prueba preparados correctamente.\n'
    );
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(
      '\n❌ Error insertando datos de prueba:'
    );

    console.error(error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();