import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './solicitudes.css';

const estados = { PENDIENTE: 'Pendiente', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado', SUSPENDIDO: 'Suspendido', TODAS: 'Todas' };
const tipos = { ESTETICA: 'Estética canina', VETERINARIA: 'Veterinaria', AMBAS: 'Veterinaria y estética' };
const fecha = valor => valor ? new Date(valor).toLocaleString('es-MX') : 'Sin revisión';
const Estado = ({ valor }) => <span className={`revision-estado revision-${valor.toLowerCase()}`}>{estados[valor] || valor}</span>;

function Evidencia({ id, solicitar, alCambiar }) {
  const [imagen, setImagen] = useState('');
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vigente = true, url;
    setImagen(''); setError(''); alCambiar(false);
    solicitar(`/${id}/evidencia`, { imagen: true }).then(blob => {
      if (vigente) { url = URL.createObjectURL(blob); setImagen(url); }
    }).catch(fallo => { if (vigente) setError(fallo.message); });
    return () => { vigente = false; if (url) URL.revokeObjectURL(url); };
  }, [id, intento, solicitar, alCambiar]);
  return <div className="revision-evidencia">
    {imagen && <img src={imagen} alt="Fotografía aportada por el establecimiento para su revisión"
      onLoad={() => alCambiar(true)} onError={() => { setError('La imagen no se pudo mostrar.'); alCambiar(false); }} />}
    {!imagen && !error && <p role="status">Cargando fotografía privada…</p>}
    {error && <><p className="admin-error" role="alert">{error}</p>
      <button className="button button-secondary" onClick={() => setIntento(n => n + 1)}>Reintentar fotografía</button></>}
  </div>;
}

function Detalle({ id, solicitar, alDecidir, volver }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [accion, setAccion] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [confirmada, setConfirmada] = useState(false);
  const [fotoLista, setFotoLista] = useState(false);
  const revision = useRef(0), bloqueado = useRef(false);
  async function cargar() {
    const actual = ++revision.current;
    setCargando(true); setError(''); setConfirmada(false); setAccion('');
    try {
      const resultado = await solicitar(`/${id}`);
      if (actual === revision.current) setDatos(resultado);
    } catch (fallo) { if (actual === revision.current) { setDatos(null); setError(fallo.message); } }
    finally { if (actual === revision.current) setCargando(false); }
  }
  useEffect(() => {
    cargar();
    return () => { revision.current += 1; };
    // El padre monta un detalle nuevo al cambiar de solicitud.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, solicitar]);

  async function decidir(event) {
    event.preventDefault();
    if (bloqueado.current) return;
    bloqueado.current = true; setEnviando(true); setError(''); setAviso('');
    try {
      const resultado = await solicitar(`/${id}/decision`, { method: 'POST', datos: {
        decision: accion, motivo, observaciones, revisionConfirmada: confirmada,
        versionRevision: datos.version_revision,
      } });
      setAviso(resultado.estado === 'APROBADO' ? 'Aprobación guardada. El establecimiento ya puede aparecer en el directorio.' : 'Rechazo guardado. El motivo está disponible en el panel del establecimiento.');
      setAccion(''); setMotivo(''); setObservaciones('');
      alDecidir();
      await cargar();
    } catch (fallo) {
      // Si se perdió la respuesta, el servidor pudo haber confirmado la transacción.
      // Volver a leer antes de decidir evita anunciar un resultado que no conocemos.
      setAccion(''); setConfirmada(false); setDatos(null);
      setError(fallo.message + ' Pulsa Actualizar detalle para comprobar el estado antes de volver a decidir.');
    } finally { bloqueado.current = false; setEnviando(false); }
  }
  const puedeAprobar = datos?.correo_verificado &&
    (datos.tipo_servicio !== 'ESTETICA' || (datos.tiene_evidencia && fotoLista)) &&
    (!['VETERINARIA', 'AMBAS'].includes(datos.tipo_servicio) || (datos.nombre_responsable?.trim() && datos.cedula_profesional?.trim()));
  return <section className="admin-card revision-detalle" aria-labelledby="revision-detalle-titulo" aria-busy={cargando || enviando}>
    <div className="revision-barra">
      <h2 id="revision-detalle-titulo">Detalle de la solicitud #{id}</h2>
      <button className="button button-secondary" onClick={volver} disabled={enviando}>Cerrar detalle</button>
    </div>
    <button className="button button-secondary" onClick={cargar} disabled={enviando || cargando}>Actualizar detalle</button>
    {aviso && <p className="admin-notice" role="status">{aviso}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {cargando && <p role="status">Cargando solicitud…</p>}
    {!cargando && datos && <>
      <div className="revision-barra"><h3>{datos.nombre_establecimiento}</h3><Estado valor={datos.estado} /></div>
      <dl className="revision-datos">
        {[
          ['Servicio', tipos[datos.tipo_servicio] || datos.tipo_servicio],
          ['Dirección', datos.direccion], ['Código postal', datos.codigo_postal],
          ['WhatsApp', datos.telefono_whatsapp], ['Correo público de contacto', datos.correo_contacto],
          ['Responsable veterinario', datos.nombre_responsable || 'No indicado; obligatorio para veterinaria o servicio mixto'],
          ['Cédula profesional', datos.cedula_profesional || 'No corresponde o no fue indicada'],
          ['Ubicación', `${datos.latitud ?? '—'}, ${datos.longitud ?? '—'}`],
          ['Solicitud recibida', fecha(datos.fecha_solicitud)], ['Última revisión', fecha(datos.fecha_revision)],
          ['Directorio', datos.activo_directorio && datos.estado === 'APROBADO' && datos.correo_verificado ? 'Publicado' : 'No publicado'],
        ].map(([titulo, valor]) => <div key={titulo}><dt>{titulo}</dt><dd>{valor || 'Sin dato'}</dd></div>)}
      </dl>
      <h3>Descripción</h3><p className="revision-texto">{datos.descripcion || 'Sin descripción.'}</p>
      <h3>Cuenta del establecimiento</h3>
      {datos.cuentas.length ? datos.cuentas.map(cuenta => <p key={cuenta.correo} className="revision-texto">
        {cuenta.correo} · {cuenta.correo_verificado ? 'Correo verificado' : 'Correo sin verificar'} · {cuenta.activo ? 'Cuenta activa' : 'Cuenta inactiva'}
      </p>) : <p>No hay una cuenta asociada.</p>}
      <h3>Evidencia de registro</h3>
      {datos.tiene_evidencia ? <Evidencia id={id} solicitar={solicitar} alCambiar={setFotoLista} /> :
        <p>Sin fotografía adjunta. El registro de veterinaria o servicio mixto solicita nombre del responsable y cédula.</p>}
      {datos.motivo_rechazo && <p className="admin-notice"><strong>Motivo del rechazo:</strong> {datos.motivo_rechazo}</p>}
      {datos.estado === 'PENDIENTE' && <div className="revision-decision">
        <h3>Resolver solicitud</h3>
        {!datos.correo_verificado && <p className="admin-notice">Antes de aprobar, el establecimiento debe verificar su correo. Después pulsa Actualizar detalle.</p>}
        {datos.tipo_servicio === 'ESTETICA' && !fotoLista && <p>Para aprobar una estética, primero debe cargarse su fotografía.</p>}
        {['VETERINARIA', 'AMBAS'].includes(datos.tipo_servicio) && <p>Revisa el responsable y su cédula antes de aprobar. El sistema no comprueba automáticamente su autenticidad.</p>}
        <div className="revision-barra">
          <button className="button button-primary" disabled={!puedeAprobar || enviando} onClick={() => { setAccion('APROBADO'); setConfirmada(false); }}>Aprobar establecimiento</button>
          <button className="button button-secondary" disabled={enviando} onClick={() => { setAccion('RECHAZADO'); setConfirmada(false); }}>Rechazar solicitud</button>
        </div>
        {accion && <form className="revision-form" onSubmit={decidir}>
          <h4>{accion === 'APROBADO' ? 'Confirmar aprobación y publicación' : 'Confirmar rechazo'}</h4>
          {accion === 'RECHAZADO' && <label>Motivo del rechazo (lo verá el establecimiento)
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} minLength={10} maxLength={2000} required disabled={enviando} rows={3} />
          </label>}
          <label>Observaciones internas (opcional)
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} maxLength={2000} disabled={enviando} rows={3} />
          </label>
          {accion === 'APROBADO' && <label className="revision-confirmar">
            <input type="checkbox" required checked={confirmada} onChange={e => setConfirmada(e.target.checked)} disabled={enviando} />
            Revisé los datos y los requisitos. Confirmo que este establecimiento puede publicarse en el directorio.
          </label>}
          <div className="revision-barra">
            <button className="button button-primary" disabled={enviando || (accion === 'APROBADO' && (!confirmada || !puedeAprobar)) || (accion === 'RECHAZADO' && motivo.trim().length < 10)}>
              {enviando ? 'Guardando…' : accion === 'APROBADO' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
            </button>
            <button type="button" className="button button-secondary" disabled={enviando} onClick={() => setAccion('')}>Cancelar</button>
          </div>
        </form>}
      </div>}
      {datos.estado === 'APROBADO' && <p><Link to="/directorio" target="_blank" rel="noopener noreferrer">Abrir directorio en otra pestaña</Link> y buscar “{datos.nombre_establecimiento}”.</p>}
      <h3>Historial de revisión</h3>
      {datos.historial.length === 0 ? <p>Todavía no hay decisiones registradas desde esta etapa.</p> :
        <ol className="revision-historial">{datos.historial.map(item => <li key={item.id}>
          <strong>{estados[item.estado_nuevo]}</strong> · {item.administrador} · {fecha(item.fecha)}
          {item.motivo && <p>Motivo: {item.motivo}</p>}
          {item.observaciones && <p>Observaciones internas: {item.observaciones}</p>}
        </li>)}</ol>}
    </>}
  </section>;
}

export default function SolicitudesAdmin({ solicitar }) {
  const [estado, setEstado] = useState('PENDIENTE');
  const [texto, setTexto] = useState('');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(1);
  const [cambio, setCambio] = useState(0);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState(null);
  const detalleRef = useRef(null);
  useEffect(() => {
    let vigente = true;
    setCargando(true); setError('');
    const filtros = new URLSearchParams({ estado, buscar, pagina: String(pagina) });
    solicitar(`?${filtros}`).then(datos => {
      if (!vigente) return;
      if (datos.total > 0 && !datos.solicitudes.length && pagina > 1) setPagina(Math.max(1, Math.ceil(datos.total / datos.limite)));
      else { setLista(datos); if (!datos.total && pagina !== 1) setPagina(1); }
    }).catch(fallo => { if (vigente) { setLista(null); setError(fallo.message); } })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [estado, buscar, pagina, cambio, solicitar]);
  useEffect(() => { if (seleccionado) detalleRef.current?.focus(); }, [seleccionado]);
  return <div className="revision-modulo">
    <section className="admin-card" aria-labelledby="revision-lista-titulo">
      <div className="revision-barra"><div><h2 id="revision-lista-titulo">Solicitudes de establecimientos</h2>
        <p>Revisa el registro y decide si puede aparecer en el directorio.</p></div>
        <button className="button button-secondary" onClick={() => setCambio(n => n + 1)} disabled={cargando}>Actualizar lista</button>
      </div>
      <form className="revision-filtros" onSubmit={e => { e.preventDefault(); setPagina(1); setBuscar(texto.trim()); setCambio(n => n + 1); }}>
        <label>Estado<select aria-label="Estado" value={estado} onChange={e => { setEstado(e.target.value); setPagina(1); }}>
          {Object.entries(estados).map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}
        </select></label>
        <label>Nombre o código postal<input type="search" value={texto} onChange={e => setTexto(e.target.value)} maxLength={100} /></label>
        <button className="button button-secondary">Buscar</button>
      </form>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {cargando ? <p role="status">Cargando solicitudes…</p> : lista && <>
        <p role="status">{lista.total} solicitud(es) encontradas.</p>
        {!lista.solicitudes.length && <p>No hay solicitudes con estos filtros.</p>}
        <ul className="revision-lista">{lista.solicitudes.map(item => <li key={item.id}>
          <div><strong>{item.nombre_establecimiento}</strong><p>#{item.id} · {tipos[item.tipo_servicio]} · CP {item.codigo_postal}</p>
            <small>{item.correo_verificado ? 'Correo verificado' : 'Correo sin verificar'}</small></div>
          <Estado valor={item.estado} />
          <button className="button button-secondary" aria-label={`Revisar ${item.nombre_establecimiento}`} onClick={() => setSeleccionado(item.id)}>Revisar</button>
        </li>)}</ul>
        {lista.total > lista.limite && <nav className="revision-barra" aria-label="Páginas de solicitudes">
          <button className="button button-secondary" disabled={pagina === 1} onClick={() => setPagina(n => n - 1)}>Anterior</button>
          <span>Página {pagina} de {Math.ceil(lista.total / lista.limite)}</span>
          <button className="button button-secondary" disabled={pagina * lista.limite >= lista.total} onClick={() => setPagina(n => n + 1)}>Siguiente</button>
        </nav>}
      </>}
    </section>
    {seleccionado && <div ref={detalleRef} tabIndex={-1}>
      <Detalle key={seleccionado} id={seleccionado} solicitar={solicitar} alDecidir={() => setCambio(n => n + 1)} volver={() => setSeleccionado(null)} />
    </div>}
  </div>;
}