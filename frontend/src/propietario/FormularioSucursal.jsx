import { useEffect, useRef, useState } from 'react';
import RegistrationAddress from '../components/RegistrationAddress';
import RegistrationVerification from '../components/RegistrationVerification';

const nombres = { VETERINARIA: 'Veterinaria', ESTETICA: 'Estética canina', AMBAS: 'Veterinaria y estética' };
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
    setForm(actual => ({ ...actual, [name]: value,
      ...(name === 'tipoServicio' ? { nombreResponsable: '', cedulaProfesional: '', evidencia: null } : {}),
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
          ? 'Se perdió la conexión. Revisa Mis sucursales antes de volver a registrar.' : fallo.message);
      }
    } finally {
      enviando.current = false;
      if (montado.current) { setGuardando(false); onGuardando(false); }
    }
  }

  return <section className="owner-create" aria-labelledby="sucursal-nueva-titulo">
    <div className="owner-create-heading">
      <div>
        <p className="owner-kicker">Nueva sucursal · Paso {paso} de 3</p>
        <h3 id="sucursal-nueva-titulo" ref={titulo} tabIndex={-1}>Agregar sucursal</h3>
        <p>Administrarás esta sucursal con tu cuenta actual. VetStec revisará su información antes de publicarla.</p>
      </div>
      <button type="button" className="button button-secondary" onClick={onCancelar} disabled={guardando}>
        Volver a mis sucursales
      </button>
    </div>
    {paso === 1 && <form className="register-card" onSubmit={continuar}>
      <div className="register-form-grid">
        <label className="form-field form-field-full"><span>Tipo de establecimiento *</span>
          <select name="tipoServicio" value={form.tipoServicio} onChange={cambiar} required>
            <option value="">Selecciona una opción</option>
            {Object.entries(nombres).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
          </select>
        </label>
        <label className="form-field form-field-full"><span>Nombre de la sucursal *</span>
          <input name="nombreEstablecimiento" value={form.nombreEstablecimiento} onChange={cambiar}
            maxLength={150} required placeholder="Ej. Veterinaria Huellitas · Sucursal Centro" />
        </label>
        <label className="form-field"><span>Teléfono / WhatsApp *</span>
          <input type="tel" name="telefonoWhatsapp" value={form.telefonoWhatsapp} onChange={cambiar}
            inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required autoComplete="tel-national" />
        </label>
        <label className="form-field"><span>Correo de contacto de la sucursal *</span>
          <input type="email" name="correoContacto" value={form.correoContacto} onChange={cambiar}
            maxLength={150} required autoComplete="email" />
        </label>
        <RegistrationAddress form={form} setForm={setForm} clearError={() => setError('')} />
        <label className="form-field form-field-full"><span>Logo (opcional)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={logo} />
          <small>JPG, PNG o WEBP, hasta 5 MB.</small>
        </label>
        {preview && <div className="owner-logo-preview form-field-full">
          <img src={preview} alt="Vista previa del logo de la sucursal" />
          <span>{form.logo.name}</span>
          <button type="button" className="button button-secondary"
            onClick={() => setForm(actual => ({ ...actual, logo: null }))}>Quitar logo</button>
        </div>}
        <label className="form-field form-field-full"><span>Descripción (opcional)</span>
          <textarea name="descripcion" value={form.descripcion} onChange={cambiar} maxLength={2000} rows={4} />
        </label>
      </div>
      {error && <p className="owner-error" role="alert">{error}</p>}
      <div className="register-actions register-actions-end">
        <button type="submit" className="button button-primary">Continuar</button>
      </div>
    </form>}
    {paso === 2 && <RegistrationVerification form={form} setForm={setForm}
      onBack={() => setPaso(1)} onContinue={() => { setError(''); setPaso(3); }} />}
    {paso === 3 && <form className="register-card" onSubmit={registrar} aria-busy={guardando}>
      <h4>Confirma los datos de tu sucursal</h4>
      <dl className="owner-facts">
        {[
          ['Nombre', form.nombreEstablecimiento], ['Tipo', nombres[form.tipoServicio]],
          ['Teléfono', form.telefonoWhatsapp], ['Correo de contacto', form.correoContacto],
          ['Dirección', form.direccion], ['Ubicación', `${form.latitud}, ${form.longitud}`],
          ['Responsable veterinario', form.nombreResponsable || 'No corresponde'],
          ['Cédula profesional', form.cedulaProfesional || 'No corresponde'],
          ['Fotografía', form.evidencia?.name || 'No adjuntada'], ['Logo', form.logo?.name || 'No adjuntado'],
        ].map(([etiqueta, valor]) => <div key={etiqueta}><dt>{etiqueta}</dt><dd>{valor}</dd></div>)}
      </dl>
      <p className="owner-note">La solicitud quedará pendiente de revisión. La aprobación de tu sucursal principal no se transfiere a esta nueva sucursal.</p>
      {error && <p className="owner-error" role="alert">{error}</p>}
      {guardando && <p role="status">Enviando información y archivos…</p>}
      <div className="register-actions">
        <button type="button" className="button button-secondary" disabled={guardando} onClick={() => setPaso(2)}>Atrás</button>
        <button type="submit" className="button button-primary" disabled={guardando}>
          {guardando ? 'Registrando…' : 'Registrar sucursal'}
        </button>
      </div>
    </form>}
  </section>;
}