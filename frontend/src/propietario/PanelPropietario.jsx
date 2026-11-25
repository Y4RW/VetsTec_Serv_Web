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
  VETERINARIA: 'Veterinaria',
  ESTETICA: 'Estética canina',
  AMBAS: 'Veterinaria y estética',
};

const iconosTipo = {
  VETERINARIA: '🩺',
  ESTETICA: '✂️',
  AMBAS: '🐾',
};

const estadosMeta = {
  APROBADO: { label: 'Aprobada', tono: 'success' },
  PENDIENTE: { label: 'En revisión', tono: 'warning' },
  RECHAZADO: { label: 'Rechazada', tono: 'danger' },
  SUSPENDIDO: { label: 'Suspendida', tono: 'danger' },
};

const SECCIONES_SUCURSAL = [
  { id: 'resumen', label: 'Vista general', icono: '📋', soloAprobado: false },
  { id: 'citas', label: 'Citas y agenda', icono: '📅', soloAprobado: true, contadorKey: 'citas' },
  { id: 'servicios', label: 'Servicios', icono: '🩺', soloAprobado: true, contadorKey: 'servicios' },
  { id: 'productos', label: 'Productos', icono: '🛍️', soloAprobado: true, contadorKey: 'productos' },
  { id: 'personal', label: 'Personal y horarios', icono: '👩‍⚕️', soloAprobado: true, contadorKey: 'empleados' },
];

function formatearTelefono(raw) {
  const limpio = String(raw || '').replace(/\D/g, '');
  if (limpio.length === 10) {
    return `${limpio.slice(0, 2)} ${limpio.slice(2, 6)} ${limpio.slice(6)}`;
  }
  return raw || 'Sin registrar';
}

export default function PanelPropietario() {
  const { sesion, comprobarSesion } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [tabActiva, setTabActiva] = useState('resumen');
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  const [formulario, setFormulario] = useState(false);
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const solicitudes = useRef({ resumen: null });

  const limpiarProductos = useCallback(() => {
    setTabActiva('resumen');
    setMenuMovilAbierto(false);
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
        s.id === idSucursal ? { ...s, productos: cantidad } : s
      ),
    } : anterior);
  }, []);

  const actualizarTotalServicios = useCallback((idSucursal, cantidad) => {
    setDatos(anterior => anterior ? {
      ...anterior,
      sucursales: anterior.sucursales.map(s =>
        s.id === idSucursal ? { ...s, servicios: cantidad } : s
      ),
    } : anterior);
  }, []);

  const actualizarTotalEmpleados = useCallback((idSucursal, cantidad) => {
    setDatos(anterior => anterior ? {
      ...anterior,
      sucursales: anterior.sucursales.map(s =>
        s.id === idSucursal ? { ...s, empleados: cantidad } : s
      ),
    } : anterior);
  }, []);

  const actualizarTotalCitas = useCallback((idSucursal, cantidad) => {
    setDatos(anterior => anterior ? {
      ...anterior,
      sucursales: anterior.sucursales.map(s =>
        s.id === idSucursal ? { ...s, citas: cantidad } : s
      ),
    } : anterior);
  }, []);

  useEffect(() => {
    window.__vetstecSucursalActiva = seleccion || null;
  }, [seleccion]);

  useEffect(() => {
    function manejarNavegacionCopiloto(evento) {
      const destino = evento.detail?.tab;
      if (!destino || guardando) return;
      setTabActiva(destino);
      setMenuMovilAbierto(false);
      document.querySelector('.own-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener('vetstec:navegar-panel', manejarNavegacionCopiloto);
    return () => {
      window.removeEventListener('vetstec:navegar-panel', manejarNavegacionCopiloto);
    };
  }, [guardando]);

  function irASeccion(idSeccion) {
    if (guardando) return;
    setTabActiva(idSeccion);
    setMenuMovilAbierto(false);
  }

  function guardada(actualizada) {
    setGuardando(false);
    setEdicion(null);
    setAviso(actualizada.sin_cambios
      ? 'No había cambios pendientes por guardar.'
      : actualizada.requiere_revision
        ? `Los cambios de “${actualizada.nombre_establecimiento}” se guardaron. La sucursal pasó a revisión y estará oculta temporalmente en el directorio.`
        : `Se actualizaron los datos de “${actualizada.nombre_establecimiento}”.`);
    cargar(actualizada.id);
    if (sesion?.negocio?.id === actualizada.id) comprobarSesion();
  }

  function creada(nueva) {
    setGuardando(false);
    setFormulario(false);
    setAviso(`La sucursal “${nueva.nombre_establecimiento}” fue registrada y enviada a revisión.`);
    cargar(nueva.id);
  }

  const estadoSucursal = sucursal
    ? (estadosMeta[sucursal.estado] || { label: sucursal.estado, tono: 'neutral' })
    : null;
  const esAprobada = sucursal?.estado === 'APROBADO';
  const mostrarGuiaInicial = esAprobada && (
    Number(sucursal.servicios || 0) === 0 || Number(sucursal.empleados || 0) === 0
  );

  return (
    <section className="owner" aria-labelledby="owner-titulo">
      <div className="own-section-bar">
        <div className="own-section-bar-copy">
          <h2 id="owner-titulo">Gestión de sucursales</h2>
          {datos ? (
            <p>
              Red comercial: <strong>{datos.red.nombre}</strong>
              {' · '}
              {datos.sucursales.length}{' '}
              {datos.sucursales.length === 1 ? 'establecimiento vinculado' : 'establecimientos vinculados'}
            </p>
          ) : (
            <p>Administra la operación diaria, catálogo, agenda y equipo de tus sucursales.</p>
          )}
        </div>

        <div className="own-section-bar-actions">
          <button
            type="button"
            className="own-btn own-btn-secondary"
            disabled={cargando || formulario || guardando || edicion !== null}
            onClick={() => cargar(seleccion)}
          >
            {cargando ? 'Actualizando…' : '↻ Actualizar'}
          </button>
          {datos && !formulario && edicion === null && (
            <button
              type="button"
              className="own-btn own-btn-primary"
              disabled={cargando || guardando}
              onClick={() => {
                limpiarProductos();
                setAviso('');
                setFormulario(true);
              }}
            >
              + Nueva sucursal
            </button>
          )}
        </div>
      </div>

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

      {error && (
        <p role="alert" className="own-alert own-alert-danger">
          {error}{' '}
          Puedes <Link to="/contacto">contactar a VetStec</Link> para revisar tu cuenta.
        </p>
      )}

      {cargando && (
        <div className="own-loading-card" role="status">
          <span className="own-spinner" aria-hidden="true" />
          <span>Cargando información de tus sucursales…</span>
        </div>
      )}

      {datos && !cargando && (
        <>
          {edicion !== null ? (
            <EditarSucursal
              key={edicion}
              idSucursal={edicion}
              onCancelar={() => setEdicion(null)}
              onGuardada={guardada}
              onGuardando={setGuardando}
            />
          ) : formulario ? (
            <FormularioSucursal
              onCancelar={() => setFormulario(false)}
              onCreada={creada}
              onGuardando={setGuardando}
            />
          ) : (
            <>
              {datos.sucursales.length > 1 && (
                <div className="own-branch-switcher" role="region" aria-label="Seleccionar sucursal">
                  <div className="own-branch-switcher-head">
                    <span>Selecciona la sucursal que deseas administrar</span>
                  </div>
                  <div className="own-branch-strip">
                    {datos.sucursales.map(s => {
                      const meta = estadosMeta[s.estado] || { label: s.estado, tono: 'neutral' };
                      const activa = seleccion === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={guardando}
                          aria-pressed={activa}
                          className={`own-branch-pill ${activa ? 'is-selected' : ''}`}
                          onClick={() => {
                            limpiarProductos();
                            setSeleccion(s.id);
                          }}
                        >
                          <span className="own-branch-pill-icon" aria-hidden="true">
                            {iconosTipo[s.tipo_servicio] || '🏥'}
                          </span>
                          <span className="own-branch-pill-body">
                            <strong>{s.nombre_establecimiento}</strong>
                            <small>
                              {s.es_principal ? 'Principal' : 'Sucursal'} · {nombres[s.tipo_servicio] || 'Establecimiento'}
                            </small>
                          </span>
                          <span className={`own-badge own-badge-${meta.tono}`}>
                            {meta.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {sucursal ? (
                <div className="own-workspace">
                  <div className="own-workspace-header">
                    <div className="own-workspace-title">
                      <div className="own-workspace-badges">
                        <span className="own-type-chip">
                          <span aria-hidden="true">{iconosTipo[sucursal.tipo_servicio] || '🏥'}</span>
                          {nombres[sucursal.tipo_servicio] || 'Tipo no especificado'}
                        </span>
                        <span className={`own-badge own-badge-${estadoSucursal.tono}`}>
                          {estadoSucursal.label}
                        </span>
                        <span className={`own-badge ${sucursal.activo_directorio ? 'own-badge-success' : 'own-badge-neutral'}`}>
                          {sucursal.activo_directorio ? '🟢 Pública en directorio' : '⚪ Oculta en directorio'}
                        </span>
                        {sucursal.es_principal && (
                          <span className="own-badge own-badge-info">Sucursal principal</span>
                        )}
                      </div>
                      <h3>{sucursal.nombre_establecimiento}</h3>
                      {sucursal.direccion && (
                        <p className="own-workspace-address">
                          📍 {sucursal.direccion}
                          {sucursal.codigo_postal ? ` · C.P. ${sucursal.codigo_postal}` : ''}
                        </p>
                      )}
                    </div>

                    <div className="own-workspace-actions">
                      <button
                        type="button"
                        className="own-btn own-btn-secondary"
                        disabled={guardando || sucursal.estado === 'SUSPENDIDO'}
                        onClick={() => {
                          limpiarProductos();
                          setAviso('');
                          setEdicion(sucursal.id);
                        }}
                      >
                        ✎ Editar datos y ubicación
                      </button>
                    </div>
                  </div>

                  {sucursal.motivo_rechazo && (
                    <div className="own-alert own-alert-danger">
                      <div>
                        <strong>Observación de revisión:</strong> {sucursal.motivo_rechazo}
                      </div>
                    </div>
                  )}

                  {mostrarGuiaInicial && (
                    <div className="own-onboarding" aria-label="Pasos recomendados para configurar tu sucursal">
                      <div className="own-onboarding-head">
                        <strong>🚀 Deja lista tu sucursal para recibir citas en línea</strong>
                        <span>Sigue estos pasos rápidos para empezar a operar en el directorio:</span>
                      </div>
                      <div className="own-onboarding-steps">
                        <button
                          type="button"
                          className={`own-step-chip ${Number(sucursal.servicios) > 0 ? 'is-done' : ''}`}
                          onClick={() => irASeccion('servicios')}
                        >
                          <span className="own-step-num">{Number(sucursal.servicios) > 0 ? '✓' : '1'}</span>
                          <span>
                            <strong>Registrar servicios</strong>
                            <small>{Number(sucursal.servicios) > 0 ? `${sucursal.servicios} registrado(s)` : 'Agrega consultas o baños'}</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`own-step-chip ${Number(sucursal.empleados) > 0 ? 'is-done' : ''}`}
                          onClick={() => irASeccion('personal')}
                        >
                          <span className="own-step-num">{Number(sucursal.empleados) > 0 ? '✓' : '2'}</span>
                          <span>
                            <strong>Personal y horarios</strong>
                            <small>{Number(sucursal.empleados) > 0 ? `${sucursal.empleados} integrante(s)` : 'Define equipo y apertura'}</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="own-step-chip"
                          onClick={() => irASeccion('citas')}
                        >
                          <span className="own-step-num">3</span>
                          <span>
                            <strong>Publicar cupo diario</strong>
                            <small>Activa reservas en tu agenda</small>
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div
                    className="own-kpi-grid"
                    aria-label={`Indicadores operativos de ${sucursal.nombre_establecimiento}`}
                  >
                    {[
                      { id: 'citas', label: 'Citas registradas', valor: sucursal.citas, icono: '📅', sub: 'Ver agenda del día', interactivo: esAprobada },
                      { id: 'servicios', label: 'Servicios', valor: sucursal.servicios, icono: '🩺', sub: 'En catálogo activo', interactivo: esAprobada },
                      { id: 'productos', label: 'Productos', valor: sucursal.productos, icono: '🛍️', sub: 'Artículos registrados', interactivo: esAprobada },
                      { id: 'personal', label: 'Equipo de trabajo', valor: sucursal.empleados, icono: '👩‍⚕️', sub: 'Personal y horarios', interactivo: esAprobada },
                    ].map(kpi => (
                      kpi.interactivo ? (
                        <button
                          key={kpi.id}
                          type="button"
                          disabled={guardando}
                          onClick={() => irASeccion(kpi.id)}
                          className={`own-kpi-card is-interactive ${tabActiva === kpi.id ? 'is-active' : ''}`}
                        >
                          <div className="own-kpi-top">
                            <span className="own-kpi-icon" aria-hidden="true">{kpi.icono}</span>
                            <span className="own-kpi-arrow" aria-hidden="true">→</span>
                          </div>
                          <strong className="own-kpi-value">{kpi.valor ?? '—'}</strong>
                          <span className="own-kpi-label">{kpi.label}</span>
                          <small className="own-kpi-sub">{kpi.sub}</small>
                        </button>
                      ) : (
                        <div key={kpi.id} className="own-kpi-card">
                          <div className="own-kpi-top">
                            <span className="own-kpi-icon" aria-hidden="true">{kpi.icono}</span>
                          </div>
                          <strong className="own-kpi-value">{kpi.valor ?? '—'}</strong>
                          <span className="own-kpi-label">{kpi.label}</span>
                          <small className="own-kpi-sub">Requiere aprobación</small>
                        </div>
                      )
                    ))}
                  </div>

                  {(() => {
                    const seccionesDisponibles = SECCIONES_SUCURSAL.filter(
                      sec => !sec.soloAprobado || esAprobada
                    );
                    const seccionActual =
                      seccionesDisponibles.find(sec => sec.id === tabActiva) ||
                      seccionesDisponibles[0];

                    return (
                      <div className="owner-nav-wrapper">
                        {seccionesDisponibles.length > 1 && (
                          <button
                            type="button"
                            className="owner-mobile-toggle"
                            aria-expanded={menuMovilAbierto}
                            aria-controls={`owner-tabs-${sucursal.id}`}
                            disabled={guardando}
                            onClick={() => setMenuMovilAbierto(abierto => !abierto)}
                          >
                            <span className="owner-mobile-toggle-text">
                              <small>Módulo activo</small>
                              <strong>{seccionActual.icono} {seccionActual.label}</strong>
                            </span>
                            <span className="owner-mobile-toggle-icon" aria-hidden="true">
                              {menuMovilAbierto ? '✕' : '☰'}
                            </span>
                          </button>
                        )}

                        <div
                          id={`owner-tabs-${sucursal.id}`}
                          className={`owner-tabs ${menuMovilAbierto ? 'is-open' : ''}`}
                          role="tablist"
                          aria-label={`Módulos de ${sucursal.nombre_establecimiento}`}
                        >
                          {seccionesDisponibles.map(sec => {
                            const conteo = sec.contadorKey ? sucursal[sec.contadorKey] : null;
                            return (
                              <button
                                key={sec.id}
                                type="button"
                                role="tab"
                                aria-selected={tabActiva === sec.id}
                                className={`owner-tab ${tabActiva === sec.id ? 'is-active' : ''}`}
                                disabled={guardando}
                                onClick={() => irASeccion(sec.id)}
                              >
                                <span aria-hidden="true">{sec.icono}</span>
                                <span>{sec.label}</span>
                                {conteo != null && (
                                  <span className="owner-tab-count">{conteo}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="owner-tab-panel" role="tabpanel">
                    {tabActiva === 'resumen' && (
                      <div className="own-overview-grid">
                        <section className="own-info-card" aria-labelledby="info-contacto-title">
                          <div className="own-info-card-head">
                            <h4 id="info-contacto-title">Ficha y datos de contacto</h4>
                            {sucursal.estado !== 'SUSPENDIDO' && (
                              <button
                                type="button"
                                className="own-link-btn"
                                disabled={guardando}
                                onClick={() => {
                                  setAviso('');
                                  setEdicion(sucursal.id);
                                }}
                              >
                                Editar ficha
                              </button>
                            )}
                          </div>

                          <dl className="own-detail-list">
                            <div>
                              <dt>Teléfono / WhatsApp</dt>
                              <dd>{formatearTelefono(sucursal.telefono_whatsapp)}</dd>
                            </div>
                            <div>
                              <dt>Correo de atención</dt>
                              <dd>{sucursal.correo_contacto || 'Sin correo registrado'}</dd>
                            </div>
                            <div>
                              <dt>Categoría de atención</dt>
                              <dd>{nombres[sucursal.tipo_servicio] || 'Sin especificar'}</dd>
                            </div>
                            <div>
                              <dt>Identificador interno</dt>
                              <dd>Sucursal #{sucursal.id}</dd>
                            </div>
                          </dl>

                          <div className="own-description-box">
                            <span className="own-description-label">Descripción pública</span>
                            <p className="owner-description">
                              {sucursal.descripcion || 'Aún no has agregado una descripción para presentar tu establecimiento en el directorio.'}
                            </p>
                          </div>
                        </section>

                        <section className="own-info-card" aria-labelledby="info-ubicacion-title">
                          <div className="own-info-card-head">
                            <h4 id="info-ubicacion-title">Ubicación y visibilidad</h4>
                          </div>

                          <dl className="own-detail-list">
                            <div>
                              <dt>Estado en el directorio</dt>
                              <dd>
                                {sucursal.activo_directorio
                                  ? 'Visible para clientes en el directorio público'
                                  : 'No visible actualmente en el directorio'}
                              </dd>
                            </div>
                            <div>
                              <dt>Dirección registrada</dt>
                              <dd>{sucursal.direccion || 'Sin dirección registrada'}</dd>
                            </div>
                            <div>
                              <dt>Código postal</dt>
                              <dd>{sucursal.codigo_postal || '—'}</dd>
                            </div>
                            <div>
                              <dt>Punto en el mapa</dt>
                              <dd>
                                {sucursal.latitud != null && sucursal.longitud != null
                                  ? `Confirmado (${Number(sucursal.latitud).toFixed(5)}, ${Number(sucursal.longitud).toFixed(5)})`
                                  : 'Pendiente de confirmar en el mapa'}
                              </dd>
                            </div>
                          </dl>

                          <div className="own-secondary-stats">
                            <div>
                              <span>Proveedores vinculados</span>
                              <strong>{sucursal.proveedores ?? 0}</strong>
                            </div>
                            <div>
                              <span>Ventas históricas</span>
                              <strong>{sucursal.ventas ?? 0}</strong>
                            </div>
                          </div>
                        </section>

                        {!esAprobada && (
                          <div className="own-info-banner own-grid-span-full">
                            <strong>⏳ Funciones operativas en espera de aprobación</strong>
                            <p>
                              Una vez que VetStec apruebe la verificación de esta sucursal, se habilitarán las pestañas de{' '}
                              <strong>Citas y agenda</strong>, <strong>Servicios</strong>, <strong>Productos</strong> y{' '}
                              <strong>Personal y horarios</strong>.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {esAprobada && tabActiva === 'citas' && (
                      <CitasSucursal
                        key={`citas-${sucursal.id}`}
                        idSucursal={sucursal.id}
                        onTotal={actualizarTotalCitas}
                        onGuardando={setGuardando}
                      />
                    )}

                    {esAprobada && tabActiva === 'servicios' && (
                      <ServiciosSucursal
                        key={`servicios-${sucursal.id}`}
                        idSucursal={sucursal.id}
                        onTotal={actualizarTotalServicios}
                        onGuardando={setGuardando}
                      />
                    )}

                    {esAprobada && tabActiva === 'productos' && (
                      <ProductosSucursal
                        key={`productos-${sucursal.id}`}
                        idSucursal={sucursal.id}
                        onTotal={actualizarTotalProductos}
                        onGuardando={setGuardando}
                      />
                    )}

                    {esAprobada && tabActiva === 'personal' && (
                      <PersonalSucursal
                        key={`personal-${sucursal.id}`}
                        idSucursal={sucursal.id}
                        onTotal={actualizarTotalEmpleados}
                        onGuardando={setGuardando}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="own-empty-state">
                  <p>Selecciona una sucursal para consultar y administrar su operación.</p>
                </div>
              )}
            </>
          )}

          <div className="own-help-strip">
            <p>
              ¿Tu clínica o estética ya aparece en VetStec y deseas vincularla a tu cuenta?{' '}
              Cada sucursal nueva o reclamada pasa por validación de titularidad.
            </p>
            <Link className="own-link-btn" to="/contacto">
              Solicitar vinculación de establecimiento →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}