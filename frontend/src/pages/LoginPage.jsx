import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();

    // Por ahora solo es la interfaz.
    // No se envían credenciales ni se crea una sesión.
    event.currentTarget.reset();
    setShowPassword(false);
    setSubmitted(true);
  }

  return (
    <section className="login-page" aria-labelledby="login-title">
      <div className="container login-container">
        <div className="login-card">
          <div className="login-heading">
            <span className="eyebrow">
              Acceso para establecimientos
            </span>

            <h1 id="login-title">Iniciar sesión</h1>

            <p>
              Bienvenido a VetStec. Este es el acceso para tu
              veterinaria o estética canina.
            </p>
          </div>

          <div className="login-notice" id="login-availability">
            <strong>Disponible próximamente</strong>

            <p>
              El inicio de sesión aún no está habilitado.
              Puedes continuar con el registro de tu establecimiento.
            </p>
          </div>

          <form
            className="login-form"
            onSubmit={handleSubmit}
            onChange={() => setSubmitted(false)}
            aria-labelledby="login-title"
            aria-describedby="login-availability"
          >
            <p className="login-required">
              Los campos con * son obligatorios.
            </p>

            <div className="login-field">
              <label htmlFor="login-email">
                Correo electrónico <span aria-hidden="true">*</span>
              </label>

              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="nombre@ejemplo.com"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">
                Contraseña <span aria-hidden="true">*</span>
              </label>

              <div className="login-password">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                />

                <button
                  className="login-password-toggle"
                  type="button"
                  onClick={() => {
                    setShowPassword((visible) => !visible);
                  }}
                  aria-label={
                    showPassword
                      ? 'Ocultar contraseña'
                      : 'Mostrar contraseña'
                  }
                  aria-controls="login-password"
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <button
              className="button button-primary login-submit"
              type="submit"
            >
              Iniciar sesión
            </button>

            <p
              className="login-feedback"
              role="status"
              aria-atomic="true"
            >
              {submitted
                ? 'El inicio de sesión aún no está disponible. No se ha iniciado ninguna sesión ni se han enviado tus datos.'
                : ''}
            </p>
          </form>

          <div className="login-register">
            <p>
              ¿Tu establecimiento aún no está registrado?
            </p>

            <Link
              className="button button-secondary"
              to="/registro"
            >
              Registrar establecimiento
            </Link>
          </div>
        </div>

        <aside
          className="login-public"
          aria-label="Consulta pública"
        >
          <strong>
            ¿Buscas atención para tu mascota?
          </strong>

          <p>
            Puedes consultar establecimientos y solicitar
            una cita sin crear una cuenta.
          </p>

          <Link to="/directorio">
            Explorar directorio{' '}
            <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </div>
    </section>
  );
}