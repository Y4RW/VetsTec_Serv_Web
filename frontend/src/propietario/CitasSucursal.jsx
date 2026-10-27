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
    ['RETRASADA', 'Marcar retraso'],
    ['EN_PROCESO', 'Iniciar'],
    ['CANCELADA', 'Cancelar'],
  ],
  RETRASADA: [
    ['EN_PROCESO', 'Iniciar'],
    ['CANCELADA', 'Cancelar'],
  ],
  EN_PROCESO: [
    ['FINALIZADA', 'Finalizar'],
  ],
};

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

  const base =
    `/api/propietario/sucursales/${idSucursal}/citas`;

  const url = fecha
    ? `${base}?fecha=${encodeURIComponent(fecha)}`
    : base;

  function aplicar(d) {
    setDatos(d);

    setCapacidad(
      String(d.disponibilidad?.capacidad_maxima ?? 5)
    );

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

    pedir(url, {
      signal: controller.signal,
    }).then(d => {
      if (!controller.signal.aborted) {
        aplicar(d);
        setIncierto(false);
      }
    }).catch(e => {
      if (!controller.signal.aborted) {
        setError(e.message);
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        setCargando(false);
      }
    });

    return () => controller.abort();
  }, [url, recarga, onTotal, idSucursal]);

  async function enviar(operacion, contenido) {
    if (
      ocupado.current ||
      !datos ||
      incierto
    ) {
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
          ? `Cita guardada para ${contenido.fecha} a las ${contenido.hora}.`
          : 'Cambio guardado.'
      );
    } catch (e) {
      if (vivo.current) {
        setError(
          `${e.message} Pulsa Actualizar agenda antes de intentar otra operación.`
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

  const bloqueado =
    cargando || guardando || incierto;

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
      id_solicitud_publica:
        form.id_solicitud_publica ?? null,
      fecha: form.fecha,
      hora: form.hora,
      id_mascota: form.id_mascota
        ? Number(form.id_mascota)
        : null,
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
      servicio.tipo_servicio === 'VETERINARIA'
        ? 'VETERINARIO'
        : 'ESTILISTA',
      'AMBO',
    ].includes(e.tipo_personal)
  ) || [];

  const citasFiltradas = datos?.citas.filter(
    c => !filtro || c.estado === filtro
  ) || [];

  return (
    <section
      className="owner-citas"
      aria-label="Citas de la sucursal"
    >
      <h4>Solicitudes y citas</h4>

      <div className="owner-edit-actions">
        <label>
          Fecha de consulta
          <input
            type="date"
            value={fecha || datos?.fecha || ''}
            disabled={guardando}
            onChange={e => {
              setFecha(e.target.value);
              setAviso('');
            }}
          />
        </label>

        <button
          type="button"
          className="button button-secondary"
          disabled={cargando || guardando}
          onClick={() => setRecarga(n => n + 1)}
        >
          Actualizar agenda
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={bloqueado || !datos}
          onClick={() => setForm(vacio(datos.fecha))}
        >
          Nueva cita manual
        </button>
      </div>

      {error && (
        <p role="alert" className="owner-error">
          {error}
        </p>
      )}

      {aviso && (
        <p role="status" className="owner-success">
          {aviso}
        </p>
      )}

      {cargando && (
        <p role="status">Cargando agenda…</p>
      )}

      {datos && (
        <>
          <p>
            Horarios en la zona configurada en el servidor:{' '}
            <strong>{datos.zona}</strong>.
            Las solicitudes se consultan por la fecha seleccionada.
          </p>

          <form
            className="register-card"
            onSubmit={e => {
              e.preventDefault();

              enviar('disponibilidad', {
                capacidad_maxima: Number(capacidad),
                activo,
              });
            }}
          >
            <h4>Disponibilidad del {datos.fecha}</h4>

            <p>
              Publicar cupo permite recibir solicitudes en los
              próximos siete días, si hay horario de atención.
              Desactivar impide nuevas reservas; conserva las existentes.
            </p>

            {!datos.disponibilidad && (
              <p>
                Este día aún no tiene cupo publicado. Puedes
                registrar citas manuales dentro del horario de atención.
              </p>
            )}

            <fieldset disabled={bloqueado}>
              <label>
                Capacidad diaria
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

              <label>
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={e => setActivo(e.target.checked)}
                />
                Admitir reservas
              </label>

              <button
                className="button button-secondary"
                type="submit"
              >
                Guardar disponibilidad
              </button>
            </fieldset>
          </form>

          {form && (
            <form
              className="register-card"
              onSubmit={guardar}
            >
              <h4>
                {form.id
                  ? 'Editar / reprogramar cita'
                  : form.id_solicitud_publica
                    ? `Confirmar solicitud #${form.id_solicitud_publica}`
                    : 'Registrar cita'}
              </h4>

              <fieldset
                disabled={bloqueado}
                className="register-form-grid"
              >
                <label className="form-field">
                  Fecha
                  <input
                    type="date"
                    required
                    value={form.fecha}
                    disabled={Boolean(
                      form.id_solicitud_publica && !form.id
                    )}
                    onChange={e => cambiar('fecha', e.target.value)}
                  />
                </label>

                <label className="form-field">
                  Hora
                  <input
                    type="time"
                    required
                    value={form.hora}
                    disabled={Boolean(
                      form.id_solicitud_publica && !form.id
                    )}
                    onChange={e => cambiar('hora', e.target.value)}
                  />
                </label>

                <label className="form-field">
                  Mascota y cliente
                  <select
                    value={form.id_mascota || ''}
                    disabled={Boolean(form.id)}
                    onChange={e =>
                      cambiar('id_mascota', e.target.value)
                    }
                  >
                    <option value="">
                      Registrar nuevo cliente y mascota
                    </option>

                    {datos.mascotas.map(m => (
                      <option key={m.id} value={m.id}>
                        #{m.id} · {m.nombre_mascota}
                        {' — '}
                        {m.nombre_dueno}
                        {' · '}
                        {m.telefono_celular}
                      </option>
                    ))}
                  </select>
                </label>

                {!form.id && !form.id_mascota && (
                  <>
                    <p>
                      Esta opción crea un cliente y una mascota
                      nuevos. Si ya existen, selecciónalos arriba.
                    </p>

                    {[
                      ['nombre_dueno', 'Nombre del dueño', 150],
                      ['telefono', 'Teléfono', 20],
                      ['nombre_mascota', 'Nombre de la mascota', 100],
                      ['raza', 'Raza', 100],
                    ].map(([campo, nombre, max]) => (
                      <label className="form-field" key={campo}>
                        {nombre}
                        <input
                          required
                          maxLength={max}
                          value={form[campo]}
                          onChange={e =>
                            cambiar(campo, e.target.value)
                          }
                        />
                      </label>
                    ))}

                    <label className="form-field">
                      Peso en kg
                      <input
                        type="number"
                        min="0.01"
                        max="999.99"
                        step="0.01"
                        required
                        value={form.peso}
                        onChange={e =>
                          cambiar('peso', e.target.value)
                        }
                      />
                    </label>
                  </>
                )}

                <label className="form-field">
                  Servicio
                  <select
                    required
                    value={form.id_servicio || ''}
                    onChange={e => setForm(f => ({
                      ...f,
                      id_servicio: e.target.value,
                      id_empleado: '',
                    }))}
                  >
                    <option value="">
                      Selecciona un servicio
                    </option>

                    {datos.servicios.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nombre_servicio}
                        {' · '}
                        {s.tiempo_estimado_minutos} min
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  Empleado
                  <select
                    required
                    value={form.id_empleado || ''}
                    onChange={e =>
                      cambiar('id_empleado', e.target.value)
                    }
                  >
                    <option value="">
                      Selecciona un empleado
                    </option>

                    {empleados.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.nombre} {e.apellido}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="owner-edit-actions">
                  <button
                    type="submit"
                    className="button button-primary"
                  >
                    {guardando ? 'Guardando…' : 'Guardar cita'}
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setForm(null)}
                  >
                    Cerrar formulario
                  </button>
                </div>
              </fieldset>
            </form>
          )}

          <h4>Solicitudes públicas del día</h4>

          {!datos.solicitudes.length ? (
            <p>No hay solicitudes para esta fecha.</p>
          ) : (
            <div className="owner-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hora / ID</th>
                    <th>Mascota</th>
                    <th>Teléfono</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {datos.solicitudes.map(s => (
                    <tr key={s.id}>
                      <td>
                        {s.hora.slice(0, 5)} · #{s.id}
                      </td>
                      <td>{s.nombre_mascota}</td>
                      <td>{s.telefono}</td>
                      <td>
                        {s.estado}
                        {s.id_cita ? ` · Cita #${s.id_cita}` : ''}
                      </td>
                      <td>
                        {!s.id_cita && [
                          'PENDIENTE',
                          'ACEPTADA',
                          'CONFIRMADA',
                        ].includes(s.estado) && (
                          <>
                            <button
                              type="button"
                              disabled={bloqueado}
                              onClick={() => confirmar(s)}
                            >
                              Confirmar
                            </button>

                            <button
                              type="button"
                              disabled={bloqueado}
                              onClick={() => {
                                if (window.confirm(
                                  `¿Rechazar la solicitud #${s.id}?`
                                )) {
                                  enviar('rechazar', { id: s.id });
                                }
                              }}
                            >
                              Rechazar
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

          <h4>Agenda del día</h4>

          <label>
            Estado
            <select
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
            >
              <option value="">Todos</option>

              {[
                'PROGRAMADA',
                'RETRASADA',
                'EN_PROCESO',
                'FINALIZADA',
                'CANCELADA',
              ].map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>

          {!citasFiltradas.length ? (
            <p>No hay citas con este filtro.</p>
          ) : (
            <div className="owner-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hora / ID</th>
                    <th>Cliente y mascota</th>
                    <th>Servicio / empleado</th>
                    <th>Estado y tiempo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {citasFiltradas.map(c => (
                    <tr key={c.id}>
                      <td>{c.hora} · #{c.id}</td>

                      <td>
                        {c.nombre_mascota || 'Sin mascota'}
                        <br />
                        {c.nombre_dueno || 'Sin cliente'}
                      </td>

                      <td>
                        {c.nombre_servicio || 'Sin servicio'}
                        <br />
                        {c.empleado || 'Sin empleado'}
                      </td>

                      <td>
                        {c.estado}
                        <br />

                        {c.hora_inicio &&
                          `Inicio: ${c.hora_inicio}`}

                        {c.hora_fin && (
                          <>
                            <br />
                            Fin: {c.hora_fin}
                          </>
                        )}

                        {c.duracion_real_minutos != null && (
                          <>
                            <br />
                            Duración: {c.duracion_real_minutos} min
                          </>
                        )}
                      </td>

                      <td>
                        {['PROGRAMADA', 'RETRASADA'].includes(
                          c.estado
                        ) && (
                          <button
                            type="button"
                            disabled={bloqueado}
                            onClick={() => setForm({
                              ...vacio(c.fecha),
                              ...c,
                            })}
                          >
                            Editar / reprogramar
                          </button>
                        )}

                        {(transiciones[c.estado] || []).map(
                          ([estado, etiqueta]) => (
                            <button
                              type="button"
                              key={estado}
                              disabled={bloqueado}
                              onClick={() => {
                                if (window.confirm(
                                  `¿${etiqueta} la cita #${c.id}?`
                                )) {
                                  enviar('estado', {
                                    id: c.id,
                                    estado,
                                  });
                                }
                              }}
                            >
                              {etiqueta}
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}