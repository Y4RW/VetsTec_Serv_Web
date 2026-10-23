import { useCallback, useEffect, useRef, useState } from 'react';
import RegistrationAddress from '../components/RegistrationAddress';
import MapPicker from '../components/MapPicker';

const nombres = { VETERINARIA: 'Veterinaria', ESTETICA: 'Estética canina', AMBAS: 'Veterinaria y estética' };
const campos = ['nombreEstablecimiento', 'tipoServicio', 'telefonoWhatsapp', 'correoContacto',
  'descripcion', 'direccion', 'codigoPostal', 'latitud', 'longitud', 'nombreResponsable', 'cedulaProfesional'];
const camposDireccion = ['direccion', 'codigoPostal', 'latitud', 'longitud', 'calle',
  'numeroExterior', 'colonia', 'municipio', 'estado', 'direccionManual'];
const texto = valor => String(valor ?? '').trim();
const coordenada = valor => valor == null || valor === '' ? null : Number(Number(valor).toFixed(6));

function formularioDe(datos) {
  return {
    nombreEstablecimiento: datos.nombre_establecimiento || '', tipoServicio: datos.tipo_servicio || '',
    telefonoWhatsapp: datos.telefono_whatsapp || '', correoContacto: datos.correo_contacto || '',
    descripcion: datos.descripcion || '', direccion: datos.direccion || '', codigoPostal: datos.codigo_postal || '',
    latitud: datos.latitud ?? '', longitud: datos.longitud ?? '', nombreResponsable: datos.nombre_responsable || '',
    cedulaProfesional: datos.cedula_profesional || '', evidencia: null,
    calle: '', numeroExterior: '', colonia: '', municipio: '', estado: '', direccionManual: false,
  };
}

export default function EditarSucursal({ idSucursal, onCancelar, onGuardada, onGuardando }) {
  const [actual, setActual] = useState(null);
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [conflicto, setConflicto] = useState(false);
  const [guardadoIncierto, setGuardadoIncierto] = useState(false);
  const [editandoDireccion, setEditandoDireccion] = useState(false);
  const [mapa, setMapa] = useState(null);
  const [preview, setPreview] = useState('');
  const titulo = useRef(null);
  const peticion = useRef(null);
  const montado = useRef(false);
  const enviando = useRef(false);
  const direccionAnterior = useRef(null);
  const fotoInput = useRef(null);

  const cargar = useCallback(async () => {
    peticion.current?.abort();
    const controller = new AbortController();
    peticion.current = controller;
    setCargando(true);
    setError('');
    setConflicto(false);
    setGuardadoIncierto(false);
    setMapa(null);
    try {
      const respuesta = await fetch(`/api/propietario/sucursales/${idSucursal}`, {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (respuesta.status === 401) window.dispatchEvent(new Event('vetstec:sesion-vencida'));
      const json = await respuesta.json().catch(() => null);
      controller.signal.throwIfAborted();
      if (!respuesta.ok || json?.success !== true || !json.data?.version || json.data.id !== idSucursal) {
        throw new Error(json?.message || 'No fue posible abrir los datos de esta sucursal.');
      }
      if (montado.current && peticion.current === controller) {
        setActual(json.data); setForm(formularioDe(json.data)); setEditandoDireccion(false);
      }
    } catch (fallo) {
      if (montado.current && !controller.signal.aborted && peticion.current === controller) {
        setActual(null); setForm(null); setError(fallo.message);
      }
    } finally {
      if (montado.current && !controller.signal.aborted && peticion.current === controller) setCargando(false);
    }
  }, [idSucursal]);

  useEffect(() => {
    montado.current = true;
    titulo.current?.focus();
    cargar();
    return () => { montado.current = false; peticion.current?.abort(); };
  }, [cargar]);
  useEffect(() => {
    if (!form?.evidencia) { setPreview(''); return; }
    const url = URL.createObjectURL(form.evidencia);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form?.evidencia]);

  function cambiar(e) {
    const { name, value } = e.target;
    setError('');
    setForm(anterior => ({ ...anterior, [name]: value,
      ...(name === 'tipoServicio' ? { evidencia: null } : {}),
    }));
  }

  function cambiarDireccion() {
    direccionAnterior.current = Object.fromEntries(camposDireccion.map(campo => [campo, form[campo]]));
    setForm(anterior => ({ ...anterior, direccion: '', latitud: '', longitud: '', calle: '',
      numeroExterior: '', colonia: '', municipio: '', estado: '', direccionManual: false }));
    setEditandoDireccion(true); setError('');
  }

  function conservarDireccion() {
    setForm(anterior => ({ ...anterior, ...direccionAnterior.current }));
    setEditandoDireccion(false); setError('');
  }

  function seleccionarFoto(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type) ||
        archivo.size === 0 || archivo.size > 5 * 1024 * 1024) {
      setError('Selecciona una fotografía JPG, PNG o WEBP de hasta 5 MB, que no esté vacía.');
      setForm(anterior => ({ ...anterior, evidencia: null }));
      e.target.value = ''; return;
    }
    setForm(anterior => ({ ...anterior, evidencia: archivo })); setError('');
  }

  const identidadCambiada = Boolean(actual && form && (
    texto(actual.nombre_establecimiento) !== texto(form.nombreEstablecimiento) ||
    actual.tipo_servicio !== form.tipoServicio || texto(actual.direccion) !== texto(form.direccion) ||
    texto(actual.codigo_postal) !== texto(form.codigoPostal) ||
    coordenada(actual.latitud) !== coordenada(form.latitud) || coordenada(actual.longitud) !== coordenada(form.longitud)
  ));
  const esVeterinaria = ['VETERINARIA', 'AMBAS'].includes(form?.tipoServicio);
  const requisitosCambiados = Boolean(actual && form && (
    (esVeterinaria && (texto(actual.nombre_responsable) !== texto(form.nombreResponsable) ||
      texto(actual.cedula_profesional) !== texto(form.cedulaProfesional))) || form.evidencia
  ));
  const requiereRevision = identidadCambiada || requisitosCambiados || actual?.estado === 'RECHAZADO';
  const requiereFoto = form?.tipoServicio === 'ESTETICA' && (identidadCambiada || !actual?.tiene_evidencia);
  const suspendida = actual?.estado === 'SUSPENDIDO';
  const requiereRecarga = conflicto || guardadoIncierto;

  async function guardar(e) {
    e.preventDefault();
    if (enviando.current || suspendida || requiereRecarga) return;
    if (!form.nombreEstablecimiento.trim() || !/^\d{10}$/.test(form.telefonoWhatsapp) ||
        !/^\d{5}$/.test(form.codigoPostal) || !form.direccion.trim()) {
      setError('Completa nombre, teléfono de 10 dígitos y dirección con código postal de 5 dígitos.'); return;
    }
    if (
        [[form.latitud, 90], [form.longitud, 180]].some(
          ([valor, maximo]) =>
            !texto(valor) ||
            !Number.isFinite(Number(valor)) ||
            Math.abs(Number(valor)) > maximo
        )
      ) {
    setError('Confirma la ubicación de la sucursal en el mapa.');
    return;
    }
    if (esVeterinaria && (!form.nombreResponsable.trim() || !/^\d{1,30}$/.test(form.cedulaProfesional.trim()))) {
      setError('Indica el profesional responsable y su cédula de hasta 30 dígitos.'); return;
    }
    if (requiereFoto && !form.evidencia) {
      setError('Adjunta una fotografía actual de la estética para revisar los cambios.'); return;
    }
    enviando.current = true; setGuardando(true); onGuardando(true); setError('');
    const controller = new AbortController();
    peticion.current = controller;
    let respuestaDefinitiva = false;
    
    try {
      const body = new FormData();
      for (const campo of campos) body.append(campo, texto(form[campo]));
      body.append('version', actual.version);
      if (form.evidencia) body.append('evidencia', form.evidencia);
      const respuesta = await fetch(`/api/propietario/sucursales/${idSucursal}`, {
        method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-Requested-With': 'VetStec' }, body, signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (respuesta.status === 401) window.dispatchEvent(new Event('vetstec:sesion-vencida'));
      const json = await respuesta.json().catch(() => null);
      controller.signal.throwIfAborted();
      respuestaDefinitiva =
        !respuesta.ok &&
        respuesta.status >= 400 &&
        respuesta.status < 500 &&
        respuesta.status !== 408 &&
        json?.success === false;
      
      if (
        !respuesta.ok ||
        json?.success !== true ||
        json.data?.id !== idSucursal ||
        typeof json.data?.version !== 'string' ||
        !/^[a-f0-9]{64}$/.test(json.data.version)
      ) {
        if (
          respuesta.status === 409 &&
          json?.code === 'VERSION_ANTIGUA' &&
          montado.current
        ) {
          setConflicto(true);
        }
      
        throw new Error(
          json?.message ||
          'No se pudo confirmar el guardado. Actualiza los datos antes de reintentar.'
        );
      }
      
      respuestaDefinitiva = true;
      if (montado.current) {
        onGuardada(json.data);
      }
      if (montado.current) onGuardada(json.data);
    } catch (fallo) {
    if (montado.current && !controller.signal.aborted) {
      setGuardadoIncierto(!respuestaDefinitiva);
  
      setError(
        !respuestaDefinitiva
          ? 'No pudimos confirmar si los cambios se guardaron. Carga los datos actuales antes de volver a guardar.'
          : fallo.message
      );
    }
  } finally {
        enviando.current = false;
        if (montado.current) { setGuardando(false); onGuardando(false); }
      }
    }
  return <section className="owner-create owner-edit" aria-labelledby="sucursal-editar-titulo">
    <div className="owner-create-heading">
      <div>
        <p className="owner-kicker">Sucursal #{idSucursal}</p>
        <h3 id="sucursal-editar-titulo" ref={titulo} tabIndex={-1}>Editar sucursal</h3>
        <p>Los cambios se guardarán únicamente en esta sucursal.</p>
      </div>
      <button type="button" className="button button-secondary" onClick={onCancelar} disabled={guardando}>
        Cancelar edición
      </button>
    </div>
    {cargando && <p role="status">Abriendo datos actuales…</p>}
    {error && <p className="owner-error" role="alert">{error}</p>}
    {!cargando && (!form || requiereRecarga) && (
      <div className="owner-edit-reload">
        {requiereRecarga && (
          <p>
            Cargar la versión actual reemplaza este formulario con los datos
            guardados. Copia antes cualquier cambio que quieras conservar.
          </p>
        )}
    
        <button
          type="button"
          className="button button-secondary"
          disabled={guardando}
          onClick={cargar}
        >
          Cargar datos actuales
        </button>
      </div>
    )}
    {!cargando && form && <form className="register-card" onSubmit={guardar} aria-busy={guardando}>
      <p className="owner-edit-notice" role="status">
        {suspendida ? 'Esta sucursal está suspendida. Contacta a VetStec para revisar su situación.' : requiereRevision
          ? 'Al guardar los cambios, la sucursal quedará pendiente de revisión y no aparecerá en el directorio hasta su aprobación.'
          : 'Cambiar teléfono, correo de contacto o descripción conserva el estado de revisión. Cambiar nombre, dirección, mapa, tipo o requisitos necesita una nueva revisión.'}
      </p>
      {actual.motivo_rechazo && <p className="owner-error"><strong>Motivo del rechazo:</strong> {actual.motivo_rechazo}</p>}
      <fieldset className="owner-edit-fields" disabled={guardando || suspendida || conflicto}>
        <legend className="owner-edit-legend">Datos de la sucursal</legend>
        <div className="register-form-grid">
          <label className="form-field form-field-full"><span>Nombre de la sucursal *</span>
            <input name="nombreEstablecimiento" value={form.nombreEstablecimiento} onChange={cambiar} maxLength={150} required />
          </label>
          <label className="form-field form-field-full"><span>Tipo de establecimiento *</span>
            <select name="tipoServicio" value={form.tipoServicio} onChange={cambiar} required>
              {Object.entries(nombres).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Teléfono / WhatsApp *</span>
            <input type="tel" name="telefonoWhatsapp" value={form.telefonoWhatsapp} onChange={cambiar}
              pattern="[0-9]{10}" inputMode="numeric" maxLength={10} required />
          </label>
          <label className="form-field"><span>Correo de contacto *</span>
            <input type="email" name="correoContacto" value={form.correoContacto} onChange={cambiar} maxLength={150} required />
          </label>
          <label className="form-field form-field-full"><span>Descripción</span>
            <textarea name="descripcion" value={form.descripcion} onChange={cambiar} maxLength={2000} rows={4} />
          </label>
          <div className="form-field-full owner-edit-address">
            <h4>Dirección y ubicación</h4>
            {editandoDireccion ? <>
              <p>Completa la nueva dirección y confirma su punto en el mapa.</p>
              <button type="button" className="button button-secondary" onClick={conservarDireccion}>Conservar dirección anterior</button>
            </> : <>
              <p>{form.direccion || 'Sin dirección registrada'}</p>
              <p>Código postal: {form.codigoPostal || '—'} · Ubicación: {form.latitud === '' ? '—' : form.latitud}, {form.longitud === '' ? '—' : form.longitud}</p>
              <div className="owner-edit-actions">
                <button type="button" className="button button-secondary" onClick={cambiarDireccion}>Cambiar dirección</button>
                <button type="button" className="button button-secondary" disabled={!form.direccion}
                  onClick={() => setMapa({ direccion: form.direccion, latitud: form.latitud, longitud: form.longitud })}>
                  Ajustar punto en el mapa
                </button>
              </div>
            </>}
          </div>
          {editandoDireccion && <RegistrationAddress form={form} setForm={setForm} clearError={() => setError('')} />}
          {esVeterinaria && <>
            <label className="form-field"><span>Profesional responsable *</span>
              <input name="nombreResponsable" value={form.nombreResponsable} onChange={cambiar} maxLength={150} required />
            </label>
            <label className="form-field"><span>Cédula profesional *</span>
              <input name="cedulaProfesional" value={form.cedulaProfesional} onChange={cambiar}
                inputMode="numeric" pattern="[0-9]{1,30}" maxLength={30} required />
            </label>
          </>}
          {form.tipoServicio === 'ESTETICA' && <label className="form-field form-field-full">
            <span>{requiereFoto ? 'Fotografía actual de la estética *' : 'Actualizar fotografía (opcional)'}</span>
            <small>{actual.tiene_evidencia ? 'Ya hay una fotografía registrada. ' : ''}
              Si cambias el nombre, tipo o ubicación, adjunta una fotografía actual. JPG, PNG o WEBP, hasta 5 MB.</small>
            <input ref={fotoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={seleccionarFoto} />
          </label>}
          {form.evidencia && preview && <div className="owner-edit-photo form-field-full">
            <img src={preview} alt="Nueva fotografía de la estética" /><span>{form.evidencia.name}</span>
            <button type="button" className="button button-secondary" onClick={() => {
              setForm(anterior => ({ ...anterior, evidencia: null }));
              if (fotoInput.current) fotoInput.current.value = '';
            }}>Quitar fotografía nueva</button>
          </div>}
        </div>
        <div className="register-actions">
          <button type="button" className="button button-secondary" onClick={onCancelar}>Cancelar edición</button>
          <button type="submit" className="button button-primary">
            {guardando ? 'Guardando…' : requiereRevision ? 'Guardar y enviar a revisión' : 'Guardar cambios'}
          </button>
        </div>
      </fieldset>
    </form>}
    {mapa && <MapPicker initialLat={mapa.latitud} initialLng={mapa.longitud}
      onClose={() => setMapa(null)} onConfirm={({ latitud, longitud }) => {
        setForm(anterior => anterior.direccion === mapa.direccion ? { ...anterior, latitud, longitud } : anterior);
        setMapa(null); setError('');
      }} />}
  </section>;
}
