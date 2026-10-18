import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { adminApi } from './adminApi';
import './admin.css';

const sinSesion = { estado: 'anonimo', datos: null, error: '' };

function Marca() {
  return <Link to="/" aria-label="Ir al inicio de VetStec">
    <img className="admin-logo" src="/Logo_VetStec.png" alt="VetStec" />
  </Link>;
}

function AccesoAdmin({ iniciar, aviso }) {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  async function enviar(event) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError('');
    try {
      await iniciar(correo, password);
    } catch (fallo) {
      const espera = fallo.retryAfter ? ` Intenta en ${Math.ceil(fallo.retryAfter / 60)} minuto(s).` : '';
      setError(fallo.message + espera);
      setPassword('');
    } finally {
      setEnviando(false);
    }
  }
  return <main className="admin-shell admin-access">
    <section className="admin-card" aria-labelledby="admin-titulo">
      <Marca />
      <p className="admin-eyebrow">Administración VetStec</p>
      <h1 id="admin-titulo">Acceso del equipo</h1>
      <p>Inicia sesión con tu cuenta administradora de VetStec.</p>
      {aviso && <p className="admin-notice" role="status">{aviso}</p>}
      <form onSubmit={enviar} className="admin-form" aria-busy={enviando}>
        <label htmlFor="admin-correo">Correo administrativo</label>
        <input id="admin-correo" type="email" autoComplete="username" required
          maxLength={150} value={correo} disabled={enviando}
          onChange={(event) => setCorreo(event.target.value)} />
        <label htmlFor="admin-password">Contraseña de VetStec</label>
        <input id="admin-password" type="password" autoComplete="current-password"
          required value={password} disabled={enviando}
          onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="button button-primary" disabled={enviando} type="submit">
          {enviando ? 'Verificando…' : 'Entrar al panel'}
        </button>
      </form>
      <p className="admin-help">Usa la contraseña creada para VetStec. Las cuentas se dan de alta internamente.</p>
      <Link to="/">Volver a la página principal</Link>
    </section>
  </main>;
}

function PanelAdmin({ datos, cerrar, comprobar }) {
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState('');
  async function salir() {
    if (saliendo) return;
    setSaliendo(true);
    setError('');
    try { await cerrar(); }
    catch (fallo) { setError(fallo.message + ' No se confirmó el cierre de sesión. Intenta otra vez.'); }
    finally { setSaliendo(false); }
  }
  return <main className="admin-shell admin-panel">
    <header className="admin-header">
      <Marca />
      <div><p className="admin-eyebrow">Administración VetStec</p><h1>Panel de administración</h1></div>
      <button className="button button-secondary" onClick={salir} disabled={saliendo}>
        {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
    </header>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <section className="admin-card" aria-labelledby="admin-bienvenida">
      <span className="admin-badge">Sesión administrativa activa</span>
      <h2 id="admin-bienvenida">Hola, {datos.administrador.nombre}</h2>
      <dl className="admin-details">
        <div><dt>Correo</dt><dd>{datos.administrador.correo}</dd></div>
        <div><dt>Permisos</dt><dd>Administración de VetStec</dd></div>
        <div><dt>Vencimiento máximo</dt><dd>{new Date(datos.sesion.expiraEn).toLocaleString('es-MX')}</dd></div>
      </dl>
      <p>La sesión dura hasta 4 horas y termina después de 15 minutos de inactividad.</p>
      <button className="button button-secondary" onClick={comprobar} disabled={saliendo}>
        Comprobar sesión
      </button>
    </section>
    <section className="admin-card">
      <h2>Solicitudes de establecimientos</h2>
      <p>La revisión de solicitudes se habilitará en la siguiente etapa.</p>
    </section>
    <Link to="/">Ir a la página pública</Link>
  </main>;
}

export default function AdminModule() {
  const [acceso, setAcceso] = useState({ ...sinSesion, estado: 'cargando' });
  const revision = useRef(0);
  const operando = useRef(false);
  const estadoActual = useRef(acceso.estado);
  estadoActual.current = acceso.estado;

  const comprobar = useCallback(async () => {
    if (operando.current) return;
    const actual = ++revision.current;
    setAcceso({ ...sinSesion, estado: 'cargando' });
    try {
      const datos = await adminApi('sesion');
      if (actual === revision.current) setAcceso({ estado: 'autenticado', datos, error: '' });
    } catch (error) {
      if (actual !== revision.current) return;
      setAcceso(error.status === 401 ? sinSesion : { ...sinSesion, estado: 'error', error: error.message });
    }
  }, []);

  useEffect(() => {
    comprobar();
    const alEnfocar = () => { if (estadoActual.current === 'autenticado') comprobar(); };
    const alMostrar = (event) => { if (event.persisted) comprobar(); };
    window.addEventListener('focus', alEnfocar);
    window.addEventListener('pageshow', alMostrar);
    return () => {
      revision.current += 1;
      window.removeEventListener('focus', alEnfocar);
      window.removeEventListener('pageshow', alMostrar);
    };
  }, [comprobar]);

  useEffect(() => {
    if (acceso.estado !== 'autenticado') return;
    const restante = Math.min(15 * 60 * 1000, new Date(acceso.datos.sesion.expiraEn).getTime() - Date.now());
    const timer = setTimeout(() => {
      revision.current += 1;
      setAcceso({ ...sinSesion, error: 'La sesión terminó. Inicia sesión nuevamente.' });
    }, Math.max(0, restante));
    return () => clearTimeout(timer);
  }, [acceso]);

  async function iniciar(correo, password) {
    if (operando.current) return;
    operando.current = true;
    const actual = ++revision.current;
    try {
      const datos = await adminApi('login', { method: 'POST', datos: { correo, password } });
      if (actual === revision.current) setAcceso({ estado: 'autenticado', datos, error: '' });
    } finally { operando.current = false; }
  }

  async function cerrar() {
    if (operando.current) return;
    operando.current = true;
    const actual = ++revision.current;
    try {
      await adminApi('logout', { method: 'POST' });
      if (actual === revision.current) setAcceso(sinSesion);
    } finally { operando.current = false; }
  }

  if (acceso.estado === 'cargando') return <main className="admin-shell admin-access">
    <div className="admin-card"><Marca /><p role="status">Comprobando acceso administrativo…</p></div>
  </main>;
  if (acceso.estado === 'error') return <main className="admin-shell admin-access">
    <div className="admin-card"><Marca /><h1>No pudimos comprobar la sesión</h1>
      <p role="alert">{acceso.error}</p>
      <button className="button button-primary" onClick={comprobar}>Reintentar</button>
    </div>
  </main>;
  const conectado = acceso.estado === 'autenticado';
  return <Routes>
    <Route path="acceso" element={conectado ? <Navigate to="/admin/solicitudes" replace /> :
      <AccesoAdmin iniciar={iniciar} aviso={acceso.error} />} />
    <Route path="solicitudes" element={conectado ?
      <PanelAdmin datos={acceso.datos} cerrar={cerrar} comprobar={comprobar} /> :
      <Navigate to="/admin/acceso" replace />} />
    <Route path="*" element={<Navigate to={conectado ? '/admin/solicitudes' : '/admin/acceso'} replace />} />
  </Routes>;
}