import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

function prepararRegistro(form) {
  const datos = new FormData();

  const campos = [
    'nombreEstablecimiento',
    'tipoServicio',
    'telefonoWhatsapp',
    'correoContacto',
    'direccion',
    'codigoPostal',
    'descripcion',
    'latitud',
    'longitud',
    'correo',
  ];

  for (const campo of campos) {
    datos.append(
      campo,
      String(form[campo] ?? '').trim()
    );
  }

  // La contraseña se envía exactamente como fue escrita.
  datos.append('password', form.password || '');

  if (form.logo instanceof File) {
    datos.append('logo', form.logo);
  }

  if (form.tipoServicio === 'ESTETICA') {
    if (form.evidencia instanceof File) {
      datos.append('evidencia', form.evidencia);
    }
  } else {
    datos.append(
      'nombreResponsable',
      (form.nombreResponsable || '').trim()
    );

    datos.append(
      'cedulaProfesional',
      (form.cedulaProfesional || '').trim()
    );
  }

  return datos;
}

export default function RegistrationEmailVerification({
  form,
  setForm,
  onBack,
  modoVerificacion,
}) {
  const [, setParams] = useSearchParams();

  const [fase, setFase] = useState(() =>
    modoVerificacion ? 'codigo' : 'resumen'
  );

  const [correo, setCorreo] = useState(form.correo || '');
  const [codigo, setCodigo] = useState('');
  const [creada, setCreada] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [hasta, setHasta] = useState(0);
  const [espera, setEspera] = useState(0);

  const peticion = useRef(null);
  const titulo = useRef(null);
  const correoInput = useRef(null);
  const codigoInput = useRef(null);

  useEffect(() => {
    titulo.current?.focus();
  }, [fase]);

  useEffect(() => {
    return () => peticion.current?.abort('salida');
  }, []);

  useEffect(() => {
    if (!hasta) return;

    const actualizar = () => {
      setEspera(
        Math.max(
          0,
          Math.ceil((hasta - Date.now()) / 1000)
        )
      );
    };

    actualizar();

    const timer = setInterval(actualizar, 1000);

    return () => clearInterval(timer);
  }, [hasta]);

  function limpiarPassword() {
    setForm((actual) => ({
      ...actual,
      password: '',
      confirmarPassword: '',
    }));
  }

  function retomar() {
    limpiarPassword();

    setParams(
      { verificar: '1' },
      { replace: true }
    );

    setError('');
    setAviso(
      'Escribe el correo de tu registro. Puedes usar tu código o solicitar uno nuevo.'
    );
    setFase('codigo');
  }

  async function solicitar(accion, ruta, datos) {
    if (peticion.current) return null;

    const controller = new AbortController();
    peticion.current = controller;

    setOcupado(accion);
    setError('');

    const timer = setTimeout(
      () => controller.abort('tiempo'),
      60000
    );

    try {
      const multipart = datos instanceof FormData;

      const respuesta = await fetch(ruta, {
        method: 'POST',
        signal: controller.signal,
        headers: multipart
          ? undefined
          : { 'Content-Type': 'application/json' },
        body: multipart
          ? datos
          : JSON.stringify(datos),
      });

      const contenido = await respuesta.json();

      if (!respuesta.ok || contenido.success !== true) {
        const fallo = new Error(
          contenido.message ||
          'No se pudo completar la operación.'
        );

        fallo.status = respuesta.status;
        fallo.retryAfter = Number(
          contenido.retryAfter ||
          respuesta.headers.get('Retry-After') ||
          0
        );

        throw fallo;
      }

      return controller.signal.aborted
        ? null
        : contenido;
    } catch (fallo) {
      if (controller.signal.reason === 'salida') {
        return null;
      }

      if (fallo.retryAfter > 0) {
        setHasta(
          Date.now() + fallo.retryAfter * 1000
        );
      }

      setError(
        fallo.status
          ? fallo.message
          : accion === 'registro'
            ? 'No pudimos confirmar el resultado del registro. Si ya lo enviaste, usa «Retomar verificación» antes de intentarlo otra vez.'
            : 'No pudimos comunicarnos con el servidor. Revisa la conexión e intenta nuevamente.'
      );

      return null;
    } finally {
      clearTimeout(timer);

      if (peticion.current === controller) {
        peticion.current = null;
      }

      if (controller.signal.reason !== 'salida') {
        setOcupado('');
      }
    }
  }

  async function registrar() {
    setParams(
      { verificar: '1' },
      { replace: true }
    );

    const respuesta = await solicitar(
      'registro',
      '/api/registro-negocio',
      prepararRegistro(form)
    );

    if (!respuesta) return;

    limpiarPassword();
    setCorreo(form.correo.trim().toLowerCase());
    setCreada(true);
    setFase('codigo');

    if (respuesta.data?.correoVerificacionEnviado) {
      setHasta(Date.now() + 60000);
      setAviso(
        'Solicitud registrada. Revisa tu bandeja de entrada y la carpeta de correo no deseado.'
      );
    } else {
      setAviso(
        'La solicitud se guardó, pero no se pudo enviar el correo. Pulsa «Reenviar código» para intentarlo nuevamente.'
      );
    }
  }

  function correoValido() {
    const valor = correo.trim().toLowerCase();

    if (
      valor.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor) ||
      correoInput.current?.validity.typeMismatch
    ) {
      setError('Escribe un correo válido.');
      correoInput.current?.focus();
      return '';
    }

    return valor;
  }

  function terminar(mensaje) {
    limpiarPassword();
    setCodigo('');
    setAviso(mensaje);
    setParams({}, { replace: true });
    setFase('listo');
  }

  async function reenviar() {
    const valor = correoValido();

    if (!valor || espera > 0) return;

    const respuesta = await solicitar(
      'reenviar',
      '/api/enviar-codigo-verificacion',
      { correo: valor }
    );

    if (!respuesta) return;

    if (respuesta.yaVerificado) {
      terminar(respuesta.message);
      return;
    }

    setCodigo('');
    setHasta(
      Date.now() + (respuesta.retryAfter || 60) * 1000
    );

    setAviso(
      'Código enviado. Utiliza el código del correo más reciente.'
    );

    codigoInput.current?.focus();
  }

  async function verificar(event) {
    event.preventDefault();

    const valor = correoValido();

    if (!valor) return;

    if (!/^\d{6}$/.test(codigo)) {
      setError('Escribe los 6 dígitos del código.');
      codigoInput.current?.focus();
      return;
    }

    const respuesta = await solicitar(
      'verificar',
      '/api/verificar-correo',
      {
        correo: valor,
        codigo,
      }
    );

    if (respuesta) {
      terminar(respuesta.message);
    } else {
      codigoInput.current?.focus();
    }
  }

  return (
    <section
      className="register-card email-card"
      aria-labelledby="email-title"
      aria-busy={Boolean(ocupado)}
    >
      <h2
        id="email-title"
        ref={titulo}
        tabIndex={-1}
      >
        {fase === 'resumen'
          ? 'Revisa y envía tu registro'
          : fase === 'listo'
            ? 'Correo verificado'
            : 'Verifica tu correo'}
      </h2>

      {fase === 'resumen' && (
        <>
          <p>
            Al confirmar se guardará tu solicitud y se enviará
            un código a tu correo de acceso.
          </p>

          <dl className="email-summary">
            <div>
              <dt>Establecimiento</dt>
              <dd>{form.nombreEstablecimiento}</dd>
            </div>

            <div>
              <dt>Correo de acceso</dt>
              <dd>{form.correo}</dd>
            </div>

            <div>
              <dt>Dirección</dt>
              <dd>{form.direccion}</dd>
            </div>
          </dl>

          <div className="account-notice">
            El establecimiento aparecerá en el Directorio
            cuando su revisión sea aprobada.
          </div>

          <div className="register-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={Boolean(ocupado)}
              onClick={onBack}
            >
              Atrás
            </button>

            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(ocupado)}
              onClick={registrar}
            >
              {ocupado === 'registro'
                ? 'Enviando registro…'
                : 'Registrar y enviar código'}
            </button>
          </div>

          {error && (
            <button
              type="button"
              className="email-link-button"
              disabled={Boolean(ocupado)}
              onClick={retomar}
            >
              Retomar verificación
            </button>
          )}
        </>
      )}

      {fase === 'codigo' && (
        <>
          <p>
            Introduce el código de seis dígitos que recibiste.
            Tiene una vigencia de 10 minutos.
          </p>

          <form noValidate onSubmit={verificar}>
            <div className="register-form-grid">
              <div className="form-field form-field-full">
                <label htmlFor="verify-email">
                  Correo del registro *
                </label>

                <input
                  id="verify-email"
                  ref={correoInput}
                  type="email"
                  value={correo}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={150}
                  readOnly={creada}
                  disabled={Boolean(ocupado)}
                  required
                  onChange={(event) => {
                    setCorreo(event.target.value);
                    setCodigo('');
                    setError('');
                    setAviso('');
                  }}
                />
              </div>

              <div className="form-field form-field-full">
                <label htmlFor="verify-code">
                  Código de verificación *
                </label>

                <input
                  id="verify-code"
                  ref={codigoInput}
                  className="email-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={codigo}
                  required
                  disabled={Boolean(ocupado)}
                  aria-describedby="verify-code-help"
                  onChange={(event) => {
                    setCodigo(
                      event.target.value
                        .replace(/\D/g, '')
                        .slice(0, 6)
                    );
                    setError('');
                  }}
                />

                <p
                  className="field-help"
                  id="verify-code-help"
                >
                  Si solicitas otro código, utiliza el del
                  correo más reciente.
                </p>
              </div>
            </div>

            <div className="register-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={reenviar}
                disabled={Boolean(ocupado) || espera > 0}
              >
                {ocupado === 'reenviar'
                  ? 'Enviando código…'
                  : espera > 0
                    ? `Reenviar en ${espera} s`
                    : 'Reenviar código'}
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={Boolean(ocupado)}
              >
                {ocupado === 'verificar'
                  ? 'Verificando…'
                  : 'Verificar correo'}
              </button>
            </div>
          </form>
        </>
      )}

      {fase === 'listo' && (
        <>
          <p>{aviso}</p>

          <div className="account-notice">
            La verificación del correo es independiente de
            la revisión del establecimiento. Solo los negocios
            aprobados aparecen en el Directorio.
          </div>

          <div className="register-actions">
            <Link
              to="/"
              className="btn btn-primary email-home"
            >
              Ir al inicio
            </Link>
          </div>
        </>
      )}

      {aviso && fase !== 'listo' && (
        <p className="email-status" role="status">
          {aviso}
        </p>
      )}

      {error && (
        <p className="email-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}