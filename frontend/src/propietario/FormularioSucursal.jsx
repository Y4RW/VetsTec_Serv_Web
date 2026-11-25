import { useEffect, useRef, useState } from 'react';
import RegistrationAddress from '../components/RegistrationAddress';
import RegistrationVerification from '../components/RegistrationVerification';

const nombres = {
  VETERINARIA: 'Veterinaria',
  ESTETICA: 'Estética canina',
  AMBAS: 'Veterinaria y estética',
};

const opcionesTipo = [
  { id: 'VETERINARIA', icono: '🩺', titulo: 'Veterinaria', desc: 'Consultas médicas, vacunas, cirugía y urgencias.' },
  { id: 'ESTETICA', icono: '✂️', titulo: 'Estética canina', desc: 'Baño, corte, higiene y cuidado estético.' },
  { id: 'AMBAS', icono: '🐾', titulo: 'Veterinaria y estética', desc: 'Atención médica veterinaria y estética integral.' },
];

const campos = ['nombreEstablecimiento', 'tipoServicio', 'telefonoWhatsapp', 'correoContacto',
  'direccion', 'codigoPostal', 'descripcion', 'latitud', 'longitud', 'nombreResponsable', 'cedulaProfesional'];

export default function FormularioSucursal({ onCancelar, onCreada, onGuardando }) {
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState({
    tipoServicio: '', nombreEstablecimiento: '', telefonoWhatsapp: '', correoContacto: '',
    direccion: '', codigoPostal: '', calle: '', numeroExterior: '', colonia: '', municipio: '',
    estado: '', direccionManual: false, descripcion: '', latitud: '', longitud: '',
    logo: null, evidencia: null, nombreResponsable: '', cedulaProfesional: '',
  });
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const titulo = useRef(null);
  const peticion = useRef(null);
  const montado = useRef(false);
  const enviando = useRef(false);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; peticion.current?.abort(); };
  }, []);

  useEffect(() => { titulo.current?.focus(); }, [paso]);

  useEffect(() => {
    if (!form.logo) { setPreview(''); return; }
    const url = URL.createObjectURL(form.logo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form.logo]);

  function cambiar(e) {
    const { name, value } = e.target;
    setError('');
    setForm(actual => ({
      ...actual,
      [name]: value,
      ...(name === 'tipoServicio' ? { nombreResponsable: '', cedulaProfesional: '', evidencia: null } : {}),
    }));
  }

  function seleccionarTipo(valor) {
    setError('');
    setForm(actual => ({
      ...actual,
      tipoServicio: valor,
      ...(actual.tipoServicio !== valor ? { nombreResponsable: '', cedulaProfesional: '', evidencia: null } : {}),
    }));
  }

  function logo(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type) ||
        archivo.size === 0 || archivo.size > 5 * 1024 * 1024) {
      setError('Elige un logo JPG, PNG o WEBP de hasta 5 MB, que no esté vacío.');
      e.target.value = '';
      return;
    }
    setError('');
    setForm(actual => ({ ...actual, logo: archivo }));
  }

  function continuar(e) {
    e.preventDefault();
    if (!form.tipoServicio) {
      setError('Selecciona el tipo de establecimiento para continuar.');
      return;
    }
    if (!/^\d{10}$/.test(form.telefonoWhatsapp) || !/^\d{5}$/.test(form.codigoPostal) || !form.direccion) {
      setError('Completa el teléfono de 10 dígitos y la dirección con su código postal de 5 dígitos.');
      return;
    }
    if ([form.latitud, form.longitud].some(v => v === '' || v == null || !Number.isFinite(Number(v)))) {
      setError('Confirma la ubicación de esta sucursal en el mapa.');
      return;
    }
    setError('');
    setPaso(2);
  }

  async function registrar(e) {
    e.preventDefault();
    if (enviando.current) return;
    enviando.current = true;
    setGuardando(true);
    onGuardando(true);
    setError('');
    const controller = new AbortController();
    peticion.current = controller;
    try {
      const body = new FormData();
      for (const campo of campos) body.append(campo, String(form[campo] ?? '').trim());
      if (form.logo) body.append('logo', form.logo);
      if (form.evidencia) body.append('evidencia', form.evidencia);
      const respuesta = await fetch('/api/propietario/sucursales', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-Requested-With': 'VetStec' }, body, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (respuesta.status === 401) {
        window.dispatchEvent(new Event('vetstec:sesion-vencida'));
        throw new Error('Tu sesión terminó. Inicia sesión nuevamente.');
      }
      const json = await respuesta.json().catch(() => null);
      if (!respuesta.ok || json?.success !== true || !json.data?.id) {
        throw new Error(json?.message || 'No se pudo confirmar el registro. Revisa Mis sucursales antes de reintentar.');
      }
      if (montado.current) onCreada(json.data);
    } catch (fallo) {
      if (montado.current && !controller.signal.aborted) {
        setError(fallo instanceof TypeError
          ? 'Se perdió la conexión. Revisa tus sucursales antes de volver a registrar.'
          : fallo.message);
      }
    } finally {
      enviando.current = false;
      if (montado.current) { setGuardando(false); onGuardando(false); }
    }
  }

  return (
    <section className="owner-create own-workspace" aria-labelledby="sucursal-nueva-titulo">
      <div className="own-workspace-header">
        <div>
          <span className="own-eyebrow">Alta de establecimiento · Paso {paso} de 3</span>
          <h3 id="sucursal-nueva-titulo" ref={titulo} tabIndex={-1}>
            Registrar nueva sucursal
          </h3>
          <p className="own-workspace-address">
            Quedará vinculada a tu red actual. El equipo de VetStec validará la información antes de publicarla.
          </p>
        </div>
        <button
          type="button"
          className="own-btn own-btn-secondary"
          onClick={onCancelar}
          disabled={guardando}
        >
          ← Volver a mis sucursales
        </button>
      </div>

      <div className="own-stepper" aria-label={`Progreso: paso ${paso} de 3`}>
        {[
          [1, 'Datos y ubicación'],
          [2, 'Verificación'],
          [3, 'Confirmación'],
        ].map(([num, etiqueta], i) => (
          <div className="own-stepper-group" key={num}>
            <div className={`own-stepper-item ${paso === num ? 'is-current' : paso > num ? 'is-done' : ''}`}>
              <span className="own-stepper-circle">{paso > num ? '✓' : num}</span>
              <span className="own-stepper-label">{etiqueta}</span>
            </div>
            {i < 2 && <span className={`own-stepper-line ${paso > num ? 'is-done' : ''}`} aria-hidden="true" />}
          </div>
        ))}
      </div>

      {paso === 1 && (
        <form className="own-form-panel" onSubmit={continuar}>
          <div className="register-form-grid">
            <div className="form-field form-field-full">
              <span>Tipo de establecimiento *</span>
              <div className="own-type-selector" role="radiogroup" aria-label="Tipo de establecimiento">
                {opcionesTipo.map(op => {
                  const activo = form.tipoServicio === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      className={`own-type-option ${activo ? 'is-selected' : ''}`}
                      onClick={() => seleccionarTipo(op.id)}
                    >
                      <span className="own-type-option-icon" aria-hidden="true">{op.icono}</span>
                      <strong>{op.titulo}</strong>
                      <small>{op.desc}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="form-field form-field-full">
              <span>Nombre de la sucursal *</span>
              <input
                name="nombreEstablecimiento"
                value={form.nombreEstablecimiento}
                onChange={cambiar}
                maxLength={150}
                required
                placeholder="Ej. Veterinaria Huellitas · Sucursal Norte"
              />
            </label>

            <label className="form-field">
              <span>Teléfono / WhatsApp (10 dígitos) *</span>
              <input
                type="tel"
                name="telefonoWhatsapp"
                value={form.telefonoWhatsapp}
                onChange={cambiar}
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                required
                autoComplete="tel-national"
                placeholder="Ej. 5512345678"
              />
            </label>

            <label className="form-field">
              <span>Correo de atención de la sucursal *</span>
              <input
                type="email"
                name="correoContacto"
                value={form.correoContacto}
                onChange={cambiar}
                maxLength={150}
                required
                autoComplete="email"
                placeholder="contacto@tuveterinaria.com"
              />
            </label>

            <RegistrationAddress form={form} setForm={setForm} clearError={() => setError('')} />

            <label className="form-field form-field-full">
              <span>Logotipo de la sucursal (opcional)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={logo} />
              <small className="own-field-hint">Formatos permitidos: JPG, PNG o WEBP (hasta 5 MB).</small>
            </label>

            {preview && (
              <div className="owner-logo-preview form-field-full">
                <img src={preview} alt="Vista previa del logo de la sucursal" />
                <span>{form.logo.name}</span>
                <button
                  type="button"
                  className="own-btn own-btn-sm own-btn-secondary"
                  onClick={() => setForm(actual => ({ ...actual, logo: null }))}
                >
                  Quitar logo
                </button>
              </div>
            )}

            <label className="form-field form-field-full">
              <span>Descripción pública (opcional)</span>
              <textarea
                name="descripcion"
                value={form.descripcion}
                onChange={cambiar}
                maxLength={2000}
                rows={4}
                placeholder="Comparte los servicios principales, especialidades o referencias para llegar…"
              />
            </label>
          </div>

          {error && <p className="own-alert own-alert-danger" role="alert" style={{ marginTop: 18 }}>{error}</p>}

          <div className="own-form-footer">
            <button type="button" className="own-btn own-btn-secondary" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="own-btn own-btn-primary">
              Continuar al paso 2 →
            </button>
          </div>
        </form>
      )}

      {paso === 2 && (
        <RegistrationVerification
          form={form}
          setForm={setForm}
          onBack={() => setPaso(1)}
          onContinue={() => { setError(''); setPaso(3); }}
        />
      )}

      {paso === 3 && (
        <form className="own-form-panel" onSubmit={registrar} aria-busy={guardando}>
          <h4 className="own-fieldset-legend">Revisa y confirma la información</h4>

          <dl className="own-detail-list own-detail-grid-2">
            {[
              ['Nombre de la sucursal', form.nombreEstablecimiento],
              ['Categoría', nombres[form.tipoServicio]],
              ['Teléfono / WhatsApp', form.telefonoWhatsapp],
              ['Correo de contacto', form.correoContacto],
              ['Dirección postal', form.direccion],
              ['Coordenadas en mapa', `${Number(form.latitud).toFixed(5)}, ${Number(form.longitud).toFixed(5)}`],
              ['Responsable veterinario', form.nombreResponsable || 'No aplica'],
              ['Cédula profesional', form.cedulaProfesional || 'No aplica'],
              ['Evidencia fotográfica', form.evidencia?.name || 'No adjuntada'],
              ['Logotipo', form.logo?.name || 'No adjuntado'],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt>{etiqueta}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>

          <div className="own-alert own-alert-info" style={{ marginTop: 18 }}>
            <span>
              ℹ️ Al enviar esta solicitud quedará en estado <strong>En revisión</strong>. La aprobación de otras sucursales no se transfiere automáticamente.
            </span>
          </div>

          {error && <p className="own-alert own-alert-danger" role="alert">{error}</p>}

          {guardando && (
            <div className="own-loading-card" role="status">
              <span className="own-spinner" aria-hidden="true" />
              <span>Enviando solicitud y archivos adjuntos…</span>
            </div>
          )}

          <div className="own-form-footer">
            <button
              type="button"
              className="own-btn own-btn-secondary"
              disabled={guardando}
              onClick={() => setPaso(2)}
            >
              ← Volver al paso 2
            </button>
            <button type="submit" className="own-btn own-btn-primary" disabled={guardando}>
              {guardando ? 'Registrando sucursal…' : '✓ Confirmar y registrar sucursal'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}