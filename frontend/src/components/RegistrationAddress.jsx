import { useEffect, useRef, useState } from 'react';
import MapPicker from './MapPicker';

function actualizarDireccion(actual, cambios) {
  const siguiente = {
    ...actual,
    ...cambios,
    latitud: '',
    longitud: '',
  };

  const completa =
    /^\d{5}$/.test(siguiente.codigoPostal) &&
    [
      'calle',
      'numeroExterior',
      'colonia',
      'municipio',
      'estado',
    ].every((campo) => siguiente[campo]?.trim());

  siguiente.direccion = completa
    ? [
        `${siguiente.calle.trim()} ${siguiente.numeroExterior.trim()}`,
        siguiente.colonia.trim(),
        siguiente.municipio.trim(),
        siguiente.estado.trim(),
        `C.P. ${siguiente.codigoPostal}`,
        'México',
      ].join(', ')
    : '';

  return siguiente;
}

export default function RegistrationAddress({
  form,
  setForm,
  clearError,
}) {
  const [postal, setPostal] = useState({
    estado: '',
    opciones: [],
    mensaje: '',
  });

  const [reintento, setReintento] = useState(0);
  const [ocupado, setOcupado] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mapa, setMapa] = useState(null);

  const operacion = useRef(0);
  const consulta = useRef(null);

  useEffect(() => {
    return () => {
      operacion.current += 1;
      consulta.current?.abort();
    };
  }, []);

  useEffect(() => {
    const cp = form.codigoPostal;

    if (form.direccionManual || !/^\d{5}$/.test(cp)) {
      setPostal({
        estado: '',
        opciones: [],
        mensaje: '',
      });
      return;
    }

    let vigente = true;
    let limite;

    const controller = new AbortController();

    setPostal({
      estado: 'cargando',
      opciones: [],
      mensaje: 'Consultando código postal…',
    });

    const espera = setTimeout(async () => {
      limite = setTimeout(() => controller.abort(), 12000);

      try {
        const respuesta = await fetch(
          `/api/codigos-postales/${cp}`,
          { signal: controller.signal }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok || !datos.success) {
          throw new Error(
            datos.message || 'No fue posible consultar el CP.'
          );
        }

        if (
          datos.codigoPostal !== cp ||
          !Array.isArray(datos.colonias) ||
          !datos.colonias.length ||
          !datos.colonias.every((c) =>
            ['colonia', 'municipio', 'estado'].every(
              (k) => typeof c[k] === 'string' && c[k].trim()
            )
          )
        ) {
          throw new Error('La respuesta postal está incompleta.');
        }

        if (!vigente) return;

        setPostal({
          estado: 'listo',
          opciones: datos.colonias,
          mensaje: 'Selecciona la colonia de tu establecimiento.',
        });

        setForm((actual) => {
          if (
            actual.codigoPostal !== cp ||
            actual.direccionManual
          ) {
            return actual;
          }

          const coincide = datos.colonias.some(
            (c) =>
              c.colonia === actual.colonia &&
              c.municipio === actual.municipio &&
              c.estado === actual.estado
          );

          if (coincide) return actual;

          const unica =
            datos.colonias.length === 1
              ? datos.colonias[0]
              : null;

          return actualizarDireccion(actual, {
            colonia: unica?.colonia || '',
            municipio: unica?.municipio || '',
            estado: unica?.estado || '',
          });
        });
      } catch (error) {
        if (vigente) {
          setPostal({
            estado: 'error',
            opciones: [],
            mensaje:
              error.name === 'AbortError'
                ? 'La consulta tardó demasiado. Reintenta o captura la dirección manualmente.'
                : ['TypeError', 'SyntaxError'].includes(error.name)
                  ? 'No fue posible consultar el CP. Reintenta o captura la dirección manualmente.'
                  : error.message,
          });
        }
      } finally {
        clearTimeout(limite);
      }
    }, 400);

    return () => {
      vigente = false;
      clearTimeout(espera);
      clearTimeout(limite);
      controller.abort();
    };
  }, [
    form.codigoPostal,
    form.direccionManual,
    reintento,
    setForm,
  ]);

  function cambiar(cambios) {
    operacion.current += 1;
    consulta.current?.abort();

    setOcupado('');
    setMensaje('');
    setMapa(null);
    clearError();

    setForm((actual) => actualizarDireccion(actual, cambios));
  }

  async function buscarDireccion() {
    const id = ++operacion.current;
    const controller = new AbortController();

    consulta.current = controller;

    const limite = setTimeout(
      () => controller.abort(),
      12000
    );

    setOcupado('busqueda');
    setMensaje('');

    try {
      const parametros = new URLSearchParams({
        direccion: form.direccion,
        cp: form.codigoPostal,
      });

      const respuesta = await fetch(
        `/api/geocodificar?${parametros}`,
        { signal: controller.signal }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok || !datos.success) {
        throw new Error(
          datos.message || 'No encontramos la dirección.'
        );
      }

      const punto = datos.sugerencia;

      if (
        !punto ||
        !Number.isFinite(punto.latitud) ||
        !Number.isFinite(punto.longitud) ||
        Math.abs(punto.latitud) > 90 ||
        Math.abs(punto.longitud) > 180
      ) {
        throw new Error('No se recibió una ubicación válida.');
      }

      if (id === operacion.current) {
        setMapa({
          ...punto,
          direccion: form.direccion,
          mensaje:
            `Sugerencia aproximada: ${punto.descripcion}. ` +
            'Ajusta el marcador a la entrada de tu establecimiento.',
        });
      }
    } catch (error) {
      if (id === operacion.current) {
        setMensaje(
          error.name === 'AbortError'
            ? 'La búsqueda tardó demasiado. Puedes seleccionar el punto en el mapa.'
            : ['TypeError', 'SyntaxError'].includes(error.name)
              ? 'No fue posible buscar la dirección. Puedes seleccionar el punto en el mapa.'
              : error.message
        );
      }
    } finally {
      clearTimeout(limite);

      if (id === operacion.current) {
        setOcupado('');
      }
    }
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setMensaje(
        'Tu navegador no permite obtener la ubicación. Usa el mapa.'
      );
      return;
    }

    const id = ++operacion.current;

    setOcupado('gps');
    setMensaje('');

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        if (id !== operacion.current) return;

        setOcupado('');

        setMapa({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
          direccion: form.direccion,
          mensaje:
            'Esta es la ubicación aproximada de tu dispositivo. ' +
            'Ajusta el marcador a la entrada del establecimiento.',
        });
      },
      () => {
        if (id !== operacion.current) return;

        setOcupado('');

        setMensaje(
          'No fue posible obtener tu ubicación. Revisa los permisos o selecciona el punto en el mapa.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  const seleccion = postal.opciones.findIndex(
    (c) =>
      c.colonia === form.colonia &&
      c.municipio === form.municipio &&
      c.estado === form.estado
  );

  const deshabilitado = !form.direccion || Boolean(ocupado);

  return (
    <>
      <label className="form-field">
        <span>Código postal *</span>

        <input
          name="codigoPostal"
          type="text"
          inputMode="numeric"
          maxLength={5}
          autoComplete="postal-code"
          placeholder="09000"
          value={form.codigoPostal}
          onChange={(e) =>
            cambiar({
              codigoPostal: e.target.value
                .replace(/\D/g, '')
                .slice(0, 5),
              colonia: '',
              municipio: '',
              estado: '',
            })
          }
        />
      </label>

      <label className="form-field">
        <span>Colonia *</span>

        {form.direccionManual ? (
          <input
            name="colonia"
            maxLength={100}
            value={form.colonia}
            onChange={(e) =>
              cambiar({ colonia: e.target.value })
            }
          />
        ) : (
          <select
            name="colonia"
            value={seleccion < 0 ? '' : String(seleccion)}
            disabled={postal.estado !== 'listo'}
            onChange={(e) => {
              const c = postal.opciones[Number(e.target.value)];

              cambiar(
                e.target.value === ''
                  ? {
                      colonia: '',
                      municipio: '',
                      estado: '',
                    }
                  : {
                      colonia: c.colonia,
                      municipio: c.municipio,
                      estado: c.estado,
                    }
              );
            }}
          >
            <option value="">
              {postal.estado === 'cargando'
                ? 'Consultando…'
                : 'Selecciona tu colonia'}
            </option>

            {postal.opciones.map((c, i) => (
              <option key={i} value={i}>
                {c.colonia} — {c.municipio}
              </option>
            ))}
          </select>
        )}
      </label>

      <div className="form-field-full address-postal-tools">
        <p className="field-help" role="status">
          {form.direccionManual
            ? 'Captura colonia, municipio y estado tal como aparecen en tu dirección.'
            : postal.mensaje ||
              'Escribe los cinco dígitos del código postal.'}
        </p>

        {postal.estado === 'error' &&
          !form.direccionManual && (
            <button
              type="button"
              className="address-link"
              onClick={() => setReintento((n) => n + 1)}
            >
              Reintentar consulta
            </button>
          )}

        <button
          type="button"
          className="address-link"
          onClick={() =>
            cambiar({
              direccionManual: !form.direccionManual,
              ...(!form.direccionManual
                ? {}
                : {
                    colonia: '',
                    municipio: '',
                    estado: '',
                  }),
            })
          }
        >
          {form.direccionManual
            ? 'Volver a consultar por CP'
            : 'Ingresar dirección manualmente'}
        </button>
      </div>

      {[
        ['estado', 'Estado *', 100],
        ['municipio', 'Alcaldía / municipio *', 100],
        ['calle', 'Calle *', 120],
        ['numeroExterior', 'Número exterior *', 20],
      ].map(([campo, etiqueta, maximo]) => (
        <label className="form-field" key={campo}>
          <span>{etiqueta}</span>

          <input
            name={campo}
            value={form[campo]}
            maxLength={maximo}
            readOnly={
              !form.direccionManual &&
              ['estado', 'municipio'].includes(campo)
            }
            placeholder={
              campo === 'numeroExterior'
                ? 'Ej. 25 o S/N'
                : ''
            }
            onChange={(e) =>
              cambiar({ [campo]: e.target.value })
            }
          />
        </label>
      ))}

      <div className="form-field form-field-full address-location">
        <span>Ubicación del establecimiento *</span>

        <p className="field-help">
          Completa la dirección y confirma el punto en el mapa.
          Puedes arrastrar el marcador hasta la entrada de tu negocio.
        </p>

        {form.direccion && (
          <p className="address-preview">{form.direccion}</p>
        )}

        <div className="location-options">
          <button
            type="button"
            className="location-button"
            disabled={deshabilitado}
            onClick={buscarDireccion}
          >
            {ocupado === 'busqueda'
              ? 'Buscando dirección…'
              : 'Buscar dirección en el mapa'}
          </button>

          <button
            type="button"
            className="location-button"
            disabled={deshabilitado}
            onClick={usarMiUbicacion}
          >
            {ocupado === 'gps'
              ? 'Obteniendo ubicación…'
              : '📍 Usar mi ubicación actual'}
          </button>

          <button
            type="button"
            className="location-button map-button"
            disabled={deshabilitado}
            onClick={() => {
              setMensaje('');

              setMapa({
                latitud: form.latitud,
                longitud: form.longitud,
                direccion: form.direccion,
              });
            }}
          >
            🗺️ Seleccionar en el mapa
          </button>
        </div>

        <p className="address-attribution">
          Búsqueda:{' '}
          <a
            href="https://photon.komoot.io/"
            target="_blank"
            rel="noreferrer"
          >
            Photon
          </a>
          . Datos ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>
          .
        </p>

        {mensaje && (
          <p className="register-error" role="alert">
            {mensaje}
          </p>
        )}

        {form.latitud && form.longitud && (
          <p className="location-success" role="status">
            ✓ Ubicación confirmada. Si cambias la dirección,
            tendrás que confirmarla de nuevo.
          </p>
        )}
      </div>

      {mapa && (
        <MapPicker
          initialLat={mapa.latitud}
          initialLng={mapa.longitud}
          message={mapa.mensaje}
          onClose={() => setMapa(null)}
          onConfirm={({ latitud, longitud }) => {
            setForm((actual) =>
              actual.direccion === mapa.direccion
                ? { ...actual, latitud, longitud }
                : actual
            );

            clearError();
            setMapa(null);
          }}
        />
      )}
    </>
  );
}