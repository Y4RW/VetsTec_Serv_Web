import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PanelPropietario from '../propietario/PanelPropietario';

const ESTADOS = {
  PENDIENTE: {
    titulo: 'Establecimiento pendiente de revisión',
    texto: 'Tu correo ya está verificado. La solicitud de tu establecimiento está pendiente de revisión.',
    clase: 'pending',
  },
  APROBADO: {
    titulo: 'Establecimiento aprobado',
    texto: 'La revisión de tu establecimiento fue aprobada.',
    clase: 'approved',
  },
  RECHAZADO: {
    titulo: 'Solicitud rechazada',
    texto: 'Consulta el motivo de la revisión. Puedes comunicarte con VetStec desde Contacto.',
    clase: 'restricted',
  },
  SUSPENDIDO: {
    titulo: 'Establecimiento suspendido',
    texto: 'Las operaciones del establecimiento están restringidas. Comunícate con VetStec desde Contacto.',
    clase: 'restricted',
  },
};
const TIPOS = { VETERINARIA: 'Veterinaria', ESTETICA: 'Estética canina', AMBAS: 'Veterinaria y estética' };

export default function PanelPage() {
  const { sesion, cerrarSesion, comprobarSesion } = useAuth();
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState('');
  const { usuario, negocio } = sesion;
  const estado = ESTADOS[negocio.estado] || ESTADOS.PENDIENTE;

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

  return (
    <section className="account-panel" aria-labelledby="panel-title">
      <div className="container panel-container">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Mi establecimiento</span>
            <h1 id="panel-title">{negocio.nombre}</h1>
            <p>Consulta los datos de tu cuenta y el estado del registro.</p>
          </div>
          <button className="button button-secondary" type="button" onClick={salir} disabled={saliendo}>
            {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <section className={`panel-status ${estado.clase}`} aria-labelledby="review-title">
          <span className="panel-status-label">Estado de la solicitud</span>
          <h2 id="review-title">{estado.titulo}</h2>
          <p>{estado.texto}</p>
          {['RECHAZADO', 'SUSPENDIDO'].includes(negocio.estado) && negocio.motivoRechazo && (
            <p className="panel-reason"><strong>Motivo:</strong> {negocio.motivoRechazo}</p>
          )}
          <button className="button button-secondary" type="button" onClick={comprobarSesion} disabled={saliendo}>
            Actualizar estado
          </button>
        </section>
        <div className="panel-grid">
          <section className="panel-card" aria-labelledby="account-data-title">
            <h2 id="account-data-title">Cuenta de acceso</h2>
            <dl>
              <div><dt>Correo</dt><dd>{usuario.correo}</dd></div>
              <div><dt>Verificación del correo</dt><dd className="panel-verified">Completada</dd></div>
            </dl>
          </section>
          <section className="panel-card" aria-labelledby="business-data-title">
            <h2 id="business-data-title">Establecimiento</h2>
            <dl>
              <div><dt>Tipo de servicio</dt><dd>{TIPOS[negocio.tipoServicio] || 'Sin especificar'}</dd></div>
              <div><dt>Publicación en el directorio</dt><dd>{negocio.activoDirectorio ? 'Activada' : 'No publicada'}</dd></div>
            </dl>
          </section>
        </div>
       <PanelPropietario />
        <div className="panel-footer">
          <p>La sesión termina después de 30 minutos sin actividad o al cumplir 8 horas desde el acceso.</p>
          <div className="panel-links">
            <Link to="/contacto">Contactar a VetStec</Link>
            <Link to="/directorio">Ver directorio</Link>
          </div>
        </div>
      </div>
    </section>
  );
}