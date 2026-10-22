import { useEffect, useRef, useState } from 'react';

const PASSWORD_FIELDS = [
  { name: 'password', label: 'Contraseña' },
  { name: 'confirmarPassword', label: 'Confirmar contraseña' },
];

export default function RegistrationAccount({
  form,
  setForm,
  onBack,
  onContinue,
}) {
  const [errores, setErrores] = useState({});
  const [visibles, setVisibles] = useState({});
  const titulo = useRef(null);
  const correoInput = useRef(null);

  useEffect(() => {
    titulo.current?.focus();
  }, []);

  function cambiar(event) {
    const { name, value } = event.target;

    setForm((actual) => ({
      ...actual,
      [name]: value,
    }));

    setErrores((actual) => ({
      ...actual,
      [name]: '',
      ...(name === 'password' ? { confirmarPassword: '' } : {}),
    }));
  }

  function usarCorreoContacto() {
    setForm((actual) => ({
      ...actual,
      correo: (actual.correoContacto || '').trim(),
    }));

    setErrores((actual) => ({
      ...actual,
      correo: '',
    }));

    correoInput.current?.focus();
  }

  function continuar(event) {
    event.preventDefault();

    const correo = (form.correo || '').trim().toLowerCase();
    const password = form.password || '';
    const confirmacion = form.confirmarPassword || '';
    const nuevos = {};

    if (!correo) {
      nuevos.correo = 'Escribe el correo de acceso.';
    } else if (
      correo.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
      correoInput.current?.validity.typeMismatch
    ) {
      nuevos.correo =
        'Escribe un correo válido de hasta 150 caracteres.';
    }

    if ([...password].length < 15) {
      nuevos.password =
        'La contraseña debe tener al menos 15 caracteres.';
    } else if (new TextEncoder().encode(password).length > 72) {
      nuevos.password =
        'La contraseña es demasiado larga. Usa una más corta.';
    }

    if (!confirmacion) {
      nuevos.confirmarPassword = 'Vuelve a escribir la contraseña.';
    } else if (password !== confirmacion) {
      nuevos.confirmarPassword = 'Las contraseñas no coinciden.';
    }

    setErrores(nuevos);

    const primero = Object.keys(nuevos)[0];

    if (primero) {
      event.currentTarget.elements.namedItem(primero)?.focus();
      return;
    }

    setForm((actual) => ({
      ...actual,
      correo,
    }));

    onContinue();
  }

  return (
    <form
      className="register-card account-card"
      noValidate
      onSubmit={continuar}
      aria-labelledby="account-title"
    >
      <h2 id="account-title" ref={titulo} tabIndex={-1}>
        Cuenta de acceso
      </h2>

      <p>
        Elige el correo y la contraseña que utilizarás para administrar
        tu establecimiento.
      </p>

      <div className="account-notice">
        Usa un correo al que tengas acceso. En el siguiente paso se
        verificará que te pertenece.
      </div>

      <div className="register-form-grid">
        <div className="form-field form-field-full">
          <label htmlFor="account-email">
            Correo de acceso *
          </label>

          <input
            ref={correoInput}
            id="account-email"
            name="correo"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={150}
            value={form.correo || ''}
            onChange={cambiar}
            placeholder="tu-correo@ejemplo.com"
            aria-invalid={Boolean(errores.correo)}
            aria-describedby={`account-email-help${
              errores.correo ? ' account-email-error' : ''
            }`}
          />

          <p className="field-help" id="account-email-help">
            Puede ser distinto del correo de contacto del establecimiento.
          </p>

          {form.correoContacto && (
            <button
              type="button"
              className="account-use-contact"
              onClick={usarCorreoContacto}
            >
              Usar correo de contacto
            </button>
          )}

          {errores.correo && (
            <p
              className="account-error"
              id="account-email-error"
              role="alert"
            >
              {errores.correo}
            </p>
          )}
        </div>

        {PASSWORD_FIELDS.map(({ name, label }) => (
          <div className="form-field" key={name}>
            <label htmlFor={`account-${name}`}>
              {label} *
            </label>

            <div className="account-password-control">
              <input
                id={`account-${name}`}
                name={name}
                type={visibles[name] ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={form[name] || ''}
                onChange={cambiar}
                aria-invalid={Boolean(errores[name])}
                aria-describedby={`account-${name}-help${
                  errores[name] ? ` account-${name}-error` : ''
                }`}
              />

              <button
                type="button"
                className="account-toggle"
                onClick={() =>
                  setVisibles((actual) => ({
                    ...actual,
                    [name]: !actual[name],
                  }))
                }
                aria-label={`${
                  visibles[name] ? 'Ocultar' : 'Mostrar'
                } ${
                  name === 'password'
                    ? 'contraseña'
                    : 'confirmación de contraseña'
                }`}
                aria-controls={`account-${name}`}
              >
                {visibles[name] ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>

            <p
              className="field-help"
              id={`account-${name}-help`}
            >
              {name === 'password'
                ? 'Usa al menos 15 caracteres. Puedes incluir espacios y símbolos.'
                : 'Escríbela exactamente igual, incluidos los espacios.'}
            </p>

            {errores[name] && (
              <p
                className="account-error"
                id={`account-${name}-error`}
                role="alert"
              >
                {errores[name]}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="register-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBack}
        >
          Atrás
        </button>

        <button type="submit" className="btn btn-primary">
          Continuar
        </button>
      </div>
    </form>
  );
}