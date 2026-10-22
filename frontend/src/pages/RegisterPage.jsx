import { useState } from 'react';
import RegistrationAddress from '../components/RegistrationAddress';
import RegistrationVerification from '../components/RegistrationVerification';
import RegistrationAccount from '../components/RegistrationAccount';
import { useSearchParams } from 'react-router-dom';
import RegistrationEmailVerification from '../components/RegistrationEmailVerification';

export default function RegisterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [modoVerificacion, setModoVerificacion] = useState(
    () => searchParams.get('verificar') === '1' );
  const [step, setStep] = useState(
    () => searchParams.get('verificar') === '1' ? 5 : 1 );
  const [form, setForm] = useState({
    tipoServicio: '',
    nombreEstablecimiento: '',
    telefonoWhatsapp: '',
    correoContacto: '',
    direccion: '',
    codigoPostal: '',
    calle: '',
    numeroExterior: '',
    colonia: '',
    municipio: '',
    estado: '',
    direccionManual: false,
    descripcion: '',
    latitud: '',
    longitud: '',
    logo: null,
    nombreResponsable: '',
    cedulaProfesional: '',
    evidencia: null,
    correo: '',
    password: '',
    confirmarPassword: '',
  });

    const [logoPreview, setLogoPreview] = useState('');
    const [stepError, setStepError] = useState('');

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleLogo(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
        setStepError('El logo debe ser JPG, PNG o WEBP.');
        event.target.value = '';
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        setStepError('El logo no puede superar los 5 MB.');
        event.target.value = '';
        return;
    }

    setStepError('');

    setForm((current) => ({
        ...current,
        logo: file,
    }));

    setLogoPreview(URL.createObjectURL(file));
    }

    function goToStep3() {
    setStepError('');

    if (
        !form.nombreEstablecimiento.trim() ||
        !form.telefonoWhatsapp.trim() ||
        !form.correoContacto.trim() ||
        !form.direccion.trim() ||
        !form.codigoPostal.trim()
    ) {
        setStepError('Completa todos los campos obligatorios.');
        return;
    }

    if (!/^\d{10}$/.test(form.telefonoWhatsapp)) {
        setStepError(
        'El teléfono debe contener exactamente 10 dígitos.'
        );
        return;
    }

    if (!/^\d{5}$/.test(form.codigoPostal)) {
        setStepError(
        'El código postal debe contener exactamente 5 dígitos.'
        );
        return;
    }

    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.correoContacto
        )
    ) {
        setStepError('Ingresa un correo electrónico válido.');
        return;
    }

    if (!form.latitud || !form.longitud) {
      setStepError(
        'Confirma la ubicación del establecimiento en el mapa.'
      );
      return;
    }

    setStep(3);
    }

  function selectType(tipo) {
    setForm((current) => ({
      ...current,
      tipoServicio: tipo,
    }));
  }

  function goToStep2() {
    if (!form.tipoServicio) return;
    setStep(2);
  }

  return (
    <section className="register-page">
      <div className="container register-container">
        <div className="register-heading">
          <span className="eyebrow">Registro de establecimientos</span>
          <h1>Únete a VetStec</h1>
          <p>
            Registra tu veterinaria o estética canina para comenzar el proceso
            de verificación.
          </p>
        </div>

        <div className="register-progress">
          <span className={step >= 1 ? 'active' : ''}>1</span>
          <div />
          <span className={step >= 2 ? 'active' : ''}>2</span>
          <div />
          <span className={step >= 3 ? 'active' : ''}>3</span>
          <div />
          <span className={step >= 4 ? 'active' : ''}>4</span>
          <div />
          <span className={step >= 5 ? 'active' : ''}>5</span>
        </div>

        <p className="register-step-text">Paso {step} de 5</p>

        {step === 1 && (
          <div className="register-card">
            <h2>¿Qué tipo de establecimiento deseas registrar?</h2>
            <p>
              Selecciona la opción que describa mejor los servicios de tu
              negocio.
            </p>

            <div className="business-type-grid">
              <button
                type="button"
                className={`business-type-card ${
                  form.tipoServicio === 'VETERINARIA' ? 'selected' : ''
                }`}
                onClick={() => selectType('VETERINARIA')}
              >
                <span className="business-type-icon">🐾</span>
                <strong>Veterinaria</strong>
                <small>Servicios de atención veterinaria.</small>
              </button>

              <button
                type="button"
                className={`business-type-card ${
                  form.tipoServicio === 'ESTETICA' ? 'selected' : ''
                }`}
                onClick={() => selectType('ESTETICA')}
              >
                <span className="business-type-icon">✂️</span>
                <strong>Estética canina</strong>
                <small>Servicios de estética y cuidado canino.</small>
              </button>

              <button
                type="button"
                className={`business-type-card ${
                  form.tipoServicio === 'AMBAS' ? 'selected' : ''
                }`}
                onClick={() => selectType('AMBAS')}
              >
                <span className="business-type-icon">🐾</span>
                <strong>Veterinaria y estética</strong>
                <small>Ofrece ambos tipos de servicios.</small>
              </button>
            </div>

            <button
              type="button"
              className="email-link-button"
              onClick={() => {
                setStepError('');

                setSearchParams(
                  { verificar: '1' },
                  { replace: true }
                );

                setModoVerificacion(true);
                setStep(5);
              }}
            >
              Ya envié mi registro: verificar correo
            </button>

            <div className="register-actions register-actions-end">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!form.tipoServicio}
                onClick={goToStep2}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="register-card">
            <h2>Información del establecimiento</h2>
            <p>
              Estos datos permitirán identificar tu negocio y posteriormente
              mostrar la información autorizada en el Directorio.
            </p>

            <div className="register-form-grid">
              <label className="form-field form-field-full">
                <span>Nombre del establecimiento *</span>
                <input
                  type="text"
                  name="nombreEstablecimiento"
                  value={form.nombreEstablecimiento}
                  onChange={updateField}
                  placeholder="Ej. Clínica Veterinaria Huellitas"
                />
              </label>

              <label className="form-field">
                <span>Teléfono / WhatsApp *</span>
                <input
                  type="tel"
                  name="telefonoWhatsapp"
                  value={form.telefonoWhatsapp}
                  onChange={updateField}
                  placeholder="5512345678"
                  maxLength="10"
                />
              </label>

              <label className="form-field">
                <span>Correo de contacto *</span>
                <input
                  type="email"
                  name="correoContacto"
                  value={form.correoContacto}
                  onChange={updateField}
                  placeholder="contacto@negocio.com"
                />
              </label>

              <RegistrationAddress
                form={form}
                setForm={setForm}
                clearError={() => setStepError('')}
              />

                <label className="form-field form-field-full">
                    <span>Logo del establecimiento (opcional)</span>

                    <p className="field-help">
                        Si cuentas con un logo, puedes subirlo para que tus
                        clientes identifiquen fácilmente tu establecimiento en
                        el Directorio.
                    </p>

                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleLogo}
                    />

                    {logoPreview && (
                        <div className="logo-preview">
                        <img
                            src={logoPreview}
                            alt="Vista previa del logo"
                        />

                        <div>
                            <strong>Vista previa</strong>
                            <small>{form.logo?.name}</small>
                        </div>
                        </div>
                    )}
                </label>

              <label className="form-field form-field-full">
                <span>Descripción del establecimiento (opcional)</span>
                <textarea
                  name="descripcion"
                  value={form.descripcion}
                  onChange={updateField}
                  rows="4"
                  placeholder="Puedes mencionar brevemente los servicios que ofrece tu establecimiento."
                />
              </label>
            </div>

            {stepError && (
            <div className="register-error">
                {stepError}
            </div>
            )}

            <div className="register-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(1)}
              >
                Atrás
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={goToStep3}
                >
                Continuar
             </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <RegistrationVerification
            form={form}
            setForm={setForm}
            onBack={() => {
              setStepError('');
              setStep(2);
            }}
            onContinue={() => {
              setStepError('');
              setStep(4);
            }}
          />
        )}

        {step === 4 && (
          <RegistrationAccount
            form={form}
            setForm={setForm}
            onBack={() => {
              setStepError('');
              setStep(3);
            }}
            onContinue={() => {
              setStepError('');
              setStep(5);
            }}
          />
        )}

        {step === 5 && (
          <RegistrationEmailVerification
            form={form}
            setForm={setForm}
            modoVerificacion={modoVerificacion}
            onBack={() => {
              setStepError('');
              setSearchParams({}, { replace: true });
              setStep(4);
            }}
          />
        )}

      </div>
    </section>
  );
}