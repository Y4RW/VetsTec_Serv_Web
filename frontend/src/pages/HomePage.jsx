import { Link } from 'react-router-dom';

const benefits = [
  {
    icon: '📅',
    title: 'Mejor organización',
    text: 'Centraliza procesos importantes para disminuir el uso de agendas, notas y registros dispersos.',
  },
  {
    icon: '⏱️',
    title: 'Control de tiempos',
    text: 'Ayuda a organizar los servicios y a reducir retrasos mediante una gestión más clara de la agenda.',
  },
  {
    icon: '💬',
    title: 'Mejor comunicación',
    text: 'Facilita la comunicación entre establecimientos y clientes mediante herramientas digitales.',
  },
];

const businessFeatures = [
  'Gestión de citas y disponibilidad',
  'Control de clientes y mascotas',
  'Administración de inventario',
  'Control de servicios y tiempos',
  'Organización del personal',
  'Comunicación con los clientes',
];

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="hero-section">
        <div className="container hero-grid">

          <div className="hero-copy">
            <span className="eyebrow">
              Plataforma para veterinarias y estéticas caninas
            </span>

            <h1>
              Tecnología para organizar mejor el cuidado de cada mascota.
            </h1>

            <p>
              VetStec es una plataforma web diseñada para apoyar a veterinarias
              y estéticas caninas en la organización de sus actividades,
              mientras facilita que los clientes encuentren establecimientos
              y consulten información importante.
            </p>

            <div className="hero-actions">
              <Link className="button button-primary" to="/directorio">
                Explorar directorio
              </Link>

              <Link className="button button-secondary" to="/contacto">
                Contactar a VetStec
              </Link>
            </div>
          </div>

          <div className="hero-panel">
            <div className="hero-panel-badge">
              VetStec
            </div>

            <h2>
              Una plataforma pensada para el trabajo diario.
            </h2>

            <p>
              Organización, agenda, comunicación y administración desde una
              experiencia adaptable a computadoras y dispositivos móviles.
            </p>

            <div className="metric-row">
              <div>
                <strong>3</strong>
                <span>modalidades de negocio</span>
              </div>

              <div>
                <strong>1</strong>
                <span>plataforma centralizada</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* QUÉ ES VETSTEC */}
      <section className="section">
        <div className="container about-grid">

          <div>
            <span className="eyebrow">
              Acerca de VetStec
            </span>

            <h2 className="large-section-title">
              Una solución creada para modernizar la gestión de servicios
              veterinarios y de estética.
            </h2>
          </div>

          <div className="about-text">
            <p>
              Muchas veterinarias y estéticas caninas todavía dependen de
              agendas físicas, mensajes dispersos o diferentes herramientas
              para administrar sus actividades.
            </p>

            <p>
              VetStec busca reunir estos procesos dentro de una sola plataforma,
              ofreciendo una experiencia clara, accesible y adaptable al tipo
              de establecimiento.
            </p>
          </div>

        </div>
      </section>

      {/* BENEFICIOS */}
      <section
        className="section section-soft"
        aria-labelledby="beneficios-title"
      >
        <div className="container">

          <div className="section-heading">
            <span className="eyebrow">
              ¿Cómo beneficia VetStec?
            </span>

            <h2 id="beneficios-title">
              Menos desorganización y mayor control de las actividades diarias.
            </h2>

            <p>
              La plataforma busca simplificar tareas recurrentes y facilitar
              una mejor experiencia tanto para el establecimiento como para
              sus clientes.
            </p>
          </div>

          <div className="benefit-grid">
            {benefits.map((benefit) => (
              <article
                className="benefit-card"
                key={benefit.title}
              >
                <div className="benefit-icon">
                  {benefit.icon}
                </div>

                <h3>
                  {benefit.title}
                </h3>

                <p>
                  {benefit.text}
                </p>
              </article>
            ))}
          </div>

        </div>
      </section>

      {/* PARA VETERINARIAS */}
      <section className="section">
        <div className="container professional-grid">

          <div className="professional-copy">
            <span className="eyebrow">
              Para veterinarias y estéticas
            </span>

            <h2 className="large-section-title">
              Herramientas que acompañan la operación del establecimiento.
            </h2>

            <p>
              VetStec está pensado para adaptarse a establecimientos
              exclusivamente veterinarios, estéticas caninas o negocios que
              ofrecen ambos servicios.
            </p>

            <p>
              La plataforma permitirá administrar diferentes procesos desde
              un entorno centralizado y accesible.
            </p>
          </div>

          <div className="feature-list">
            {businessFeatures.map((feature) => (
              <div
                className="feature-item"
                key={feature}
              >
                <span className="feature-check">
                  ✓
                </span>

                <span>
                  {feature}
                </span>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* CLIENTES */}
      <section className="section client-section">
        <div className="container client-card">

          <div>
            <span className="eyebrow eyebrow-light">
              Para clientes
            </span>

            <h2>
              Encontrar una veterinaria o estética también debe ser sencillo.
            </h2>

            <p>
              El Directorio de VetStec permitirá localizar establecimientos,
              consultar información de contacto, ubicación y disponibilidad
              sin necesidad de crear una cuenta.
            </p>
          </div>

          <div className="client-action">
            <Link
              className="button button-light"
              to="/directorio"
            >
              Buscar establecimiento
            </Link>
          </div>

        </div>
      </section>

      {/* CTA FINAL */}
      <section className="section">
        <div className="container final-cta">

          <div>
            <span className="eyebrow">
              Conoce VetStec
            </span>

            <h2>
              Una plataforma en desarrollo pensada para mejorar la gestión
              del cuidado animal.
            </h2>

            <p>
              Si quieres compartir alguna opinión, recomendación o comentario
              sobre el proyecto, puedes comunicarte con nuestro equipo.
            </p>
          </div>

          <Link
            className="button button-primary"
            to="/contacto"
          >
            Ir a contacto
          </Link>

        </div>
      </section>
    </>
  );
}