import { useEffect, useRef, useState } from 'react';

const vacio = fecha => ({
  fecha,
  hora: '',
  id_mascota: '',
  id_servicio: '',
  id_empleado: '',
  nombre_dueno: '',
  telefono: '',
  nombre_mascota: '',
  raza: '',
  peso: '',
});

const transiciones = {
  PROGRAMADA: [
    ['EN_PROCESO', '▶ Iniciar', 'primary'],
    ['RETRASADA', '⏱ Retraso', 'warning'],
    ['CANCELADA', '✕ Cancelar', 'danger'],
  ],
  RETRASADA: [
    ['EN_PROCESO', '▶ Iniciar', 'primary'],
    ['CANCELADA', '✕ Cancelar', 'danger'],
  ],
  EN_PROCESO: [
    ['FINALIZADA', '✓ Finalizar', 'success'],
  ],
};

const ESTADOS_CITA = {
  PROGRAMADA: { label: 'Programada', tono: 'info' },
  RETRASADA: { label: 'Con retraso', tono: 'warning' },
  EN_PROCESO: { label: 'En atención', tono: 'teal' },
  FINALIZADA: { label: 'Finalizada', tono: 'success' },
  CANCELADA: { label: 'Cancelada', tono: 'danger' },
};

const ESTADOS_SOLICITUD = {
  PENDIENTE: { label: 'Pendiente', tono: 'warning' },
  ACEPTADA: { label: 'Aceptada', tono: 'info' },
  CONFIRMADA: { label: 'Confirmada', tono: 'success' },
  RECHAZADA: { label: 'Rechazada', tono: 'danger' },
  CANCELADA: { label: 'Cancelada', tono: 'neutral' },
};

function moverFechaISO(iso, diasDelta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + diasDelta));
  return dt.toISOString().slice(0, 10);
}

function formatearFechaLarga(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  try {
    const texto = new Intl.DateTimeFormat('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dt);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  } catch {
    return iso;
  }
}

function buildWhatsAppCliente(rawPhone, text) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  const mxPhone = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${mxPhone}?text=${encodeURIComponent(text)}`;
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

  if (!r.ok || j?.success !== true) {
    throw new Error(
      j?.message || 'No fue posible consultar la agenda.'
    );
  }

  return j.data;
}

export default function CitasSucursal({
  idSucursal,
  onTotal,
  onGuardando,
}) {
  const [datos, setDatos] = useState(null);
  const [fecha, setFecha] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState(null);
  const [capacidad, setCapacidad] = useState('5');
  const [activo, setActivo] = useState(true);
  const [incierto, setIncierto] = useState(false);
  const [filtro, setFiltro] = useState('');

  const vivo = useRef(false);
  const ocupado = useRef(false);
  const formRef = useRef(null);

  const base = `/api/propietario/sucursales/${idSucursal}/citas`;
  const url = fecha ? `${base}?fecha=${encodeURIComponent(fecha)}` : base;

  function aplicar(d) {
    setDatos(d);
    setCapacidad(String(d.disponibilidad?.capacidad_maxima ?? 5));
    setActivo(d.disponibilidad?.activo ?? true);
    onTotal?.(idSucursal, d.total);
  }

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      onGuardando?.(false);
    };
  }, [onGuardando]);

  useEffect(() => {
    const controller = new AbortController();

    setCargando(true);
    setError('');
    setForm(null);
    setDatos(null);

    pedir(url, { signal: controller.signal })
      .then(d => {
        if (!controller.signal.aborted) {
          aplicar(d);
          setIncierto(false);
        }
      })
      .catch(e => {
        if (!controller.signal.aborted) {
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCargando(false);
        }
      });

    return () => controller.abort();
  }, [url, recarga, onTotal, idSucursal]);

  useEffect(() => {
    if (form && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [form]);

  async function enviar(operacion, contenido) {
    if (ocupado.current || !datos || incierto) {
      return;
    }

    ocupado.current = true;
    setGuardando(true);
    onGuardando?.(true);
    setError('');
    setAviso('');

    try {
      const d = await pedir(
        `${base}?fecha=${encodeURIComponent(datos.fecha)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'VetStec',
          },
          body: JSON.stringify({
            operacion,
            datos: contenido,
            version: datos.version,
          }),
        }
      );

      if (!vivo.current) return;

      aplicar(d);
      setForm(null);

      setAviso(
        operacion === 'guardar'
          ? `Cita guardada para el ${contenido.fecha} a las ${contenido.hora}.`
          : operacion === 'disponibilidad'
            ? 'Disponibilidad y cupo del día actualizados.'
            : 'Estado actualizado correctamente.'
      );
    } catch (e) {
      if (vivo.current) {
        setError(
          `${e.message} Pulsa "Actualizar agenda" antes de intentar otra operación.`
        );
        setIncierto(true);
      }
    } finally {
      ocupado.current = false;
      if (vivo.current) {
        setGuardando(false);
        onGuardando?.(false);
      }
    }
  }

  const bloqueado = cargando || guardando || incierto;

  function cambiar(campo, valor) {
    setForm(anterior => ({
      ...anterior,
      [campo]: valor,
    }));
  }

  function confirmar(s) {
    setAviso('');
    setForm({
      ...vacio(s.fecha),
      id_solicitud_publica: s.id,
      hora: s.hora.slice(0, 5),
      nombre_mascota: s.nombre_mascota,
      telefono: s.telefono,
    });
  }

  function guardar(e) {
    e.preventDefault();

    enviar('guardar', {
      id: form.id ?? null,
      id_solicitud_publica: form.id_solicitud_publica ?? null,
      fecha: form.fecha,
      hora: form.hora,
      id_mascota: form.id_mascota ? Number(form.id_mascota) : null,
      id_servicio: Number(form.id_servicio),
      id_empleado: Number(form.id_empleado),
      nuevo: {
        nombre_dueno: form.nombre_dueno,
        telefono: form.telefono,
        nombre_mascota: form.nombre_mascota,
        raza: form.raza,
        peso: Number(form.peso),
      },
    });
  }

  const servicio = datos?.servicios.find(
    s => s.id === Number(form?.id_servicio)
  );

  const empleados = datos?.empleados.filter(e =>
    !servicio ||
    [
      servicio.tipo_servicio === 'VETERINARIA' ? 'VETERINARIO' : 'ESTILISTA',
      'AMBO',
    ].includes(e.tipo_personal)
  ) || [];

  const fechaActiva = fecha || datos?.fecha || '';
  const citasFiltradas = datos?.citas.filter(
    c => !filtro || c.estado === filtro
  ) || [];

  const solicitudesPendientes = (datos?.solicitudes || []).filter(
    s => !s.id_cita && ['PENDIENTE', 'ACEPTADA', 'CONFIRMADA'].includes(s.estado)
  ).length;

  return (
    <section className="owner-citas own-module" aria-label="Citas de la sucursal">
      <div className="own-module-header">
        <div>
          <h4>Agenda y solicitudes de citas</h4>
          <p>
            {fechaActiva ? (
              <>
                Consultando: <strong>{formatearFechaLarga(fechaActiva)}</strong>
                {datos?.zona ? ` · Zona horaria ${datos.zona}` : ''}
              </>
            ) : (
              'Consulta solicitudes web, publica cupos diarios y administra tus citas.'
            )}
          </p>
        </div>

        <div className="own-module-actions">
          <button
            type="button"
            className="own-btn own-btn-secondary"
            disabled={cargando || guardando}
            onClick={() => setRecarga(n => n + 1)}
          >
            ↻ Actualizar agenda
          </button>

          <button
            type="button"
            className="own-btn own-btn-primary"
            disabled={bloqueado || !datos}
            onClick={() => {
              setAviso('');
              setForm(vacio(datos.fecha));
            }}
          >
            + Nueva cita manual
          </button>
        </div>
      </div>

      <div className="own-date-bar" role="group" aria-label="Selector de fecha">
        <div className="own-date-nav">
          <button
            type="button"
            className="own-btn own-btn-sm own-btn-secondary"
            disabled={guardando || !fechaActiva}
            onClick={() => {
              setFecha(moverFechaISO(fechaActiva, -1));
              setAviso('');
            }}
            aria-label="Día anterior"
          >
            ◀ Anterior
          </button>

          <label className="own-date-picker-label">
            <span className="sr-only">Fecha de consulta</span>
            <input
              type="date"
              value={fechaActiva}
              disabled={guardando}
              aria-label="Fecha de consulta"
              onChange={e => {
                setFecha(e.target.value);
                setAviso('');
              }}
            />
          </label>

          <button
            type="button"
            className="own-btn own-btn-sm own-btn-secondary"
            disabled={guardando || !fechaActiva}
            onClick={() => {
              setFecha(moverFechaISO(fechaActiva, 1));
              setAviso('');
            }}
            aria-label="Día siguiente"
          >
            Siguiente ▶
          </button>

          {fecha !== '' && (
            <button
              type="button"
              className="own-btn own-btn-sm own-btn-ghost"
              disabled={guardando}
              onClick={() => {
                setFecha('');
                setAviso('');
              }}
            >
              Ir a hoy
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="own-alert own-alert-danger">
          {error}
        </p>
      )}

      {aviso && (
        <div role="status" className="own-alert own-alert-success">
          <span>✓ {aviso}</span>
          <button
            type="button"
            className="own-alert-dismiss"
            onClick={() => setAviso('')}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      {cargando && (
        <div className="own-loading-card" role="status">
          <span className="own-spinner" aria-hidden="true" />
          <span>Cargando agenda del día…</span>
        </div>
      )}

      {datos && (
        <>
          <form
            className="own-quota-card"
            onSubmit={e => {
              e.preventDefault();
              enviar('disponibilidad', {
                capacidad_maxima: Number(capacidad),
                activo,
              });
            }}
          >
            <div className="own-quota-info">
              <div className="own-quota-title-row">
                <strong>Cupo para reservas en línea ({datos.fecha})</strong>
                {!datos.disponibilidad ? (
                  <span className="own-badge own-badge-neutral">Sin cupo publicado</span>
                ) : datos.disponibilidad.activo ? (
                  <span className="own-badge own-badge-success">
                    🟢 Activo · Máx. {datos.disponibilidad.capacidad_maxima} citas
                  </span>
                ) : (
                  <span className="own-badge own-badge-warning">⏸ Reservas pausadas</span>
                )}
              </div>
              <p>
                Publica cupo para recibir solicitudes web en los próximos 7 días dentro de tu horario semanal.
              </p>
            </div>

            <fieldset className="own-quota-controls" disabled={bloqueado}>
              <label className="own-inline-field">
                <span>Cupo diario</span>
                <input
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  required
                  value={capacidad}
                  onChange={e => setCapacidad(e.target.value)}
                />
              </label>

              <label className="own-check-pill">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={e => setActivo(e.target.checked)}
                />
                <span>Admitir reservas</span>
              </label>

              <button className="own-btn own-btn-secondary" type="submit">
                Guardar cupo
              </button>
            </fieldset>
          </form>

          {form && (
            <form
              ref={formRef}
              className="own-form-panel"
              onSubmit={guardar}
            >
              <div className="own-form-panel-head">
                <div>
                  <span className="own-eyebrow">
                    {form.id
                      ? `Cita #${form.id}`
                      : form.id_solicitud_publica
                        ? `Solicitud web #${form.id_solicitud_publica}`
                        : 'Registro directo'}
                  </span>
                  <h4>
                    {form.id
                      ? 'Editar o reprogramar cita'
                      : form.id_solicitud_publica
                        ? 'Confirmar solicitud del cliente'
                        : 'Registrar nueva cita manual'}
                  </h4>
                </div>

                <button
                  type="button"
                  className="own-btn own-btn-sm own-btn-ghost"
                  disabled={bloqueado}
                  onClick={() => setForm(null)}
                >
                  ✕ Cerrar
                </button>
              </div>

              <fieldset disabled={bloqueado} className="own-fieldset">
                <div className="own-form-grid">
                  <label className="own-field">
                    <span>Fecha de la cita *</span>
                    <input
                      type="date"
                      required
                      value={form.fecha}
                      disabled={Boolean(form.id_solicitud_publica && !form.id)}
                      onChange={e => cambiar('fecha', e.target.value)}
                    />
                  </label>

                  <label className="own-field">
                    <span>Hora *</span>
                    <input
                      type="time"
                      required
                      value={form.hora}
                      disabled={Boolean(form.id_solicitud_publica && !form.id)}
                      onChange={e => cambiar('hora', e.target.value)}
                    />
                  </label>

                  <label className="own-field own-field-full">
                    <span>Paciente y cliente</span>
                    <select
                      value={form.id_mascota || ''}
                      disabled={Boolean(form.id)}
                      onChange={e => cambiar('id_mascota', e.target.value)}
                    >
                      <option value="">+ Registrar nuevo cliente y mascota</option>
                      {datos.mascotas.map(m => (
                        <option key={m.id} value={m.id}>
                          #{m.id} · {m.nombre_mascota} — {m.nombre_dueno} ({m.telefono_celular})
                        </option>
                      ))}
                    </select>
                  </label>

                  {!form.id && !form.id_mascota && (
                    <div className="own-subform-box own-field-full">
                      <p className="own-subform-note">
                        Completa los datos para dar de alta al cliente y su mascota automáticamente:
                      </p>
                      <div className="own-form-grid">
                        {[
                          ['nombre_dueno', 'Nombre del dueño *', 150, 'Ej. Ana Martínez'],
                          ['telefono', 'Teléfono / WhatsApp *', 20, '10 dígitos'],
                          ['nombre_mascota', 'Nombre de la mascota *', 100, 'Ej. Max'],
                          ['raza', 'Raza o especie *', 100, 'Ej. Mestizo / Schnauzer'],
                        ].map(([campo, nombre, max, placeholder]) => (
                          <label className="own-field" key={campo}>
                            <span>{nombre}</span>
                            <input
                              required
                              maxLength={max}
                              placeholder={placeholder}
                              value={form[campo]}
                              onChange={e => cambiar(campo, e.target.value)}
                            />
                          </label>
                        ))}

                        <label className="own-field">
                          <span>Peso aproximado (kg) *</span>
                          <input
                            type="number"
                            min="0.01"
                            max="999.99"
                            step="0.01"
                            required
                            placeholder="Ej. 8.5"
                            value={form.peso}
                            onChange={e => cambiar('peso', e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <label className="own-field">
                    <span>Servicio a realizar *</span>
                    <select
                      required
                      value={form.id_servicio || ''}
                      onChange={e => setForm(f => ({
                        ...f,
                        id_servicio: e.target.value,
                        id_empleado: '',
                      }))}
                    >
                      <option value="">Selecciona un servicio</option>
                      {datos.servicios.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.nombre_servicio} ({s.tiempo_estimado_minutos} min)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="own-field">
                    <span>Profesional asignado *</span>
                    <select
                      required
                      value={form.id_empleado || ''}
                      onChange={e => cambiar('id_empleado', e.target.value)}
                    >
                      <option value="">Selecciona personal</option>
                      {empleados.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.nombre} {e.apellido}
                        </option>
                      ))}
                    </select>
                  </label>

                  {(datos.servicios.length === 0 || datos.empleados.length === 0) && (
                    <p className="own-field-hint own-field-full">
                      💡 Asegúrate de tener al menos un servicio activo en la pestaña <strong>Servicios</strong> y personal registrado en <strong>Personal y horarios</strong>.
                    </p>
                  )}
                </div>

                <div className="own-form-footer">
                  <button
                    type="button"
                    className="own-btn own-btn-secondary"
                    onClick={() => setForm(null)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="own-btn own-btn-primary">
                    {guardando ? 'Guardando…' : '✓ Guardar cita'}
                  </button>
                </div>
              </fieldset>
            </form>
          )}

          <div className="own-subsection">
            <div className="own-subsection-head">
              <div>
                <h5>Solicitudes recibidas desde el directorio</h5>
                <p>Peticiones enviadas por clientes para el {datos.fecha}.</p>
              </div>
              {solicitudesPendientes > 0 ? (
                <span className="own-badge own-badge-warning">
                  {solicitudesPendientes} por confirmar
                </span>
              ) : (
                <span className="own-badge own-badge-neutral">
                  {datos.solicitudes.length} en el día
                </span>
              )}
            </div>

            {!datos.solicitudes.length ? (
              <div className="own-empty-box">
                <p>No hay solicitudes públicas registradas para esta fecha.</p>
              </div>
            ) : (
              <div className="own-table-card">
                <div className="owner-table-wrap">
                  <table className="own-table">
                    <caption className="sr-only">
                      Solicitudes públicas de cita para el {datos.fecha}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Horario</th>
                        <th scope="col">Mascota</th>
                        <th scope="col">Contacto</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.solicitudes.map(s => {
                        const metaSol = ESTADOS_SOLICITUD[s.estado] || { label: s.estado, tono: 'neutral' };
                        return (
                          <tr key={s.id}>
                            <td>
                              <strong className="own-time-chip">{s.hora.slice(0, 5)}</strong>
                              <small className="own-id-sub">Solicitud #{s.id}</small>
                            </td>
                            <td>
                              <strong>🐾 {s.nombre_mascota}</strong>
                            </td>
                            <td>{s.telefono}</td>
                            <td>
                              <span className={`own-badge own-badge-${metaSol.tono}`}>
                                {metaSol.label}
                              </span>
                              {s.id_cita && (
                                <small className="own-id-sub">Cita #{s.id_cita}</small>
                              )}
                            </td>
                            <td>
                              <div className="own-row-actions">
                                {!s.id_cita && ['PENDIENTE', 'ACEPTADA', 'CONFIRMADA'].includes(s.estado) && (
                                  <>
                                    <button
                                      type="button"
                                      className="own-btn own-btn-sm own-btn-primary"
                                      disabled={bloqueado}
                                      aria-label={`Confirmar solicitud #${s.id} de ${s.nombre_mascota}`}
                                      onClick={() => confirmar(s)}
                                    >
                                      ✓ Confirmar
                                    </button>
                                    <button
                                      type="button"
                                      className="own-btn own-btn-sm own-btn-danger-ghost"
                                      disabled={bloqueado}
                                      aria-label={`Rechazar solicitud #${s.id} de ${s.nombre_mascota}`}
                                      onClick={() => {
                                        if (window.confirm(`¿Rechazar la solicitud #${s.id}?`)) {
                                          enviar('rechazar', { id: s.id });
                                        }
                                      }}
                                    >
                                      Rechazar
                                    </button>
                                  </>
                                )}

                                {s.telefono && (
                                  <a
                                    className="own-btn own-btn-sm own-btn-whatsapp"
                                    href={buildWhatsAppCliente(
                                      s.telefono,
                                      `Hola, te escribimos de la clínica veterinaria sobre la solicitud de cita #${s.id} para *${s.nombre_mascota}* el *${s.fecha}* a las *${s.hora.slice(0, 5)}*.`
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Enviar WhatsApp sobre solicitud #${s.id} de ${s.nombre_mascota}`}
                                  >
                                    💬 WhatsApp
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="own-subsection">
            <div className="own-subsection-head">
              <div>
                <h5>Agenda confirmada del día</h5>
                <p>Control de atención en tiempo real para las citas programadas.</p>
              </div>
            </div>

            <div className="own-filter-pills" role="group" aria-label="Filtrar citas por estado">
              {[
                ['', 'Todas', datos.citas.length],
                ['PROGRAMADA', 'Programadas', datos.citas.filter(c => c.estado === 'PROGRAMADA').length],
                ['EN_PROCESO', 'En atención', datos.citas.filter(c => c.estado === 'EN_PROCESO').length],
                ['RETRASADA', 'Con retraso', datos.citas.filter(c => c.estado === 'RETRASADA').length],
                ['FINALIZADA', 'Finalizadas', datos.citas.filter(c => c.estado === 'FINALIZADA').length],
                ['CANCELADA', 'Canceladas', datos.citas.filter(c => c.estado === 'CANCELADA').length],
              ].map(([valor, etiqueta, cuenta]) => (
                <button
                  key={valor || 'ALL'}
                  type="button"
                  aria-pressed={filtro === valor}
                  className={`own-filter-pill ${filtro === valor ? 'is-active' : ''}`}
                  onClick={() => setFiltro(valor)}
                >
                  <span>{etiqueta}</span>
                  <span className="own-filter-count">{cuenta}</span>
                </button>
              ))}
            </div>

            {!citasFiltradas.length ? (
              <div className="own-empty-box">
                <p>
                  {filtro
                    ? 'No hay citas en este estado para la fecha seleccionada.'
                    : 'Aún no hay citas programadas en la agenda de este día.'}
                </p>
              </div>
            ) : (
              <div className="own-table-card">
                <div className="owner-table-wrap">
                  <table className="own-table">
                    <caption className="sr-only">
                      Agenda de citas programadas para el {datos.fecha}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Hora</th>
                        <th scope="col">Paciente y cliente</th>
                        <th scope="col">Servicio y personal</th>
                        <th scope="col">Estado y tiempos</th>
                        <th scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {citasFiltradas.map(c => {
                        const metaCita = ESTADOS_CITA[c.estado] || { label: c.estado, tono: 'neutral' };
                        return (
                          <tr key={c.id}>
                            <td>
                              <strong className="own-time-chip">{c.hora?.slice(0, 5) || c.hora}</strong>
                              <small className="own-id-sub">Cita #{c.id}</small>
                            </td>

                            <td>
                              <strong>🐾 {c.nombre_mascota || 'Sin mascota'}</strong>
                              <small className="own-cell-sub">{c.nombre_dueno || 'Sin cliente'}</small>
                            </td>

                            <td>
                              <strong>{c.nombre_servicio || 'Sin servicio'}</strong>
                              <small className="own-cell-sub">👩‍⚕️ {c.empleado || 'Sin asignar'}</small>
                            </td>

                            <td>
                              <span className={`own-badge own-badge-${metaCita.tono}`}>
                                {metaCita.label}
                              </span>
                              {(c.hora_inicio || c.hora_fin || c.duracion_real_minutos != null) && (
                                <small className="own-cell-sub">
                                  {c.hora_inicio ? `Inicio: ${c.hora_inicio.slice(0, 5)}` : ''}
                                  {c.hora_fin ? ` · Fin: ${c.hora_fin.slice(0, 5)}` : ''}
                                  {c.duracion_real_minutos != null ? ` (${c.duracion_real_minutos} min)` : ''}
                                </small>
                              )}
                            </td>

                            <td>
                              <div className="own-row-actions">
                                {['PROGRAMADA', 'RETRASADA'].includes(c.estado) && (
                                  <button
                                    type="button"
                                    className="own-btn own-btn-sm own-btn-secondary"
                                    disabled={bloqueado}
                                    aria-label={`Editar o reprogramar cita #${c.id} de ${c.nombre_mascota || 'mascota'}`}
                                    onClick={() => setForm({
                                      ...vacio(c.fecha),
                                      ...c,
                                    })}
                                  >
                                    ✎ Editar
                                  </button>
                                )}

                                {(transiciones[c.estado] || []).map(([estadoDestino, etiqueta, variante]) => (
                                  <button
                                    type="button"
                                    key={estadoDestino}
                                    disabled={bloqueado}
                                    className={`own-btn own-btn-sm ${
                                      variante === 'primary'
                                        ? 'own-btn-primary'
                                        : variante === 'success'
                                          ? 'own-btn-teal'
                                          : variante === 'danger'
                                            ? 'own-btn-danger-ghost'
                                            : 'own-btn-secondary'
                                    }`}
                                    aria-label={`${etiqueta} cita #${c.id} de ${c.nombre_mascota || 'mascota'}`}
                                    onClick={() => {
                                      if (window.confirm(`¿Confirmas cambiar el estado de la cita #${c.id} (${etiqueta})?`)) {
                                        enviar('estado', {
                                          id: c.id,
                                          estado: estadoDestino,
                                        });
                                      }
                                    }}
                                  >
                                    {etiqueta}
                                  </button>
                                ))}

                                {c.telefono_celular && (
                                  <a
                                    className="own-btn own-btn-sm own-btn-whatsapp"
                                    href={buildWhatsAppCliente(
                                      c.telefono_celular,
                                      `Hola ${c.nombre_dueno || ''}, te contactamos respecto a la cita #${c.id} de *${c.nombre_mascota || 'tu mascota'}* (${c.nombre_servicio || 'consulta'}) programada a las *${c.hora}*.`
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Enviar WhatsApp a ${c.nombre_dueno || 'cliente'} sobre cita #${c.id}`}
                                  >
                                    💬 WhatsApp
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}