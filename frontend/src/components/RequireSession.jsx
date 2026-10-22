import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireSession() {
  const { estado, error, comprobarSesion } = useAuth();
  if (estado === 'cargando') {
    return <div className="container session-message" role="status">Comprobando sesión…</div>;
  }
  if (estado === 'error') {
    return (
      <section className="container session-message">
        <h1>No pudimos comprobar tu sesión</h1>
        <p role="alert">{error}</p>
        <button type="button" className="button button-primary" onClick={comprobarSesion}>
          Volver a intentar
        </button>
      </section>
    );
  }
  if (estado !== 'autenticado') return <Navigate to="/acceso" replace />;
  return <Outlet />;
}