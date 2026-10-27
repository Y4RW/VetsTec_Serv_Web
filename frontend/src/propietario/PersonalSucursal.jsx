import { useCallback, useEffect, useRef, useState } from 'react';

const dias = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles',
  'Jueves', 'Viernes', 'Sábado',
];

const tipos = [
  ['VETERINARIO', 'Veterinario'],
  ['ESTILISTA', 'Estilista'],
  ['AMBO', 'Ambos'],
  ['ADMINISTRATIVO', 'Administrativo'],
];

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
      setAviso('Cambios guardados.');
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

  const ocupado = cargando || guardando;
  const filtro = busqueda.trim().toLowerCase();
  const lista = (datos?.empleados || []).filter(e =>
    `${e.nombre} ${e.apellido} ${e.correo}`.toLowerCase().includes(filtro)
  );

  return (
    <section className="owner-products">
      <h4>Empleados y horario de atención</h4>

      {error && <p className="owner-error" role="alert">{error}</p>}
      {aviso && <p className="owner-success" role="status">{aviso}</p>}

      {bloqueado && (
        <p>
          Recarga antes de reintentar. Copia cualquier cambio que quieras
          conservar: la recarga reemplazará los formularios.
        </p>
      )}

      <button
        type="button"
        className="button button-secondary"
        disabled={ocupado}
        onClick={() => {
          if (
            datos &&
            !window.confirm('Recargar reemplazará los formularios. ¿Continuar?')
          ) return;

          cargar();
        }}
      >
        Recargar datos
      </button>

      {cargando && <p role="status">Cargando personal y horarios…</p>}

      {datos && !cargando && (
        <>
          <p>
            Registrados: {datos.empleados.length}.
            {' '}Activos: {datos.empleados.filter(e => e.activo === true).length}.
          </p>

          <label className="form-field">
            <span>Buscar empleado</span>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </label>

          <button
            type="button"
            className="button button-primary"
            disabled={ocupado || bloqueado || Boolean(empleado)}
            onClick={() => setEmpleado({
              nombre: '',
              apellido: '',
              correo: '',
              telefono: '',
              tipo_personal: 'ADMINISTRATIVO',
              activo: true,
            })}
          >
            Agregar empleado
          </button>

          {empleado && (
            <form
              className="register-card"
              onSubmit={e => {
                e.preventDefault();
                guardar('empleado', empleado);
              }}
            >
              <fieldset
                className="owner-edit-fields"
                disabled={ocupado || bloqueado}
              >
                <legend>
                  {empleado.id ? 'Editar empleado' : 'Nuevo empleado'}
                </legend>

                <div className="register-form-grid">
                  {[
                    ['nombre', 'Nombre', 'text', 100],
                    ['apellido', 'Apellido', 'text', 100],
                    ['correo', 'Correo', 'email', 150],
                    ['telefono', 'Teléfono (opcional)', 'tel', 20],
                  ].map(([campo, etiqueta, tipo, maximo]) => (
                    <label className="form-field" key={campo}>
                      <span>{etiqueta}</span>
                      <input
                        type={tipo}
                        required={campo !== 'telefono'}
                        maxLength={maximo}
                        value={empleado[campo]}
                        onChange={e => setEmpleado(a => ({
                          ...a,
                          [campo]: e.target.value,
                        }))}
                      />
                    </label>
                  ))}

                  <label className="form-field">
                    <span>Tipo de personal</span>
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

                  <label>
                    <input
                      type="checkbox"
                      checked={empleado.activo}
                      onChange={e => setEmpleado(a => ({
                        ...a,
                        activo: e.target.checked,
                      }))}
                    />
                    Empleado activo
                  </label>
                </div>

                <p>
                  Este registro no crea una cuenta de acceso.
                  Los roles existentes no se modifican.
                </p>

                <button type="submit" className="button button-primary">
                  Guardar empleado
                </button>
              </fieldset>

              <button
                type="button"
                disabled={ocupado}
                onClick={() => setEmpleado(null)}
              >
                Cancelar edición
              </button>
            </form>
          )}

          <div className="owner-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Correo</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(e => (
                  <tr key={e.id}>
                    <td>{e.nombre} {e.apellido}</td>
                    <td>{e.correo}</td>
                    <td>{e.tipo_personal}</td>
                    <td>{e.activo === true ? 'Activo' : 'Inactivo'}</td>
                    <td>
                      <button
                        type="button"
                        disabled={ocupado || bloqueado || Boolean(empleado)}
                        onClick={() => editar(e)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lista.length === 0 && <p>No hay empleados para esta búsqueda.</p>}

          <form onSubmit={e => {
            e.preventDefault();
            guardar('horarios', horarios);
          }}>
            <fieldset
              className="owner-edit-fields"
              disabled={ocupado || bloqueado || Boolean(empleado)}
            >
              <legend>Horario semanal de la sucursal</legend>
              <p>
                Horas locales de atención. Cada día admite un periodo
                dentro del mismo día. Esto no asigna jornadas a empleados.
              </p>

              {horarios.map((h, i) => (
                <div className="owner-edit-actions" key={h.dia_semana}>
                  <strong>{dias[h.dia_semana]}</strong>

                  <label>
                    <input
                      type="checkbox"
                      checked={h.cerrado}
                      onChange={e => setHorarios(anterior =>
                        anterior.map((d, j) =>
                          j === i ? { ...d, cerrado: e.target.checked } : d
                        )
                      )}
                    />
                    Cerrado
                  </label>

                  <label className="form-field">
                    <span>Apertura</span>
                    <input
                      type="time"
                      required={!h.cerrado}
                      disabled={h.cerrado}
                      value={h.hora_apertura}
                      onChange={e => setHorarios(anterior =>
                        anterior.map((d, j) =>
                          j === i ? { ...d, hora_apertura: e.target.value } : d
                        )
                      )}
                    />
                  </label>

                  <label className="form-field">
                    <span>Cierre</span>
                    <input
                      type="time"
                      required={!h.cerrado}
                      disabled={h.cerrado}
                      value={h.hora_cierre}
                      onChange={e => setHorarios(anterior =>
                        anterior.map((d, j) =>
                          j === i ? { ...d, hora_cierre: e.target.value } : d
                        )
                      )}
                    />
                  </label>
                </div>
              ))}

              <button type="submit" className="button button-primary">
                Guardar horario semanal
              </button>
            </fieldset>
          </form>
        </>
      )}
    </section>
  );
}