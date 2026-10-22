import { useEffect, useRef, useState } from 'react';

function errorFoto(archivo) {
  if (!archivo) {
    return 'Selecciona una fotografía del establecimiento.';
  }

  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(
      archivo.type
    )
  ) {
    return 'La fotografía debe ser JPG, PNG o WEBP.';
  }

  if (archivo.size === 0) {
    return 'El archivo está vacío. Selecciona otra fotografía.';
  }

  if (archivo.size > 5 * 1024 * 1024) {
    return 'La fotografía no puede superar los 5 MB.';
  }

  return '';
}

export default function RegistrationVerification({
  form,
  setForm,
  onBack,
  onContinue,
}) {
  const [errores, setErrores] = useState({});
  const [preview, setPreview] = useState('');
  const [comprobando, setComprobando] = useState(false);

  const revision = useRef(0);
  const titulo = useRef(null);
  const fotoInput = useRef(null);

  const esVeterinaria = [
    'VETERINARIA',
    'AMBAS',
  ].includes(form.tipoServicio);

  const esEstetica = form.tipoServicio === 'ESTETICA';

  useEffect(() => {
    titulo.current?.focus();

    return () => {
      revision.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!form.evidencia) {
      setPreview('');
      return;
    }

    const url = URL.createObjectURL(form.evidencia);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [form.evidencia]);

  function cambiarTexto(event) {
    const { name, value } = event.target;

    setForm((actual) => ({
      ...actual,
      [name]: value,
    }));

    setErrores((actual) => ({
      ...actual,
      [name]: '',
    }));
  }

  async function seleccionarFoto(event) {
    const input = event.currentTarget;
    const archivo = input.files?.[0];

    if (!archivo) return;

    const id = ++revision.current;
    const error = errorFoto(archivo);

    setComprobando(false);

    setErrores((actual) => ({
      ...actual,
      evidencia: error,
    }));

    if (error) {
      input.value = '';
      return;
    }

    setComprobando(true);

    const url = URL.createObjectURL(archivo);

    try {
      const imagen = new Image();
      imagen.src = url;

      await imagen.decode();

      if (id !== revision.current) return;

      setForm((actual) => ({
        ...actual,
        evidencia: archivo,
      }));
    } catch {
      if (id === revision.current) {
        input.value = '';

        setErrores((actual) => ({
          ...actual,
          evidencia:
            'No pudimos abrir la imagen. Selecciona otra fotografía.',
        }));
      }
    } finally {
      URL.revokeObjectURL(url);

      if (id === revision.current) {
        setComprobando(false);
      }
    }
  }

  function quitarFoto() {
    revision.current += 1;
    setComprobando(false);

    setForm((actual) => ({
      ...actual,
      evidencia: null,
    }));

    setErrores((actual) => ({
      ...actual,
      evidencia: '',
    }));

    if (fotoInput.current) {
      fotoInput.current.value = '';
    }

    fotoInput.current?.focus();
  }

  function continuar(event) {
    event.preventDefault();

    if (comprobando) return;

    const nuevos = {};

    if (esVeterinaria) {
      if (!(form.nombreResponsable || '').trim()) {
        nuevos.nombreResponsable =
          'Escribe el nombre del profesional responsable.';
      }

      if (
        !/^\d{1,30}$/.test(
          (form.cedulaProfesional || '').trim()
        )
      ) {
        nuevos.cedulaProfesional =
          'Escribe la cédula profesional utilizando únicamente dígitos.';
      }
    } else if (esEstetica) {
      const error = errorFoto(form.evidencia);

      if (error) {
        nuevos.evidencia = error;
      }
    } else {
      nuevos.general =
        'Regresa y selecciona el tipo de establecimiento.';
    }

    setErrores(nuevos);

    const primero = Object.keys(nuevos)[0];

    if (primero) {
      const campo =
        event.currentTarget.elements.namedItem(primero);

      if (campo) {
        campo.focus();
      } else {
        titulo.current?.focus();
      }

      return;
    }

    if (esVeterinaria) {
      setForm((actual) => ({
        ...actual,
        nombreResponsable:
          actual.nombreResponsable.trim(),
        cedulaProfesional:
          actual.cedulaProfesional.trim(),
      }));
    }

    onContinue();
  }

  return (
    <form
      className="register-card verification-card"
      onSubmit={continuar}
      noValidate
      aria-labelledby="verification-title"
    >
      <h2
        id="verification-title"
        ref={titulo}
        tabIndex={-1}
      >
        Verificación del establecimiento
      </h2>

      <p>
        {esVeterinaria
          ? 'Indica quién es el profesional responsable de la atención veterinaria.'
          : 'Agrega una fotografía que permita identificar tu estética canina.'}
      </p>

      <div className="verification-notice">
        Al completar el registro, el equipo VetStec revisará
        esta información. La aprobación del establecimiento
        quedará pendiente de esa revisión.
      </div>

      <div className="register-form-grid">
        {esVeterinaria && (
          <>
            <div className="form-field form-field-full">
              <label htmlFor="verification-name">
                Nombre completo del profesional responsable *
              </label>

              <input
                id="verification-name"
                name="nombreResponsable"
                type="text"
                autoComplete="name"
                maxLength={150}
                required
                value={form.nombreResponsable || ''}
                onChange={cambiarTexto}
                aria-invalid={Boolean(
                  errores.nombreResponsable
                )}
                aria-describedby={
                  errores.nombreResponsable
                    ? 'verification-name-error'
                    : undefined
                }
              />

              {errores.nombreResponsable && (
                <p
                  id="verification-name-error"
                  className="verification-error"
                  role="alert"
                >
                  {errores.nombreResponsable}
                </p>
              )}
            </div>

            <div className="form-field form-field-full">
              <label htmlFor="verification-license">
                Cédula profesional *
              </label>

              <input
                id="verification-license"
                name="cedulaProfesional"
                type="text"
                inputMode="numeric"
                maxLength={30}
                required
                value={form.cedulaProfesional || ''}
                onChange={cambiarTexto}
                aria-invalid={Boolean(
                  errores.cedulaProfesional
                )}
                aria-describedby={
                  `verification-license-help${
                    errores.cedulaProfesional
                      ? ' verification-license-error'
                      : ''
                  }`
                }
              />

              <p
                id="verification-license-help"
                className="field-help"
              >
                Captura el número tal como aparece en la
                cédula. Su revisión no es automática.
              </p>

              {errores.cedulaProfesional && (
                <p
                  id="verification-license-error"
                  className="verification-error"
                  role="alert"
                >
                  {errores.cedulaProfesional}
                </p>
              )}
            </div>
          </>
        )}

        {esEstetica && (
          <>
            <div className="form-field form-field-full">
              <label htmlFor="verification-photo">
                Fotografía del establecimiento *
              </label>

              <p
                id="verification-photo-help"
                className="field-help"
              >
                Muestra la fachada o entrada y el letrero del
                negocio, con buena luz y sin desenfoque.
                Utiliza una fotografía del local; el logo se
                agrega en el paso anterior.
                Formatos JPG, PNG o WEBP, hasta 5 MB.
              </p>

              <input
                ref={fotoInput}
                id="verification-photo"
                name="evidencia"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={seleccionarFoto}
                aria-invalid={Boolean(errores.evidencia)}
                aria-describedby={
                  `verification-photo-help${
                    errores.evidencia
                      ? ' verification-photo-error'
                      : ''
                  }`
                }
              />

              {comprobando && (
                <p className="field-help" role="status">
                  Comprobando fotografía…
                </p>
              )}

              {errores.evidencia && (
                <p
                  id="verification-photo-error"
                  className="verification-error"
                  role="alert"
                >
                  {errores.evidencia}
                </p>
              )}
            </div>

            {form.evidencia && preview && (
              <figure className="verification-preview form-field-full">
                <img
                  src={preview}
                  alt="Fotografía seleccionada del establecimiento"
                />

                <figcaption>
                  <strong>{form.evidencia.name}</strong>

                  <small>
                    {(
                      form.evidencia.size /
                      (1024 * 1024)
                    ).toFixed(2)}
                    {' '}MB · Fotografía seleccionada
                  </small>

                  <button
                    type="button"
                    onClick={quitarFoto}
                  >
                    Quitar fotografía
                  </button>
                </figcaption>
              </figure>
            )}
          </>
        )}
      </div>

      {errores.general && (
        <p className="register-error" role="alert">
          {errores.general}
        </p>
      )}

      <div className="register-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBack}
        >
          Atrás
        </button>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={comprobando}
        >
          {comprobando ? 'Comprobando…' : 'Continuar'}
        </button>
      </div>
    </form>
  );
}