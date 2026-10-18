require('dotenv').config();

const axios = require('axios');

async function probarCodigoPostal() {
  const codigoPostal = (process.argv[2] || '09000').trim();

  const apiKey =
    process.env.CODIGOS_POSTALES_API_KEY?.trim();

  if (!/^\d{5}$/.test(codigoPostal)) {
    console.error(
      'El código postal debe contener exactamente 5 dígitos.'
    );

    process.exitCode = 1;
    return;
  }

  if (!apiKey || apiKey === 'PEGA_AQUI_TU_CLAVE') {
    console.error(
      'Agrega tu clave en CODIGOS_POSTALES_API_KEY dentro del .env.'
    );

    process.exitCode = 1;
    return;
  }

  try {
    const respuesta = await axios.get(
      `https://api.codigos.zip/api/zip/${codigoPostal}`,
      {
        params: {
          pais: 'MX',
        },

        headers: {
          'X-API-Key': apiKey,
          Accept: 'application/json',
        },

        timeout: 10000,
        maxRedirects: 0,
      }
    );

    console.log(`Resultado para el CP ${codigoPostal}:`);

    console.log(
      JSON.stringify(respuesta.data, null, 2)
    );
  } catch (error) {
    const estado = error.response?.status;

    if (estado === 401 || estado === 403) {
      console.error(
        'El servicio rechazó la clave. Revisa tu API Key y tu cuenta.'
      );
    } else if (estado === 404) {
      console.error(
        'El servicio no encontró el código postal solicitado.'
      );
    } else if (estado === 429) {
      console.error(
        'Se alcanzó el límite de consultas del servicio.'
      );
    } else {
      console.error(
        'No fue posible completar la consulta.',
        estado ? `Código HTTP: ${estado}.` : 'Revisa la conexión.'
      );
    }

    process.exitCode = 1;
  }
}

probarCodigoPostal();