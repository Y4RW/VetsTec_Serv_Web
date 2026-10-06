import { useState } from 'react';

export default function ContactPage() {
  const [form, setForm] = useState({
    nombre: '',
    correo: '',
    descripcion: '',
  });

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState(false);

  function handleChange(event) {
    const {
      name,
      value,
    } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');
    setSuccess(false);

    const nombre =
      form.nombre.trim();

    const correo =
      form.correo.trim();

    const descripcion =
      form.descripcion.trim();

    if (nombre.length < 2) {
      setError(
        'Escribe tu nombre.'
      );

      return;
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(correo)) {
      setError(
        'Escribe un correo electrónico válido.'
      );

      return;
    }

    if (descripcion.length < 10) {
      setError(
        'Describe con un poco más de detalle el motivo de tu mensaje.'
      );

      return;
    }

    try {
      setSending(true);

      const response = await fetch(
        '/api/contacto',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            nombre,
            correo,
            descripcion,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            'No fue posible enviar el mensaje.'
        );
      }

      if (!result.success) {
        throw new Error(
          result.message ||
            'No fue posible enviar el mensaje.'
        );
      }

      setSuccess(true);

      setForm({
        nombre: '',
        correo: '',
        descripcion: '',
      });
    } catch (requestError) {
      console.error(
        'Error enviando contacto:',
        requestError
      );

      setError(
        requestError.message ||
          'No fue posible enviar el mensaje.'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main>
      <section className="contact-hero">
        <div className="container">
          <span className="eyebrow">
            Contacto
          </span>

          <h1>
            Tu opinión también nos ayuda
            a mejorar VetStec.
          </h1>

          <p>
            Si tienes algún comentario,
            sugerencia, duda o deseas compartir
            tu experiencia con la plataforma,
            puedes enviarnos un mensaje.
          </p>
        </div>
      </section>

      <section className="contact-section">
        <div className="container contact-grid">

          <div className="contact-information">
            <span className="eyebrow">
              Queremos escucharte
            </span>

            <h2>
              Cuéntanos cómo podemos mejorar.
            </h2>

            <p>
              Los comentarios recibidos nos
              permiten identificar oportunidades
              de mejora y continuar desarrollando
              una plataforma práctica para
              veterinarias, estéticas caninas y
              sus clientes.
            </p>

            <div className="contact-benefits">
              <div>
                <span>💬</span>

                <div>
                  <strong>
                    Comentarios y sugerencias
                  </strong>

                  <p>
                    Comparte tu experiencia o
                    alguna idea para VetStec.
                  </p>
                </div>
              </div>

              <div>
                <span>🐾</span>

                <div>
                  <strong>
                    Ayúdanos a mejorar
                  </strong>

                  <p>
                    Tus observaciones pueden
                    ayudarnos a ofrecer una mejor
                    experiencia.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="contact-card">

            {success ? (
              <div className="contact-success">
                <div className="success-icon">
                  ✓
                </div>

                <h2>
                  Mensaje enviado
                </h2>

                <p>
                  Gracias por compartir tu opinión
                  con el equipo de VetStec.
                </p>

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() =>
                    setSuccess(false)
                  }
                >
                  Enviar otro mensaje
                </button>
              </div>
            ) : (
              <form
                className="contact-form"
                onSubmit={handleSubmit}
              >
                <div className="contact-form-heading">
                  <h2>
                    Envíanos un mensaje
                  </h2>

                  <p>
                    Todos los campos son
                    obligatorios.
                  </p>
                </div>

                <div className="form-field">
                  <label htmlFor="contact-name">
                    Nombre
                  </label>

                  <input
                    id="contact-name"
                    name="nombre"
                    type="text"
                    value={form.nombre}
                    onChange={handleChange}
                    placeholder="Tu nombre"
                    maxLength={120}
                    autoComplete="name"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="contact-email">
                    Correo electrónico
                  </label>

                  <input
                    id="contact-email"
                    name="correo"
                    type="email"
                    value={form.correo}
                    onChange={handleChange}
                    placeholder="nombre@correo.com"
                    maxLength={150}
                    autoComplete="email"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="contact-description">
                    Descripción
                  </label>

                  <textarea
                    id="contact-description"
                    name="descripcion"
                    value={form.descripcion}
                    onChange={handleChange}
                    placeholder="Cuéntanos el motivo de tu mensaje..."
                    maxLength={2000}
                    rows={7}
                  />

                  <div className="character-counter">
                    {form.descripcion.length}
                    /2000
                  </div>
                </div>

                {error && (
                  <div
                    className="form-error"
                    role="alert"
                  >
                    ⚠️ {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="button button-primary contact-submit"
                  disabled={sending}
                >
                  {sending
                    ? 'Enviando mensaje...'
                    : 'Enviar mensaje'}
                </button>

                <p className="contact-privacy-note">
                  Utilizaremos los datos enviados
                  únicamente para atender tu
                  comentario o solicitud.
                </p>
              </form>
            )}

          </div>
        </div>
      </section>
    </main>
  );
}