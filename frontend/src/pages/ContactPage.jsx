import { useEffect, useState } from 'react';

const MOTIVOS_CONTACTO = [
  'Consulta general',
  'Soporte técnico',
  'Solicitud de vinculación de establecimiento',
  'Revisión o verificación de cuenta',
  'Sugerencia o comentario',
];

export default function ContactPage() {
  const [form, setForm] = useState({
    nombre: '',
    correo: '',
    asunto: MOTIVOS_CONTACTO[0],
    descripcion: '',
  });

  const [correoOficial, setCorreoOficial] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [envioResultado, setEnvioResultado] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/contacto/info', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json?.data?.correo) {
          setCorreoOficial(json.data.correo);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setError('');
  }

  async function copiarCorreo() {
    if (!correoOficial || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(correoOficial);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');
    setEnvioResultado(null);

    const nombre = form.nombre.trim();
    const correo = form.correo.trim();
    const asunto = form.asunto.trim() || MOTIVOS_CONTACTO[0];
    const descripcion = form.descripcion.trim();

    if (nombre.length < 2) {
      setError('Escribe tu nombre.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(correo)) {
      setError('Escribe un correo electrónico válido.');
      return;
    }

    if (descripcion.length < 10) {
      setError(
        'Describe con un poco más de detalle el motivo de tu mensaje (mínimo 10 caracteres).'
      );
      return;
    }

    try {
      setSending(true);

      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nombre,
          correo,
          asunto,
          descripcion,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || 'No fue posible enviar el mensaje.'
        );
      }

      setEnvioResultado({
        folio: result.data?.id ?? null,
        correoEnviado: Boolean(result.correoEnviado),
        confirmacionEnviada: Boolean(result.confirmacionEnviada),
        correoDestino: result.correoDestino || correoOficial,
        correoRemitente: correo,
      });

      setForm({
        nombre: '',
        correo: '',
        asunto: MOTIVOS_CONTACTO[0],
        descripcion: '',
      });
    } catch (requestError) {
      console.error('Error enviando contacto:', requestError);

      setError(
        requestError.message || 'No fue posible enviar el mensaje.'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="contact-page">
      <section className="contact-hero">
        <div className="container">
          <span className="eyebrow">Comunicación y soporte</span>

          <h1>
            Tu opinión y consultas llegan directo al equipo de VetStec.
          </h1>

          <p>
            Si tienes dudas técnicas, comentarios, sugerencias o necesitas
            ayuda con tu establecimiento, envíanos un mensaje desde el
            formulario o escríbenos directamente por correo.
          </p>
        </div>
      </section>

      <section className="contact-section">
        <div className="container contact-grid">
          <div className="contact-information">
            <span className="eyebrow">Canales de atención</span>

            <h2>Estamos listos para escucharte.</h2>

            <p>
              Cada mensaje enviado desde esta página se registra con folio y
              se envía directamente a nuestro correo oficial de atención para
              darte respuesta oportuna.
            </p>

            <div className="contact-benefits">
              {correoOficial && (
                <div className="contact-email-card">
                  <span>✉️</span>

                  <div className="contact-email-body">
                    <strong>Correo oficial de VetStec</strong>

                    <a
                      className="contact-email-link"
                      href={`mailto:${correoOficial}?subject=${encodeURIComponent('Contacto desde VetStec')}`}
                    >
                      {correoOficial}
                    </a>

                    <p>
                      Los mensajes del formulario llegan directamente a esta
                      bandeja. También puedes escribirnos desde tu cliente de
                      correo.
                    </p>

                    <div className="contact-email-actions">
                      <a
                        className="contact-copy-btn"
                        href={`mailto:${correoOficial}?subject=${encodeURIComponent('Contacto desde VetStec')}`}
                      >
                        Abrir correo ↗
                      </a>
                      <button
                        type="button"
                        className="contact-copy-btn"
                        onClick={copiarCorreo}
                      >
                        {copiado ? '✓ Correo copiado' : 'Copiar dirección'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <span>💬</span>

                <div>
                  <strong>Comentarios y soporte</strong>

                  <p>
                    Resolvemos dudas sobre registro, verificación de
                    establecimientos, vinculación de sucursales o uso del panel.
                  </p>
                </div>
              </div>

              <div>
                <span>🐾</span>

                <div>
                  <strong>Ayúdanos a mejorar</strong>

                  <p>
                    Tus sugerencias nos permiten construir una mejor plataforma
                    para veterinarias, estéticas caninas y dueños de mascotas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="contact-card">
            {envioResultado ? (
              <div className="contact-success" role="status">
                <div className="success-icon">✓</div>

                <h2>Mensaje enviado</h2>

                {envioResultado.folio && (
                  <p className="contact-success-folio">
                    Folio de atención: <strong>#{envioResultado.folio}</strong>
                  </p>
                )}

                {envioResultado.correoEnviado ? (
                  <p>
                    Tu mensaje fue entregado al correo de VetStec
                    {envioResultado.correoDestino
                      ? ` (${envioResultado.correoDestino})`
                      : ''}
                    .
                    {envioResultado.confirmacionEnviada && (
                      <>
                        {' '}
                        Además, enviamos una copia de confirmación a{' '}
                        <strong>{envioResultado.correoRemitente}</strong>.
                      </>
                    )}
                  </p>
                ) : (
                  <p className="contact-success-warning">
                    Tu mensaje quedó guardado correctamente en el sistema,
                    aunque hubo un retraso en la notificación por correo.
                    {envioResultado.correoDestino && (
                      <>
                        {' '}
                        Si es urgente, también puedes escribirnos a{' '}
                        <a href={`mailto:${envioResultado.correoDestino}`}>
                          {envioResultado.correoDestino}
                        </a>
                        .
                      </>
                    )}
                  </p>
                )}

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setEnvioResultado(null)}
                >
                  Enviar otro mensaje
                </button>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="contact-form-heading">
                  <h2>Envíanos un mensaje</h2>

                  <p>
                    Completa el formulario y te responderemos directamente a tu
                    correo electrónico.
                  </p>
                </div>

                <div className="form-field">
                  <label htmlFor="contact-name">Nombre completo *</label>

                  <input
                    id="contact-name"
                    name="nombre"
                    type="text"
                    value={form.nombre}
                    onChange={handleChange}
                    placeholder="Tu nombre"
                    maxLength={120}
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="contact-email">Correo electrónico *</label>

                  <input
                    id="contact-email"
                    name="correo"
                    type="email"
                    value={form.correo}
                    onChange={handleChange}
                    placeholder="nombre@correo.com"
                    maxLength={150}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="contact-subject">Motivo del mensaje</label>

                  <select
                    id="contact-subject"
                    name="asunto"
                    value={form.asunto}
                    onChange={handleChange}
                  >
                    {MOTIVOS_CONTACTO.map((motivo) => (
                      <option key={motivo} value={motivo}>
                        {motivo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="contact-description">Mensaje *</label>

                  <textarea
                    id="contact-description"
                    name="descripcion"
                    value={form.descripcion}
                    onChange={handleChange}
                    placeholder="Cuéntanos cómo podemos ayudarte..."
                    maxLength={2000}
                    rows={6}
                    required
                  />

                  <div className="character-counter">
                    {form.descripcion.length}/2000
                  </div>
                </div>

                {error && (
                  <div className="form-error" role="alert">
                    ⚠️ {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="button button-primary contact-submit"
                  disabled={sending}
                >
                  {sending ? 'Enviando correo…' : 'Enviar mensaje'}
                </button>

                <p className="contact-privacy-note">
                  Utilizaremos tus datos únicamente para atender y responder tu
                  consulta por correo electrónico.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}