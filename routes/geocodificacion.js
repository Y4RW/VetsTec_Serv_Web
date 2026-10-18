module.exports = function registrarGeocodificacion(app, axios) {
  const cache = new Map();
  let proximaConsulta = 0;
  let consultando = false;

  app.get('/api/geocodificar', async (req, res) => {
    const direccion = typeof req.query.direccion === 'string'
      ? req.query.direccion.trim().replace(/\s+/g, ' ')
      : '';

    const cp = typeof req.query.cp === 'string'
      ? req.query.cp
      : '';

    if (
      direccion.length < 10 ||
      direccion.length > 500 ||
      !/^\d{5}$/.test(cp)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Revisa la dirección y el código postal.',
      });
    }

    const clave = `${cp}|${direccion.toLocaleLowerCase('es-MX')}`;
    const guardado = cache.get(clave);

    if (guardado && guardado.vence > Date.now()) {
      return res.status(guardado.status).json(guardado.body);
    }

    cache.delete(clave);

    if (consultando || Date.now() < proximaConsulta) {
      res.set('Retry-After', '2');

      return res.status(429).json({
        success: false,
        message:
          'La búsqueda está ocupada. Espera unos segundos y vuelve a intentar.',
      });
    }

    consultando = true;
    proximaConsulta = Date.now() + 1100;

    try {
      const { data } = await axios.get(
        'https://photon.komoot.io/api/',
        {
          params: {
            q: direccion,
            countrycode: 'MX',
            limit: 3,
          },
          headers: {
            'User-Agent':
              'VetStec/0.1 (registration address lookup)',
          },
          timeout: 10000,
          maxRedirects: 0,
          maxContentLength: 256 * 1024,
        }
      );

      if (!Array.isArray(data?.features)) {
        throw new Error('Respuesta inválida');
      }

      const lugar = data.features.find((item) => {
        const p = item?.properties || {};
        const [lng, lat] = item?.geometry?.coordinates || [];

        return (
          item?.geometry?.type === 'Point' &&
          Number.isFinite(lat) &&
          Math.abs(lat) <= 90 &&
          Number.isFinite(lng) &&
          Math.abs(lng) <= 180 &&
          p.countrycode === 'MX' &&
          (!p.postcode || p.postcode === cp) &&
          (p.street || p.osm_key === 'highway')
        );
      });

      let status = 404;
      let body = {
        success: false,
        message:
          'No encontramos esa dirección. Puedes seleccionar la ubicación en el mapa.',
      };

      if (lugar) {
        const p = lugar.properties;
        const [lng, lat] = lugar.geometry.coordinates;

        const descripcion = [...new Set([
          p.name,
          [p.street, p.housenumber].filter(Boolean).join(' '),
          p.locality,
          p.city || p.district || p.county,
          p.state,
          p.postcode,
        ].filter(Boolean))].join(', ');

        status = 200;
        body = {
          success: true,
          sugerencia: {
            latitud: lat,
            longitud: lng,
            descripcion,
          },
        };
      }

      if (cache.size >= 200) {
        cache.delete(cache.keys().next().value);
      }

      cache.set(clave, {
        status,
        body,
        vence: Date.now() + (lugar ? 86400000 : 600000),
      });

      return res.status(status).json(body);
    } catch (error) {
      if (error.response?.status === 429) {
        proximaConsulta = Date.now() + 60000;
      }

      const timeout = [
        'ECONNABORTED',
        'ETIMEDOUT',
      ].includes(error.code);

      return res.status(timeout ? 504 : 502).json({
        success: false,
        message:
          'No fue posible buscar la dirección. Intenta más tarde o selecciona el punto en el mapa.',
      });
    } finally {
      consultando = false;
    }
  });
};