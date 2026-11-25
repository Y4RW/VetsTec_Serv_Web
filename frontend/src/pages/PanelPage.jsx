import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PanelPropietario from '../propietario/PanelPropietario';

const ESTADOS = {
  PENDIENTE: {
    etiqueta: 'En revisión',
    titulo: 'Tu establecimiento está en revisión',
    texto: 'Tu correo ya fue verificado. El equipo de VetStec revisará tu información antes de habilitar las herramientas operativas y publicar tu ficha.',
    tono: 'warning',
  },
  APROBADO: {
    etiqueta: 'Aprobado',
    titulo: 'Establecimiento verificado y aprobado',
    texto: 'Tu cuenta está activa para gestionar citas, servicios, catálogo y personal.',
    tono: 'success',
  },
  RECHAZADO: {
    etiqueta: 'Requiere correcciones',
    titulo: 'Solicitud con observaciones',
    texto: 'Revisa el motivo indicado abajo y edita los datos de tu sucursal para enviarla nuevamente a revisión.',
    tono: 'danger',
  },
  SUSPENDIDO: {
    etiqueta: 'Suspendido',
    titulo: 'Operaciones restringidas temporalmente',
    texto: 'Comunícate con el equipo de soporte de VetStec desde la página de Contacto para revisar tu caso.',
    tono: 'danger',
  },
};

const TIPOS = {
  VETERINARIA: { texto: 'Veterinaria', icono: '🩺' },
  ESTETICA: { texto: 'Estética canina', icono: '✂️' },
  AMBAS: { texto: 'Veterinaria y estética', icono: '🐾' },
};

export default function PanelPage() {
  const { sesion, cerrarSesion, comprobarSesion } = useAuth();
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const [error, setError] = useState('');
  const { usuario, negocio } = sesion;
  const estado = ESTADOS[negocio.estado] || ESTADOS.PENDIENTE;
  const tipo = TIPOS[negocio.tipoServicio] || { texto: 'Sin especificar', icono: '🏥' };

  async function salir() {
    if (saliendo) return;
    setSaliendo(true);
    setError('');
    try {
      await cerrarSesion();
      navigate('/acceso', { replace: true });
    } catch (fallo) {
      setError('No pudimos cerrar la sesión. ' + fallo.message);
      setSaliendo(false);
    }
  }

  async function refrescarEstado() {
    if (comprobando || saliendo) return;
    setComprobando(true);
    try {
      await comprobarSesion();
    } finally {
      setComprobando(false);
    }
  }

  return (
    <section className="account-panel owner-page" aria-labelledby="panel-title">
      <div className="container owner-page-container">
        <header className="own-topbar">
          <div className="own-topbar-identity">
            <div className="own-topbar-avatar" aria-hidden="true">
              {tipo.icono}
            </div>
            <div className="own-topbar-copy">
              <div className="own-topbar-kicker-row">
                <span className="own-eyebrow">Panel del Propietario</span>
                <span className={`own-badge own-badge-${estado.tono}`}>
                  {estado.etiqueta}
                </span>
                <span className={`own-badge ${negocio.activoDirectorio ? 'own-badge-success' : 'own-badge-neutral'}`}>
                  {negocio.activoDirectorio ? 'Visible en directorio' : 'No visible en directorio'}
                </span>
              </div>
              <h1 id="panel-title">{negocio.nombre}</h1>
              <div className="own-topbar-meta">
                <span>{tipo.texto}</span>
                <span aria-hidden="true">·</span>
                <span>Cuenta verificada: <strong>{usuario.correo}</strong></span>
              </div>
            </div>
          </div>

          <div className="own-topbar-actions">
            <Link className="own-btn own-btn-ghost" to="/directorio">
              Ver directorio público ↗
            </Link>
            <button
              className="own-btn own-btn-secondary"
              type="button"
              onClick={salir}
              disabled={saliendo}
            >
              {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </header>

        {error && <p className="own-alert own-alert-danger" role="alert">{error}</p>}

        {negocio.estado !== 'APROBADO' && (
          <section
            className={`own-status-banner own-status-${estado.tono}`}
            aria-labelledby="review-title"
          >
            <div className="own-status-banner-body">
              <span className="own-status-banner-kicker">Estado de verificación</span>
              <h2 id="review-title">{estado.titulo}</h2>
              <p>{estado.texto}</p>
              {['RECHAZADO', 'SUSPENDIDO'].includes(negocio.estado) && negocio.motivoRechazo && (
                <p className="own-status-reason">
                  <strong>Motivo registrado:</strong> {negocio.motivoRechazo}
                </p>
              )}
            </div>
            <div className="own-status-banner-actions">
              <button
                className="own-btn own-btn-secondary"
                type="button"
                onClick={refrescarEstado}
                disabled={saliendo || comprobando}
              >
                {comprobando ? 'Comprobando…' : 'Comprobar estado'}
              </button>
              {['RECHAZADO', 'SUSPENDIDO'].includes(negocio.estado) && (
                <Link className="own-btn own-btn-ghost" to="/contacto">
                  Contactar soporte
                </Link>
              )}
            </div>
          </section>
        )}

        <PanelPropietario />

        <footer className="own-page-footer">
          <p>
            Por seguridad, tu sesión se cierra tras 30 minutos de inactividad o al cumplir 8 horas desde el inicio de sesión.
          </p>
          <div className="own-page-footer-links">
            <Link to="/contacto">Soporte VetStec</Link>
            <Link to="/directorio">Explorar directorio</Link>
          </div>
        </footer>
      </div>
    </section>
  );
}