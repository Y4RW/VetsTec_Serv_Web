import { useCallback, useEffect, useRef, useState } from 'react';

const dias = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles',
  'Jueves', 'Viernes', 'Sábado',
];

const ORDEN_DIAS_VISTA = [1, 2, 3, 4, 5, 6, 0];

const tipos = [
  ['VETERINARIO', '🩺 Veterinario(a)'],
  ['ESTILISTA', '✂️ Estilista canino'],
  ['AMBO', '🐾 Veterinario y estilista'],
  ['ADMINISTRATIVO', '💼 Administrativo / Recepción'],
];

const ETIQUETA_TIPO = Object.fromEntries(tipos);

function completarHorarios(lista) {
  return dias.map((_, dia) => {
    const h = lista.find(x => x.dia_semana === dia);

    return {
      dia_semana: dia,
      cerrado: h ? h.cerrado : true,
      hora_apertura: h?.hora_apertura?.slice(0, 5) || '',
      hora_cierre: h?.hora_cierre?.slice(0, 5) || '',
    };
  });
}

function inicialesDe(nombre, apellido) {
  const a = String(nombre || '').trim().charAt(0);
  const b = String(apellido || '').trim().charAt(0);
  return (a + b).toUpperCase() || '👤';
}

async function pedir(url, opciones = {}) {
  const r = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...opciones,
  });

  if (r.status === 401) {
    window.dispatchEvent(new Event('vetstec:sesion-vencida'));
  }

  const j = await r.json().catch(() => null);

  if (!r.ok || j?.success !== true || !j.data?.version) {
    throw new Error(
      j?.message || 'No se pudo confirmar la operación. Recarga los datos.'
    );
  }

  return j.data;
}

export default function PersonalSucursal({
  idSucursal,
  onTotal,
  onGuardando,
}) {
  const [datos, setDatos] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [empleado, setEmpleado] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState('equipo');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const lectura = useRef(null);
  const montado = useRef(false);
  const enviando = useRef(false);

  const base = `/api/propietario/sucursales/${idSucursal}/personal`;

  const aplicar = useCallback(d => {
    setDatos(d);
    setHorarios(completarHorarios(d.horarios));
    setEmpleado(null);
    onTotal(idSucursal, d.empleados.length);
  }, [idSucursal, onTotal]);

  const cargar = useCallback(async () => {
    lectura.current?.abort();
    const controller = new AbortController();
    lectura.current = controller;

    setCargando(true);
    setError('');

    try {
      const d = await pedir(base, { signal: controller.signal });

      if (!montado.current || controller.signal.aborted) return;

      aplicar(d);
      setBloqueado(false);
    } catch (e) {
      if (montado.current && !controller.signal.aborted) {
        setError(e.message);
        setDatos(null);
      }
    } finally {
      if (montado.current && !controller.signal.aborted) {
        setCargando(false);
      }
    }
  }, [base, aplicar]);

  useEffect(() => {
    montado.current = true;
    cargar();

    return () => {
      montado.current = false;
      lectura.current?.abort();
    };
  }, [cargar]);

  async function guardar(operacion, contenido) {
    if (
      enviando.current ||
      cargando ||
      bloqueado ||
      !datos
    ) return;

    enviando.current = true;
    setGuardando(true);
    onGuardando(true);
    setError('');
    setAviso('');

    try {
      const d = await pedir(base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'VetStec',
        },
        body: JSON.stringify({
          version: datos.version,
          operacion,
          datos: contenido,
        }),
      });

      if (!montado.current) return;

      aplicar(d);
      setAviso(
        operacion === 'horarios'
          ? 'Horario semanal guardado correctamente.'
          : 'Datos del integrante guardados.'
      );
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

  function editar(e) {
    setAviso('');
    setEmpleado({
      id: e.id,
      nombre: e.nombre,
      apellido: e.apellido,
      correo: e.correo,
      telefono: e.telefono || '',
      tipo_personal: e.tipo_personal,
      activo: e.activo === true,
    });
  }

  function alternarDiaAbierto(indiceDia, abrir) {
    setHorarios(anterior =>
      anterior.map((d, j) => {
        if (j !== indiceDia) return d;
        return {
          ...d,
          cerrado: !abrir,
          hora_apertura: abrir && !d.hora_apertura ? '09:00' : d.hora_apertura,
          hora_cierre: abrir && !d.hora_cierre ? '18:00' : d.hora_cierre,
        };
      })
    );
  }

  function copiarLunesAViernes() {
    const lunes = horarios[1];
    if (!lunes || lunes.cerrado || !lunes.hora_apertura || !lunes.hora_cierre) return;
    setHorarios(anterior =>
      anterior.map((d, idx) =>
        idx >= 2 && idx <= 5
          ? {
              ...d,
              cerrado: false,
              hora_apertura: lunes.hora_apertura,
              hora_cierre: lunes.hora_cierre,
            }
          : d
      )
    );
    setAviso('Se copió el horario del lunes a martes, miércoles, jueves y viernes. Pulsa “Guardar horario semanal” para confirmar.');
  }

  const ocupado = cargando || guardando;
  const filtro = busqueda.trim().toLowerCase();
  const lista = (datos?.empleados || []).filter(e =>
    `${e.nombre} ${e.apellido} ${e.correo}`.toLowerCase().includes(filtro)
  );
  const activosCount = (datos?.empleados || []).filter(e => e.activo === true).length;
  const diasAbiertos = horarios.filter(h => !h.cerrado).length;
  const lunesListoParaCopiar = Boolean(
    horarios[1] && !horarios[1].cerrado && horarios[1].hora_apertura && horarios[1].hora_cierre
  );

  return (
    <section className="owner-products own-module">
      <div className="own-module-header">
        <div>
          <h4>Equipo de trabajo y horarios de atención</h4>
          <p>Administra al personal que atiende citas y configura los días y horas de apertura.</p>
        </div>

        <div className="own-module-actions">
          <button
            type="button"
            className="own-btn own-btn-secondary"
            disabled={ocupado}
            onClick={() => {
              if (datos && !window.confirm('Recargar descartará cambios sin guardar en formularios u horarios. ¿Continuar?')) return;
              cargar();
            }}
          >
            ↻ Actualizar
          </button>

          {vista === 'equipo' && (
            <button
              type="button"
              className="own-btn own-btn-primary"
              disabled={ocupado || bloqueado || !datos || Boolean(empleado)}
              onClick={() => {
                setAviso('');
                setEmpleado({
                  nombre: '',
                  apellido: '',
                  correo: '',
                  telefono: '',
                  tipo_personal: 'VETERINARIO',
                  activo: true,
                });
              }}
            >
              + Agregar integrante
            </button>
          )}
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
          Pulsa <strong>Actualizar</strong> antes de reintentar para sincronizar la versión actual (copia antes cualquier cambio que quieras conservar).
        </div>
      )}

      {cargando && (
        <div className="own-loading-card" role="status">
          <span className="own-spinner" aria-hidden="true" />
          <span>Cargando personal y horarios…</span>
        </div>
      )}

      {datos && !cargando && (
        <>
          <div className="own-subtabs" role="tablist" aria-label="Secciones de personal y horarios">
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'equipo'}
              className={`own-subtab ${vista === 'equipo' ? 'is-active' : ''}`}
              disabled={ocupado}
              onClick={() => setVista('equipo')}
            >
              <span>👥 Equipo de trabajo</span>
              <span className="own-filter-count">{datos.empleados.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'horarios'}
              className={`own-subtab ${vista === 'horarios' ? 'is-active' : ''}`}
              disabled={ocupado || Boolean(empleado)}
              onClick={() => setVista('horarios')}
            >
              <span>🕒 Horario semanal</span>
              <span className="own-filter-count">{diasAbiertos}/7 días</span>
            </button>
          </div>

          {vista === 'equipo' && (
            <>
              <div className="own-search-bar">
                <div className="own-search-input-wrap">
                  <span className="own-search-icon" aria-hidden="true">🔎</span>
                  <input
                    type="search"
                    value={busqueda}
                    placeholder="Filtrar integrante por nombre, apellido o correo…"
                    aria-label="Buscar empleado"
                    onChange={e => setBusqueda(e.target.value)}
                  />
                </div>
                {busqueda && (
                  <button
                    type="button"
                    className="own-btn own-btn-ghost"
                    onClick={() => setBusqueda('')}
                  >
                    Limpiar
                  </button>
                )}
                <span className="own-badge own-badge-success">
                  {activosCount} activo(s) de {datos.empleados.length}
                </span>
              </div>

              {empleado && (
                <form
                  className="own-form-panel"
                  onSubmit={e => {
                    e.preventDefault();
                    guardar('empleado', empleado);
                  }}
                >
                  <div className="own-form-panel-head">
                    <div>
                      <span className="own-eyebrow">{empleado.id ? 'Edición' : 'Nuevo registro'}</span>
                      <h4>{empleado.id ? 'Editar integrante del equipo' : 'Registrar nuevo integrante'}</h4>
                    </div>
                    <button
                      type="button"
                      className="own-btn own-btn-sm own-btn-ghost"
                      disabled={ocupado}
                      onClick={() => setEmpleado(null)}
                    >
                      ✕ Cerrar
                    </button>
                  </div>

                  <fieldset className="own-fieldset" disabled={ocupado || bloqueado}>
                    <div className="own-form-grid">
                      {[
                        ['nombre', 'Nombre(s) *', 'text', 100, 'Ej. Laura'],
                        ['apellido', 'Apellidos *', 'text', 100, 'Ej. Gómez Pérez'],
                        ['correo', 'Correo electrónico *', 'email', 150, 'ejemplo@clinica.com'],
                        ['telefono', 'Teléfono (opcional)', 'tel', 20, '10 dígitos'],
                      ].map(([campo, etiqueta, tipo, maximo, placeholder]) => (
                        <label className="own-field" key={campo}>
                          <span>{etiqueta}</span>
                          <input
                            type={tipo}
                            required={campo !== 'telefono'}
                            maxLength={maximo}
                            placeholder={placeholder}
                            value={empleado[campo]}
                            onChange={e => setEmpleado(a => ({
                              ...a,
                              [campo]: e.target.value,
                            }))}
                          />
                        </label>
                      ))}

                      <label className="own-field">
                        <span>Rol operativo *</span>
                        <select
                          value={empleado.tipo_personal}
                          onChange={e => setEmpleado(a => ({
                            ...a,
                            tipo_personal: e.target.value,
                          }))}
                        >
                          {tipos.map(([valor, etiqueta]) => (
                            <option key={valor} value={valor}>{etiqueta}</option>
                          ))}
                        </select>
                      </label>

                      <div className="own-field own-field-align-end">
                        <label className="own-check-pill">
                          <input
                            type="checkbox"
                            checked={empleado.activo}
                            onChange={e => setEmpleado(a => ({
                              ...a,
                              activo: e.target.checked,
                            }))}
                          />
                          <span>Disponible como personal activo</span>
                        </label>
                      </div>
                    </div>

                    <p className="own-field-hint">
                      ℹ️ Este registro permite asignar citas al integrante dentro de la agenda; no crea una cuenta de acceso al panel.
                    </p>

                    <div className="own-form-footer">
                      <button
                        type="button"
                        className="own-btn own-btn-secondary"
                        disabled={ocupado}
                        onClick={() => setEmpleado(null)}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="own-btn own-btn-primary">
                        {guardando ? 'Guardando…' : '✓ Guardar integrante'}
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}

              {lista.length === 0 ? (
                <div className="own-empty-box">
                  <p>
                    {busqueda
                      ? `No hay integrantes que coincidan con “${busqueda}”.`
                      : 'Todavía no has registrado integrantes en tu equipo de trabajo.'}
                  </p>
                  {!busqueda && !empleado && (
                    <button
                      type="button"
                      className="own-btn own-btn-primary"
                      onClick={() => setEmpleado({
                        nombre: '',
                        apellido: '',
                        correo: '',
                        telefono: '',
                        tipo_personal: 'VETERINARIO',
                        activo: true,
                      })}
                    >
                      + Registrar primer integrante
                    </button>
                  )}
                </div>
              ) : (
                <div className="own-table-card">
                  <div className="owner-table-wrap">
                    <table className="own-table">
                      <thead>
                        <tr>
                          <th>Integrante</th>
                          <th>Contacto</th>
                          <th>Rol</th>
                          <th>Estado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map(e => (
                          <tr key={e.id}>
                            <td>
                              <div className="own-person-cell">
                                <span className="own-avatar-sm" aria-hidden="true">
                                  {inicialesDe(e.nombre, e.apellido)}
                                </span>
                                <div>
                                  <strong>{e.nombre} {e.apellido}</strong>
                                  {e.telefono && <small className="own-cell-sub">📞 {e.telefono}</small>}
                                </div>
                              </div>
                            </td>
                            <td>{e.correo}</td>
                            <td>
                              <span className="own-badge own-badge-info">
                                {ETIQUETA_TIPO[e.tipo_personal] || e.tipo_personal}
                              </span>
                            </td>
                            <td>
                              <span className={`own-badge ${e.activo === true ? 'own-badge-success' : 'own-badge-neutral'}`}>
                                {e.activo === true ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="own-btn own-btn-sm own-btn-secondary"
                                disabled={ocupado || bloqueado || Boolean(empleado)}
                                onClick={() => editar(e)}
                              >
                                ✎ Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {vista === 'horarios' && (
            <form
              className="own-form-panel"
              onSubmit={e => {
                e.preventDefault();
                guardar('horarios', horarios);
              }}
            >
              <fieldset
                className="own-fieldset"
                disabled={ocupado || bloqueado || Boolean(empleado)}
              >
                <div className="own-form-panel-head">
                  <div>
                    <span className="own-eyebrow">Disponibilidad de la sucursal</span>
                    <legend className="own-fieldset-legend">Horario semanal de atención al público</legend>
                    <p className="own-field-hint" style={{ marginTop: 4 }}>
                      Activa los días en que abres tu establecimiento e indica la hora de apertura y cierre dentro del mismo día.
                    </p>
                  </div>

                  {lunesListoParaCopiar && (
                    <button
                      type="button"
                      className="own-btn own-btn-sm own-btn-secondary"
                      onClick={copiarLunesAViernes}
                    >
                      ⚡ Copiar Lunes a Viernes
                    </button>
                  )}
                </div>

                <div className="own-schedule-list">
                  {ORDEN_DIAS_VISTA.map(indiceDia => {
                    const h = horarios[indiceDia];
                    if (!h) return null;
                    const abierto = !h.cerrado;
                    return (
                      <div
                        className={`own-schedule-row ${abierto ? 'is-open' : 'is-closed'}`}
                        key={h.dia_semana}
                      >
                        <div className="own-schedule-day">
                          <strong>{dias[h.dia_semana]}</strong>
                          <label className={`own-check-pill ${abierto ? 'is-checked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={abierto}
                              onChange={e => alternarDiaAbierto(indiceDia, e.target.checked)}
                            />
                            <span>{abierto ? 'Abierto' : 'Cerrado'}</span>
                          </label>
                        </div>

                        {abierto ? (
                          <div className="own-schedule-times">
                            <label className="own-inline-field">
                              <span>Apertura</span>
                              <input
                                type="time"
                                required
                                value={h.hora_apertura}
                                onChange={e => setHorarios(anterior =>
                                  anterior.map((d, j) =>
                                    j === indiceDia ? { ...d, hora_apertura: e.target.value } : d
                                  )
                                )}
                              />
                            </label>
                            <span className="own-schedule-sep" aria-hidden="true">a</span>
                            <label className="own-inline-field">
                              <span>Cierre</span>
                              <input
                                type="time"
                                required
                                value={h.hora_cierre}
                                onChange={e => setHorarios(anterior =>
                                  anterior.map((d, j) =>
                                    j === indiceDia ? { ...d, hora_cierre: e.target.value } : d
                                  )
                                )}
                              />
                            </label>
                          </div>
                        ) : (
                          <p className="own-schedule-closed-text">Sin atención al público este día</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="own-form-footer">
                  <button type="submit" className="own-btn own-btn-primary">
                    {guardando ? 'Guardando…' : '✓ Guardar horario semanal'}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </>
      )}
    </section>
  );
}