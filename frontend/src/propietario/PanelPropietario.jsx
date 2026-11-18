import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FormularioSucursal from './FormularioSucursal';
import EditarSucursal from './EditarSucursal';
import ProductosSucursal from './ProductosSucursal';
import ServiciosSucursal from './ServiciosSucursal';
import PersonalSucursal from './PersonalSucursal';
import CitasSucursal from './CitasSucursal';
import './propietario.css';

async function pedir(ruta, signal) {
  const respuesta = await fetch(`/api/propietario/${ruta}`, {
    credentials: 'same-origin', cache: 'no-store', signal,
  });
  signal.throwIfAborted();
  if (respuesta.status === 401) {
    window.dispatchEvent(new Event('vetstec:sesion-vencida'));
  }
  const json = await respuesta.json().catch(() => null);
  signal.throwIfAborted();
  if (!respuesta.ok || json?.success !== true) {
    throw new Error(json?.message || 'No fue posible consultar la información.');
  }
  return json.data;
}

const nombres = {
  VETERINARIA: 'Veterinaria', ESTETICA: 'Estética canina', AMBAS: 'Veterinaria y estética',
};

export default function PanelPropietario() {
  const { sesion, comprobarSesion } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [tabActiva, setTabActiva] = useState('resumen');

  const [formulario, setFormulario] = useState(false);
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const solicitudes = useRef({ resumen: null });

  const limpiarProductos = useCallback(() => {
    setTabActiva('resumen');
  }, []);

  const cargar = useCallback(async (idPreferido = null) => {
    solicitudes.current.resumen?.abort();
    const controller = new AbortController();
    solicitudes.current.resumen = controller;
    limpiarProductos();
    setCargando(true);
    setError('');
    try {
            const respuesta = await pedir('resumen', controller.signal);
      if (solicitudes.current.resumen !== controller) return;
      setDatos(respuesta);
      setSeleccion(anterior => {
        const preferida = idPreferido ?? anterior;
        return respuesta.sucursales.some(s => s.id === preferida)
          ? preferida : (respuesta.sucursales[0]?.id || null);
      });
    } catch (fallo) {
      if (controller.signal.aborted || solicitudes.current.resumen !== controller) return;
      setDatos(null);
      setError(fallo.message);
    } finally {
      if (!controller.signal.aborted && solicitudes.current.resumen === controller) setCargando(false);
    }
  }, [sesion?.usuario?.id, limpiarProductos]);

  useEffect(() => {
    cargar();
    return () => {
      solicitudes.current.resumen?.abort();
    };
  }, [cargar]);

  const sucursal = datos?.sucursales?.find(s => s.id === seleccion);

  const actualizarTotalProductos = useCallback((idSucursal, cantidad) => {
    setDatos(anterior => anterior ? {
      ...anterior,
      sucursales: anterior.sucursales.map(s =>
        s.id === idSucursal
          ? { ...s, productos: cantidad }
          : s
      ),
    } : anterior);
  }, []);

  const actualizarTotalServicios = useCallback((idSucursal, cantidad) => {
    setDatos(anterior => anterior ? {
      ...anterior,
      sucursales: anterior.sucursales.map(s =>
        s.id === idSucursal
          ? { ...s, servicios: cantidad }
          : s
      ),
    } : anterior);
  }, []);

  const actualizarTotalEmpleados = useCallback((idSucursal, cantidad) => {
    setDatos(anterior => anterior ? {
      ...anterior,
      sucursales: anterior.sucursales.map(s =>
        s.id === idSucursal
          ? { ...s, empleados: cantidad }
          : s
      ),
    } : anterior);
  }, []);

  const actualizarTotalCitas = useCallback(
    (idSucursal, cantidad) => {
      setDatos(anterior => anterior ? {
        ...anterior,
        sucursales: anterior.sucursales.map(s =>
          s.id === idSucursal
            ? { ...s, citas: cantidad }
            : s
        ),
      } : anterior);
    },
    []
  );

  function guardada(actualizada) {
    setGuardando(false);
    setEdicion(null);
    setAviso(actualizada.sin_cambios ? 'No había cambios por guardar.' : actualizada.requiere_revision
      ? `Los cambios de “${actualizada.nombre_establecimiento}” se guardaron. La sucursal está pendiente de revisión y no es visible en el directorio.`
      : `Se guardaron los cambios de “${actualizada.nombre_establecimiento}”.`);
    cargar(actualizada.id);
    if (sesion?.negocio?.id === actualizada.id) comprobarSesion();
  }

  function creada(nueva) {
    setGuardando(false);
    setFormulario(false);
    setAviso(`La sucursal “${nueva.nombre_establecimiento}” se registró y está pendiente de revisión.`);
    cargar(nueva.id);
  }

  return (
    <section className="owner" aria-labelledby="owner-titulo">
      <div className="owner-heading">
        <div>
          <p className="owner-kicker">Administración del propietario</p>
          <h2 id="owner-titulo">Mis sucursales</h2>
          <p>Vista general de los establecimientos que pertenecen a tu cuenta.</p>
        </div>
        <div className="owner-actions">
          <button type="button" className="button button-secondary"
            disabled={cargando || formulario || guardando || edicion !== null} onClick={() => cargar()}>
            {cargando ? 'Actualizando…' : 'Actualizar datos'}
          </button>
          {datos && !formulario && edicion === null && <button type="button" className="button button-primary"
            disabled={cargando || guardando} onClick={() => { limpiarProductos(); setAviso(''); setFormulario(true); }}>
            Agregar sucursal
          </button>}
        </div>
      </div>

      {aviso && <p role="status" className="owner-success">{aviso}</p>}
      {error && <p role="alert" className="owner-error">
        {error} Puedes <Link to="/contacto">contactar a VetStec</Link> para revisar la propiedad.
      </p>}
      {cargando && <p role="status">Cargando sucursales…</p>}

      {datos && !cargando && <>
        <div className="owner-network">
          <strong>Grupo: {datos.red.nombre}</strong>
          <span>{datos.sucursales.length} sucursal(es) vinculada(s)</span>
        </div>

        {!formulario && edicion === null && sucursal && (
          <section aria-labelledby="owner-resumen-sucursal">
            <h3 id="owner-resumen-sucursal">
              Resumen de la sucursal: {sucursal.nombre_establecimiento}
            </h3>

            <p className="owner-note">
              Estos contadores corresponden únicamente a la sucursal
              seleccionada, con identificador {sucursal.id}.
              Productos indica registros de productos, no unidades en existencia.
              Citas y ventas muestran todos los registros, sin filtro de fecha.
            </p>

            <div
              className="owner-kpis"
              aria-label={`Contadores de la sucursal ${sucursal.id}`}
            >
              {[
                ['Empleados', sucursal.empleados],
                ['Servicios', sucursal.servicios],
                ['Productos', sucursal.productos],
                ['Proveedores', sucursal.proveedores],
                ['Citas registradas', sucursal.citas],
                ['Ventas registradas', sucursal.ventas],
              ].map(([nombre, valor]) => (
                <div className="owner-kpi" key={nombre}>
                  <span>{nombre}</span>
                  <strong>{valor ?? '—'}</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {edicion !== null ? (
          <EditarSucursal key={edicion} idSucursal={edicion}
            onCancelar={() => setEdicion(null)} onGuardada={guardada} onGuardando={setGuardando} />
        ) : formulario ? (
          <FormularioSucursal onCancelar={() => setFormulario(false)}
            onCreada={creada} onGuardando={setGuardando} />
        ) : <div className="owner-main">
          <div className="owner-branch-list" aria-label="Seleccionar sucursal">
            <h3>Establecimientos</h3>
            {datos.sucursales.map(s => <button key={s.id}
              disabled={guardando}
              aria-pressed={seleccion === s.id}
              className={`owner-branch ${seleccion === s.id ? 'selected' : ''}`}
              onClick={() => { limpiarProductos(); setSeleccion(s.id); }}>
              <span><strong>{s.nombre_establecimiento}</strong>
                <small>{s.es_principal ? 'Sucursal principal' : 'Sucursal adicional'}</small></span>
              <span className="owner-state">{s.estado}</span>
            </button>)}
          </div>
          <div className="owner-detail">
            {sucursal ? <>
              <div className="owner-detail-header">
                <div>
                  <h3>{sucursal.nombre_establecimiento}</h3>
                  <p>{nombres[sucursal.tipo_servicio] || 'Tipo no especificado'}</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={guardando || sucursal.estado === 'SUSPENDIDO'}
                  onClick={() => { limpiarProductos(); setAviso(''); setEdicion(sucursal.id); }}
                >
                  Editar datos y mapa
                </button>
              </div>

              {sucursal.motivo_rechazo && (
                <p className="owner-error">
                  <strong>Motivo del rechazo:</strong> {sucursal.motivo_rechazo}
                </p>
              )}

              <div
                className="owner-tabs"
                role="tablist"
                aria-label={`Gestión de ${sucursal.nombre_establecimiento}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabActiva === 'resumen'}
                  className={`owner-tab ${tabActiva === 'resumen' ? 'is-active' : ''}`}
                  disabled={guardando}
                  onClick={() => setTabActiva('resumen')}
                >
                  📋 Datos generales
                </button>

                {sucursal.estado === 'APROBADO' && (
                  <>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tabActiva === 'citas'}
                      className={`owner-tab ${tabActiva === 'citas' ? 'is-active' : ''}`}
                      disabled={guardando}
                      onClick={() => setTabActiva('citas')}
                    >
                      📅 Citas
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={tabActiva === 'servicios'}
                      className={`owner-tab ${tabActiva === 'servicios' ? 'is-active' : ''}`}
                      disabled={guardando}
                      onClick={() => setTabActiva('servicios')}
                    >
                      🩺 Servicios
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={tabActiva === 'productos'}
                      className={`owner-tab ${tabActiva === 'productos' ? 'is-active' : ''}`}
                      disabled={guardando}
                      onClick={() => setTabActiva('productos')}
                    >
                      🛍️ Productos
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={tabActiva === 'personal'}
                      className={`owner-tab ${tabActiva === 'personal' ? 'is-active' : ''}`}
                      disabled={guardando}
                      onClick={() => setTabActiva('personal')}
                    >
                      👩‍⚕️ Empleados y horarios
                    </button>
                  </>
                )}
              </div>

              <div className="owner-tab-panel" role="tabpanel">
                {tabActiva === 'resumen' && (
                  <>
                    <dl className="owner-facts">
                      <div><dt>Identificador</dt><dd>{sucursal.id}</dd></div>
                      <div><dt>Revisión</dt><dd>{sucursal.estado}</dd></div>
                      <div><dt>Directorio público</dt><dd>{sucursal.activo_directorio ? 'Visible' : 'No visible'}</dd></div>
                      <div><dt>Teléfono / WhatsApp</dt><dd>{sucursal.telefono_whatsapp || 'Sin dato'}</dd></div>
                      <div><dt>Correo de contacto</dt><dd>{sucursal.correo_contacto || 'Sin dato'}</dd></div>
                      <div><dt>Dirección</dt><dd>{sucursal.direccion || 'Sin dato'}</dd></div>
                      <div><dt>Código postal</dt><dd>{sucursal.codigo_postal || 'Sin dato'}</dd></div>
                      <div><dt>Ubicación</dt><dd>{sucursal.latitud ?? '—'}, {sucursal.longitud ?? '—'}</dd></div>
                    </dl>
                    <p className="owner-description">{sucursal.descripcion || 'Sin descripción.'}</p>
                    {sucursal.estado !== 'APROBADO' && (
                      <p className="owner-note">Esta sucursal requiere aprobación antes de operar servicios, productos, personal o citas.</p>
                    )}
                  </>
                )}

                {sucursal.estado === 'APROBADO' && tabActiva === 'citas' && (
                  <CitasSucursal
                    key={`citas-${sucursal.id}`}
                    idSucursal={sucursal.id}
                    onTotal={actualizarTotalCitas}
                    onGuardando={setGuardando}
                  />
                )}

                {sucursal.estado === 'APROBADO' && tabActiva === 'servicios' && (
                  <ServiciosSucursal
                    key={`servicios-${sucursal.id}`}
                    idSucursal={sucursal.id}
                    onTotal={actualizarTotalServicios}
                    onGuardando={setGuardando}
                  />
                )}

                {sucursal.estado === 'APROBADO' && tabActiva === 'productos' && (
                  <ProductosSucursal
                    key={`productos-${sucursal.id}`}
                    idSucursal={sucursal.id}
                    onTotal={actualizarTotalProductos}
                    onGuardando={setGuardando}
                  />
                )}

                {sucursal.estado === 'APROBADO' && tabActiva === 'personal' && (
                  <PersonalSucursal
                    key={`personal-${sucursal.id}`}
                    idSucursal={sucursal.id}
                    onTotal={actualizarTotalEmpleados}
                    onGuardando={setGuardando}
                  />
                )}
              </div>
            </> : <p>Selecciona una sucursal para ver su información.</p>}
          </div>
        </div>}
        <p className="owner-note">Cada nueva sucursal pasa por la revisión de VetStec.
          Para vincular un establecimiento que ya está registrado, solicita la revisión de su titularidad.</p>
        <Link to="/contacto">Solicitar vinculación de un establecimiento existente</Link>
      </>}
    </section>
  );
}