import { useCallback, useEffect, useRef, useState } from 'react';

async function pedir(url, opciones = {}) {
  const respuesta = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...opciones,
  });

  if (respuesta.status === 401) {
    window.dispatchEvent(new Event('vetstec:sesion-vencida'));
  }

  const json = await respuesta.json().catch(() => null);

  if (
    !respuesta.ok ||
    json?.success !== true ||
    !json.data ||
    !Number.isInteger(json.totalSucursal)
  ) {
    throw new Error(
      json?.message ||
      'No se pudo confirmar la operación. Recarga antes de reintentar.'
    );
  }

  return json;
}

export default function ServiciosSucursal({
  idSucursal,
  onTotal,
  onGuardando,
}) {
  const [datos, setDatos] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState({ q: '', desde: 0 });
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const lectura = useRef(null);
  const montado = useRef(false);
  const enviando = useRef(false);

  const base = `/api/propietario/sucursales/${idSucursal}/servicios`;

  const cargar = useCallback(async parametros => {
    lectura.current?.abort();

    const controller = new AbortController();
    lectura.current = controller;

    setCargando(true);
    setError('');
    setDatos(null);

    try {
      const query = new URLSearchParams({
        q: parametros.q,
        desde: String(parametros.desde),
      });

      const json = await pedir(`${base}?${query}`, {
        signal: controller.signal,
      });

      if (!montado.current || controller.signal.aborted) return;

      setDatos(json.data);
      setForm(null);
      setBloqueado(false);
      onTotal(idSucursal, json.totalSucursal);
    } catch (e) {
      if (montado.current && !controller.signal.aborted) {
        setError(e.message);
      }
    } finally {
      if (montado.current && !controller.signal.aborted) {
        setCargando(false);
      }
    }
  }, [base, idSucursal, onTotal]);

  useEffect(() => {
    montado.current = true;
    cargar(consulta);

    return () => {
      montado.current = false;
      lectura.current?.abort();
    };
  }, [cargar, consulta]);

  async function guardar(metodo, servicio) {
    if (enviando.current || cargando || bloqueado) return;

    enviando.current = true;
    setGuardando(true);
    onGuardando(true);
    setError('');
    setAviso('');

    const body = metodo === 'DELETE'
      ? { version: servicio.version }
      : {
          nombre_servicio: servicio.nombre_servicio,
          tipo_servicio: servicio.tipo_servicio,
          tiempo_estimado_minutos: servicio.tiempo_estimado_minutos,
          precio_base: servicio.precio_base,
          ...(metodo === 'PATCH' ? { version: servicio.version } : {}),
        };

    try {
      const json = await pedir(
        `${base}${metodo === 'POST' ? '' : `/${servicio.id}`}`,
        {
          method: metodo,
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'VetStec',
          },
          body: JSON.stringify(body),
        }
      );

      if (!montado.current) return;

      onTotal(idSucursal, json.totalSucursal);
      setForm(null);
      setAviso(
        metodo === 'DELETE'
          ? 'Servicio eliminado.'
          : 'Servicio guardado.'
      );

      if (consulta.desde !== 0) {
        setConsulta(c => ({ ...c, desde: 0 }));
      } else {
        await cargar(consulta);
      }
    } catch (e) {
      if (montado.current) {
        setError(e.message);
        setBloqueado(true);
      }
    } finally {
      enviando.current = false;
      if (montado.current) setGuardando(false);
      onGuardando(false);
    }
  }

  const ocupado = cargando || guardando;

  const tipos = datos?.tipoSucursal === 'AMBAS'
    ? ['VETERINARIA', 'ESTETICA']
    : [datos?.tipoSucursal].filter(Boolean);

  return (
    <section className="owner-products">
      <h4>Servicios de esta sucursal</h4>

      {error && <p className="owner-error" role="alert">{error}</p>}
      {aviso && <p className="owner-success" role="status">{aviso}</p>}

      {bloqueado && (
        <p>
          Recarga y comprueba el resultado antes de volver a guardar.
          Copia los cambios que quieras conservar: la recarga cerrará el formulario.
        </p>
      )}

      <div className="owner-edit-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={ocupado}
          onClick={() => {
            if (
              form &&
              !window.confirm('Recargar cerrará el formulario. ¿Continuar?')
            ) return;

            cargar(consulta);
          }}
        >
          Recargar servicios
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={ocupado || bloqueado || !datos || Boolean(form)}
          onClick={() => {
            setAviso('');
            setForm({
              nombre_servicio: '',
              tipo_servicio: tipos[0],
              tiempo_estimado_minutos: '',
              precio_base: '',
            });
          }}
        >
          Agregar servicio
        </button>
      </div>

      <form
        className="owner-edit-actions"
        onSubmit={e => {
          e.preventDefault();
          setConsulta({ q: busqueda.trim(), desde: 0 });
        }}
      >
        <label className="form-field">
          <span>Buscar servicio</span>
          <input
            value={busqueda}
            maxLength={100}
            disabled={ocupado || Boolean(form)}
            onChange={e => setBusqueda(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="button button-secondary"
          disabled={ocupado || Boolean(form)}
        >
          Buscar
        </button>
      </form>

      {form && (
        <form
          className="register-card"
          onSubmit={e => {
            e.preventDefault();
            guardar(form.id ? 'PATCH' : 'POST', form);
          }}
        >
          <fieldset
            className="owner-edit-fields"
            disabled={ocupado || bloqueado}
          >
            <legend>{form.id ? 'Editar servicio' : 'Nuevo servicio'}</legend>

            <div className="register-form-grid">
              <label className="form-field">
                <span>Nombre</span>
                <input
                  required
                  maxLength={100}
                  value={form.nombre_servicio}
                  onChange={e => setForm(f => ({
                    ...f,
                    nombre_servicio: e.target.value,
                  }))}
                />
              </label>

              <label className="form-field">
                <span>Tipo</span>
                <select
                  required
                  value={form.tipo_servicio}
                  onChange={e => setForm(f => ({
                    ...f,
                    tipo_servicio: e.target.value,
                  }))}
                >
                  <option value="">Seleccionar</option>
                  {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              <label className="form-field">
                <span>Duración estimada en minutos</span>
                <input
                  type="number"
                  required
                  min="1"
                  max="2147483647"
                  step="1"
                  value={form.tiempo_estimado_minutos}
                  onChange={e => setForm(f => ({
                    ...f,
                    tiempo_estimado_minutos: e.target.value,
                  }))}
                />
              </label>

              <label className="form-field">
                <span>Precio base</span>
                <input
                  type="number"
                  required
                  min="0"
                  max="99999999.99"
                  step="0.01"
                  value={form.precio_base}
                  onChange={e => setForm(f => ({
                    ...f,
                    precio_base: e.target.value,
                  }))}
                />
              </label>
            </div>

            <button type="submit" className="button button-primary">
              {guardando ? 'Guardando…' : 'Guardar servicio'}
            </button>
          </fieldset>

          <button
            type="button"
            className="button button-secondary"
            disabled={ocupado}
            onClick={() => setForm(null)}
          >
            Cerrar formulario
          </button>
        </form>
      )}

      {cargando && <p role="status">Cargando servicios…</p>}

      {datos && (
        <>
          <p>{datos.total} resultado(s). Hasta 20 servicios por página.</p>
          <p>
            Los servicios con citas conservan sus datos y no pueden
            editarse ni eliminarse desde este módulo.
          </p>

          {datos.servicios.length === 0 ? (
            <p>No hay servicios para esta búsqueda.</p>
          ) : (
            <div className="owner-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Tipo</th>
                    <th>Minutos</th>
                    <th>Precio</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.servicios.map(s => (
                    <tr key={s.id}>
                      <td>{s.nombre_servicio}</td>
                      <td>{s.tipo_servicio}</td>
                      <td>{s.tiempo_estimado_minutos}</td>
                      <td>${Number(s.precio_base).toFixed(2)}</td>
                      <td>
                        {s.tiene_citas ? 'Con citas asociadas' : (
                          <>
                            <button
                              type="button"
                              disabled={ocupado || bloqueado || Boolean(form)}
                              onClick={() => {
                                setAviso('');
                                setForm({ ...s });
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={ocupado || bloqueado || Boolean(form)}
                              onClick={() => {
                                if (window.confirm(`¿Eliminar “${s.nombre_servicio}”?`)) {
                                  guardar('DELETE', s);
                                }
                              }}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="owner-edit-actions">
            <button
              type="button"
              disabled={ocupado || Boolean(form) || consulta.desde === 0}
              onClick={() => setConsulta(c => ({
                ...c,
                desde: Math.max(0, c.desde - 20),
              }))}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={ocupado || Boolean(form) || !datos.hayMas}
              onClick={() => setConsulta(c => ({
                ...c,
                desde: c.desde + 20,
              }))}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}