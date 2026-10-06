import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="section page-section">
      <div className="container empty-state">
        <span className="eyebrow">Error 404</span>
        <h1>Esta página no existe.</h1>
        <p>La dirección que intentaste abrir no corresponde a una sección de VetStec.</p>
        <Link className="button button-primary" to="/">Volver al inicio</Link>
      </div>
    </section>
  );
}
