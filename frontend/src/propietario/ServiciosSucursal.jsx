import { useCallback, useEffect, useRef, useState } from 'react';

const TIPOS_ETIQUETA = {
  VETERINARIA: { texto: 'Veterinaria', icono: '🩺' },
  ESTETICA: { texto: 'Estética canina', icono: '✂️' },
};

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
          ? 'Servicio eliminado del catálogo.'
          : 'Servicio guardado correctamente.'
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
    <section className="owner-products own-module">
      <div className="own-module-header">
        <div>
          <h4>Catálogo de servicios</h4>
          <p>Configura las consultas, baños o procedimientos que ofreces y su duración estimada.</p>
        </div>

        <div className="own-module-actions">
          <button
            type="button"
            className="own-btn own-btn-secondary"
            disabled={ocupado}
            onClick={() => {
              if (form && !window.confirm('Recargar cerrará el formulario abierto. ¿Continuar?')) return;
              cargar(consulta);
            }}
          >
            ↻ Actualizar
          </button>

          <button
            type="button"
            className="own-btn own-btn-primary"
            disabled={ocupado || bloqueado || !datos || Boolean(form)}
            onClick={() => {
              setAviso('');
              setForm({
                nombre_servicio: '',
                tipo_servicio: tipos[0] || '',
                tiempo_estimado_minutos: '30',
                precio_base: '',
              });
            }}
          >
            + Nuevo servicio
          </button>
        </div>
      </div>

      {error && <p className="own-alert own-alert-danger" role="alert">{error}</p>}
      {aviso && (
        <div className="own-alert own-alert-success" role="status">
          <span>✓ {aviso}</span>
          <button type="button" className="own-alert-dismiss" onClick={() => setAviso('')} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      {bloqueado && (
        <div className="own-alert own-alert-warning">
          Pulsa <strong>Actualizar</strong> para sincronizar la lista antes de volver a guardar (copia antes tus cambios si deseas conservarlos).
        </div>
      )}

      <form
        className="own-search-bar"
        onSubmit={e => {
          e.preventDefault();
          setConsulta({ q: busqueda.trim(), desde: 0 });
        }}
      >
        <div className="own-search-input-wrap">
          <span className="own-search-icon" aria-hidden="true">🔎</span>
          <input
            type="search"
            value={busqueda}
            maxLength={100}
            placeholder="Buscar servicio por nombre…"
            aria-label="Buscar servicio"
            disabled={ocupado || Boolean(form)}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="own-btn own-btn-secondary"
          disabled={ocupado || Boolean(form)}
        >
          Buscar
        </button>

        {(consulta.q || busqueda) && (
          <button
            type="button"
            className="own-btn own-btn-ghost"
            disabled={ocupado || Boolean(form)}
            onClick={() => {
              setBusqueda('');
              if (consulta.q) setConsulta({ q: '', desde: 0 });
            }}
          >
            Limpiar
          </button>
        )}
      </form>

      {form && (
        <form
          className="own-form-panel"
          onSubmit={e => {
            e.preventDefault();
            guardar(form.id ? 'PATCH' : 'POST', form);
          }}
        >
          <div className="own-form-panel-head">
            <div>
              <span className="own-eyebrow">{form.id ? 'Edición' : 'Alta de servicio'}</span>
              <h4>{form.id ? 'Editar servicio' : 'Registrar nuevo servicio'}</h4>
            </div>
            <button
              type="button"
              className="own-btn own-btn-sm own-btn-ghost"
              disabled={ocupado}
              onClick={() => setForm(null)}
            >
              ✕ Cerrar
            </button>
          </div>

          <fieldset className="own-fieldset" disabled={ocupado || bloqueado}>
            <div className="own-form-grid">
              <label className="own-field own-field-full">
                <span>Nombre del servicio *</span>
                <input
                  required
                  maxLength={100}
                  placeholder="Ej. Consulta médica general, Vacunación múltiple, Baño y corte"
                  value={form.nombre_servicio}
                  onChange={e => setForm(f => ({
                    ...f,
                    nombre_servicio: e.target.value,
                  }))}
                />
              </label>

              <label className="own-field">
                <span>Área de atención *</span>
                <select
                  required
                  value={form.tipo_servicio}
                  onChange={e => setForm(f => ({
                    ...f,
                    tipo_servicio: e.target.value,
                  }))}
                >
                  <option value="">Seleccionar área</option>
                  {tipos.map(t => (
                    <option key={t} value={t}>
                      {TIPOS_ETIQUETA[t]?.texto || t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="own-field">
                <span>Duración estimada (minutos) *</span>
                <input
                  type="number"
                  required
                  min="1"
                  max="2147483647"
                  step="1"
                  placeholder="Ej. 30"
                  value={form.tiempo_estimado_minutos}
                  onChange={e => setForm(f => ({
                    ...f,
                    tiempo_estimado_minutos: e.target.value,
                  }))}
                />
              </label>

              <label className="own-field">
                <span>Precio base ($ MXN) *</span>
                <input
                  type="number"
                  required
                  min="0"
                  max="99999999.99"
                  step="0.01"
                  placeholder="Ej. 350.00"
                  value={form.precio_base}
                  onChange={e => setForm(f => ({
                    ...f,
                    precio_base: e.target.value,
                  }))}
                />
              </label>
            </div>

            <div className="own-form-footer">
              <button
                type="button"
                className="own-btn own-btn-secondary"
                disabled={ocupado}
                onClick={() => setForm(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="own-btn own-btn-primary">
                {guardando ? 'Guardando…' : '✓ Guardar servicio'}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {cargando && (
        <div className="own-loading-card" role="status">
          <span className="own-spinner" aria-hidden="true" />
          <span>Cargando catálogo de servicios…</span>
        </div>
      )}

      {datos && (
        <>
          {datos.servicios.length === 0 ? (
            <div className="own-empty-box">
              <p>
                {consulta.q
                  ? `No encontramos servicios que coincidan con “${consulta.q}”.`
                  : 'Todavía no has registrado servicios en esta sucursal.'}
              </p>
              {!consulta.q && !form && (
                <button
                  type="button"
                  className="own-btn own-btn-primary"
                  onClick={() => setForm({
                    nombre_servicio: '',
                    tipo_servicio: tipos[0] || '',
                    tiempo_estimado_minutos: '30',
                    precio_base: '',
                  })}
                >
                  + Registrar mi primer servicio
                </button>
              )}
            </div>
          ) : (
            <div className="own-table-card">
              <div className="owner-table-wrap">
                <table className="own-table">
                  <thead>
                    <tr>
                      <th>Servicio</th>
                      <th>Área</th>
                      <th>Duración</th>
                      <th>Precio base</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.servicios.map(s => {
                      const infoTipo = TIPOS_ETIQUETA[s.tipo_servicio];
                      return (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.nombre_servicio}</strong>
                          </td>
                          <td>
                            <span className="own-badge own-badge-info">
                              {infoTipo ? `${infoTipo.icono} ${infoTipo.texto}` : s.tipo_servicio}
                            </span>
                          </td>
                          <td>⏱ {s.tiempo_estimado_minutos} min</td>
                          <td>
                            <strong className="own-price-tag">
                              ${Number(s.precio_base).toFixed(2)}
                            </strong>
                          </td>
                          <td>
                            {s.tiene_citas ? (
                              <span
                                className="own-badge own-badge-neutral"
                                title="Los servicios con citas asociadas conservan su historial y no pueden modificarse ni eliminarse."
                              >
                                🔒 Con historial de citas
                              </span>
                            ) : (
                              <div className="own-row-actions">
                                <button
                                  type="button"
                                  className="own-btn own-btn-sm own-btn-secondary"
                                  disabled={ocupado || bloqueado || Boolean(form)}
                                  onClick={() => {
                                    setAviso('');
                                    setForm({ ...s });
                                  }}
                                >
                                  ✎ Editar
                                </button>
                                <button
                                  type="button"
                                  className="own-btn own-btn-sm own-btn-danger-ghost"
                                  disabled={ocupado || bloqueado || Boolean(form)}
                                  onClick={() => {
                                    if (window.confirm(`¿Eliminar el servicio “${s.nombre_servicio}”?`)) {
                                      guardar('DELETE', s);
                                    }
                                  }}
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="own-pagination">
            <span className="own-pagination-meta">
              {datos.total} servicio(s) en total · Nota: los servicios con citas previas se protegen contra edición para conservar el historial.
            </span>
            <div className="own-pagination-buttons">
              <button
                type="button"
                className="own-btn own-btn-sm own-btn-secondary"
                disabled={ocupado || Boolean(form) || consulta.desde === 0}
                onClick={() => setConsulta(c => ({
                  ...c,
                  desde: Math.max(0, c.desde - 20),
                }))}
              >
                ← Anterior
              </button>
              <button
                type="button"
                className="own-btn own-btn-sm own-btn-secondary"
                disabled={ocupado || Boolean(form) || !datos.hayMas}
                onClick={() => setConsulta(c => ({
                  ...c,
                  desde: c.desde + 20,
                }))}
              >
                Siguiente →
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}