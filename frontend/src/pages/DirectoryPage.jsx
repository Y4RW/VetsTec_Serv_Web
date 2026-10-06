import { useEffect, useMemo, useState } from 'react';

/* =========================================================
   UTILIDADES
   ========================================================= */

function formatBusinessType(type) {
  if (type === 'VETERINARIA') {
    return 'Veterinaria';
  }

  if (type === 'ESTETICA') {
    return 'Estética';
  }

  if (type === 'AMBAS') {
    return 'Ambas';
  }

  return type || 'Sin especificar';
}

function formatTime(time) {
  if (!time) {
    return '';
  }

  return time.slice(0, 5);
}

function buildSchedule(horarios = []) {
  const openDays = horarios.filter(
    (day) => !day.cerrado
  );

  if (openDays.length === 0) {
    return 'Horario no disponible';
  }

  const first = openDays[0];

  return `${formatTime(
    first.hora_apertura
  )} - ${formatTime(first.hora_cierre)}`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);

  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function statusText(status) {
  if (status === 'available') {
    return 'Disponible';
  }

  if (status === 'limited') {
    return 'Pocos espacios';
  }

  return 'Sin disponibilidad';
}

/* =========================================================
   COMPONENTE
   ========================================================= */

export default function DirectoryPage() {
  const [establishments, setEstablishments] =
    useState([]);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] =
    useState('');

  const [search, setSearch] = useState('');

  const [type, setType] = useState('Todas');

  const [
    selectedEstablishment,
    setSelectedEstablishment,
  ] = useState(null);

  const [availability, setAvailability] = 
    useState([]);

  const [availabilityLoading, setAvailabilityLoading] =
    useState(false);

  const [availabilityError, setAvailabilityError] =
    useState('');

  const [selectedDay, setSelectedDay] =
    useState(null);

  const [selectedTime, setSelectedTime] =
    useState('');

  const [petName, setPetName] = useState('');

  const [phone, setPhone] = useState('');

  const [formError, setFormError] =
    useState('');

  const [requestSent, setRequestSent] =
    useState(false);

  const [requestSending, setRequestSending] =
  useState(false);

  /* =========================================================
     CARGAR DIRECTORIO DESDE NODE.JS
     ========================================================= */

  async function loadEstablishments() {
    try {
      setLoading(true);
      setLoadError('');

      const response = await fetch(
        '/api/establecimientos'
      );

      if (!response.ok) {
        throw new Error(
          'No fue posible consultar el directorio.'
        );
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(
          result.message ||
            'No fue posible consultar el directorio.'
        );
      }

      const mappedEstablishments =
        result.data.map((item) => ({
          id: item.id,

          name:
            item.nombre_establecimiento,

          type:
            formatBusinessType(
              item.tipo_servicio
            ),

          rawType:
            item.tipo_servicio,

          cp:
            item.codigo_postal || '',

          area:
            item.direccion ||
            'Ubicación no disponible',

          address:
            item.direccion ||
            'Ubicación no disponible',

          schedule:
            buildSchedule(item.horarios),

          phone:
            item.telefono_whatsapp || '',

          email:
            item.correo_contacto || '',

          description:
            item.descripcion || '',

          logoUrl:
            item.logo_url || null,

          latitude:
            item.latitud,

          longitude:
            item.longitud,

          horarios:
            item.horarios || [],
        }));

      setEstablishments(
        mappedEstablishments
      );
    } catch (error) {
      console.error(
        'Error cargando directorio:',
        error
      );

      setLoadError(
        'No pudimos cargar el directorio. Verifica tu conexión e inténtalo nuevamente.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEstablishments();
  }, []);

  /* =========================================================
     BUSCADOR
     ========================================================= */

  const normalizedSearch =
    search.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (normalizedSearch.length < 1) {
      return [];
    }

    return establishments
      .filter((item) =>
        item.name
          .toLowerCase()
          .includes(normalizedSearch)
      )
      .slice(0, 5);
  }, [
    establishments,
    normalizedSearch,
  ]);

  const filteredEstablishments =
    useMemo(() => {
      return establishments.filter(
        (item) => {
          const matchesType =
            type === 'Todas' ||
            item.type === type ||
            (type === 'Veterinaria' &&
              item.type === 'Ambas') ||
            (type === 'Estética' &&
              item.type === 'Ambas');

          const matchesSearch =
            normalizedSearch === '' ||
            item.name
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            item.cp.includes(
              normalizedSearch
            );

          return (
            matchesType &&
            matchesSearch
          );
        }
      );
    }, [
      establishments,
      normalizedSearch,
      type,
    ]);

  /* =========================================================
     ACCIONES
     ========================================================= */

  function clearFilters() {
    setSearch('');
    setType('Todas');
  }

  async function openEstablishment(item) {
    setSelectedEstablishment(item);

    setSelectedDay(null);
    setSelectedTime('');
    setPetName('');
    setPhone('');
    setFormError('');
    setRequestSent(false);

    setAvailability([]);
    setAvailabilityError('');
    setAvailabilityLoading(true);

    try {
      const response = await fetch(
        `/api/establecimientos/${item.id}/disponibilidad`
      );

      if (!response.ok) {
        throw new Error(
          'No fue posible consultar la disponibilidad.'
        );
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(
          result.message ||
            'No fue posible consultar la disponibilidad.'
        );
      }

      const normalizedAvailability =
        result.data.map((day) => ({
          ...day,
          date: String(day.date).slice(0, 10),
        }));

      setAvailability(
        normalizedAvailability
      );
    } catch (error) {
      console.error(
        'Error cargando disponibilidad:',
        error
      );

      setAvailabilityError(
        'No pudimos consultar la disponibilidad de este establecimiento.'
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }

  function closeModal() {
    setSelectedEstablishment(null);
  }

  function selectDay(day) {
    if (day.status === 'full') {
      return;
    }

    setSelectedDay(day);
    setSelectedTime('');
    setFormError('');
  }

  async function submitAppointment(event) {
    event.preventDefault();

    setFormError('');

    if (!selectedDay) {
      setFormError(
        'Selecciona un día disponible.'
      );

      return;
    }

    if (!selectedTime) {
      setFormError(
        'Selecciona un horario disponible.'
      );

      return;
    }

    if (!petName.trim()) {
      setFormError(
        'Escribe el nombre de tu mascota.'
      );

      return;
    }

    const cleanPhone =
      phone.replace(/\D/g, '');

    if (cleanPhone.length !== 10) {
      setFormError(
        'Ingresa un número de teléfono de 10 dígitos.'
      );

      return;
    }

    try {
      setRequestSending(true);

      const response = await fetch(
        '/api/solicitudes-cita',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            idNegocio:
              selectedEstablishment.id,

            nombreMascota:
              petName.trim(),

            telefono:
              cleanPhone,

            fecha:
              selectedDay.date,

            hora:
              selectedTime,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            'No fue posible enviar la solicitud.'
        );
      }

      if (!result.success) {
        throw new Error(
          result.message ||
            'No fue posible enviar la solicitud.'
        );
      }

      setRequestSent(true);
    } catch (error) {
      console.error(
        'Error enviando solicitud:',
        error
      );

      setFormError(
        error.message ||
          'No fue posible enviar la solicitud.'
      );
    } finally {
      setRequestSending(false);
    }
  }

  /* =========================================================
     MODAL
     ========================================================= */

  useEffect(() => {
    if (!selectedEstablishment) {
      return;
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        closeModal();
      }
    }

    document.addEventListener(
      'keydown',
      handleEscape
    );

    document.body.style.overflow =
      'hidden';

    return () => {
      document.removeEventListener(
        'keydown',
        handleEscape
      );

      document.body.style.overflow =
        '';
    };
  }, [selectedEstablishment]);

  return (
    <main>
      <section className="directory-hero">
        <div className="container">
          <span className="eyebrow">
            Directorio VetStec
          </span>

          <h1>
            Encuentra una veterinaria o
            estética cerca de ti.
          </h1>

          <p>
            Consulta establecimientos
            registrados en VetStec utilizando
            su nombre o código postal.
          </p>
        </div>
      </section>

      <section className="directory-section">
        <div className="container">

          <div className="directory-search-panel">

            <div className="directory-search-field">
              <label htmlFor="directory-search">
                Buscar establecimiento
              </label>

              <div className="search-input-wrapper">
                <span
                  className="search-icon"
                  aria-hidden="true"
                >
                  🔎
                </span>

                <input
                  id="directory-search"
                  type="search"
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Nombre o código postal"
                  autoComplete="off"
                />

                {search && (
                  <button
                    className="clear-search"
                    type="button"
                    onClick={() =>
                      setSearch('')
                    }
                    aria-label="Limpiar búsqueda"
                  >
                    ×
                  </button>
                )}
              </div>

              {suggestions.length > 0 &&
                search !==
                  suggestions[0]?.name && (
                  <div className="search-suggestions">
                    {suggestions.map(
                      (item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() =>
                            setSearch(
                              item.name
                            )
                          }
                        >
                          <span>
                            🏥
                          </span>

                          <div>
                            <strong>
                              {item.name}
                            </strong>

                            <small>
                              {item.type} · CP{' '}
                              {item.cp}
                            </small>
                          </div>
                        </button>
                      )
                    )}
                  </div>
                )}
            </div>

            <div className="directory-filter">
              <span className="filter-label">
                Tipo de establecimiento
              </span>

              <div className="filter-buttons">
                {[
                  'Todas',
                  'Veterinaria',
                  'Estética',
                ].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      type === option
                        ? 'active'
                        : ''
                    }
                    aria-pressed={
                      type === option
                    }
                    onClick={() =>
                      setType(option)
                    }
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

          </div>

          <div className="directory-results-header">
            <div>
              <h2>
                Establecimientos
              </h2>

              {!loading &&
                !loadError && (
                  <p>
                    {
                      filteredEstablishments.length
                    }{' '}
                    {filteredEstablishments.length ===
                    1
                      ? 'resultado encontrado'
                      : 'resultados encontrados'}
                  </p>
                )}
            </div>

            {(search ||
              type !== 'Todas') && (
              <button
                type="button"
                className="reset-filter-button"
                onClick={clearFilters}
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* ESTADO DE CARGA */}

          {loading && (
            <div className="directory-loading">
              <div className="loading-spinner" />

              <h3>
                Cargando directorio...
              </h3>

              <p>
                Estamos consultando los
                establecimientos registrados.
              </p>
            </div>
          )}

          {/* ERROR DE API */}

          {!loading && loadError && (
            <div className="directory-error">
              <div className="directory-status-icon">
                ⚠️
              </div>

              <h3>
                No pudimos cargar el
                directorio
              </h3>

              <p>
                {loadError}
              </p>

              <button
                type="button"
                className="button button-primary"
                onClick={
                  loadEstablishments
                }
              >
                Intentar nuevamente
              </button>
            </div>
          )}

          {/* RESULTADOS */}

          {!loading &&
            !loadError &&
            filteredEstablishments.length >
              0 && (
              <div className="establishment-grid">
                {filteredEstablishments.map(
                  (item) => (
                    <article
                      className="establishment-card"
                      key={item.id}
                    >
                      <div className="establishment-logo">
                        {item.logoUrl ? (
                          <img
                            src={
                              item.logoUrl
                            }
                            alt={`Logo de ${item.name}`}
                          />
                        ) : item.type ===
                          'Estética' ? (
                          '✂️'
                        ) : (
                          '🐾'
                        )}
                      </div>

                      <div className="establishment-card-body">
                        <span className="establishment-type">
                          {item.type}
                        </span>

                        <h3>
                          {item.name}
                        </h3>

                        <div className="establishment-info">
                          <p>
                            <span>
                              📍
                            </span>

                            {item.area}
                          </p>

                          <p>
                            <span>
                              📮
                            </span>

                            CP{' '}
                            {item.cp ||
                              'No disponible'}
                          </p>

                          <p>
                            <span>
                              🕐
                            </span>

                            {item.schedule}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="establishment-button"
                          onClick={() =>
                            openEstablishment(
                              item
                            )
                          }
                        >
                          Ver información
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}

          {/* SIN RESULTADOS */}

          {!loading &&
            !loadError &&
            filteredEstablishments.length ===
              0 && (
              <div className="directory-empty">
                <div>
                  🔎
                </div>

                <h3>
                  No encontramos
                  establecimientos
                </h3>

                <p>
                  Revisa el nombre o código
                  postal e intenta nuevamente.
                </p>

                <button
                  type="button"
                  className="button button-primary"
                  onClick={
                    clearFilters
                  }
                >
                  Limpiar búsqueda
                </button>
              </div>
            )}

        </div>
      </section>

      {/* ===================================================
          MODAL
          =================================================== */}

      {selectedEstablishment && (
        <div
          className="establishment-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <section
            className="establishment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="establishment-modal-title"
          >
            <button
              type="button"
              className="modal-close-button"
              onClick={closeModal}
              aria-label="Cerrar información"
            >
              ×
            </button>

            <div className="modal-header">
              <div className="modal-establishment-logo">
                {selectedEstablishment.logoUrl ? (
                  <img
                    src={
                      selectedEstablishment.logoUrl
                    }
                    alt=""
                  />
                ) : selectedEstablishment.type ===
                  'Estética' ? (
                  '✂️'
                ) : (
                  '🐾'
                )}
              </div>

              <div>
                <span className="establishment-type">
                  {
                    selectedEstablishment.type
                  }
                </span>

                <h2 id="establishment-modal-title">
                  {
                    selectedEstablishment.name
                  }
                </h2>

                <p>
                  {
                    selectedEstablishment.area
                  }
                </p>
              </div>
            </div>

            <div className="modal-content-grid">
              <div className="modal-information">
                <h3>
                  Información del
                  establecimiento
                </h3>

                <div className="modal-detail">
                  <span>
                    📍
                  </span>

                  <div>
                    <strong>
                      Dirección
                    </strong>

                    <p>
                      {
                        selectedEstablishment.address
                      }
                    </p>
                  </div>
                </div>

                <div className="modal-detail">
                  <span>
                    🕐
                  </span>

                  <div>
                    <strong>
                      Horario de atención
                    </strong>

                    <p>
                      {
                        selectedEstablishment.schedule
                      }
                    </p>
                  </div>
                </div>

                <div className="modal-detail">
                  <span>
                    📞
                  </span>

                  <div>
                    <strong>
                      Teléfono
                    </strong>

                    <p>
                      {selectedEstablishment.phone ||
                        'No disponible'}
                    </p>
                  </div>
                </div>

                {selectedEstablishment.description && (
                  <div className="modal-detail">
                    <span>
                      ℹ️
                    </span>

                    <div>
                      <strong>
                        Acerca del establecimiento
                      </strong>

                      <p>
                        {
                          selectedEstablishment.description
                        }
                      </p>
                    </div>
                  </div>
                )}

                <div className="modal-actions">
                  {selectedEstablishment.phone && (
                    <a
                      className="button button-primary"
                      href={`tel:${selectedEstablishment.phone}`}
                    >
                      Llamar
                    </a>
                  )}

                  <a
                    className="button button-secondary"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      selectedEstablishment.address
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir en Maps
                  </a>
                </div>
              </div>

              <div className="modal-map">
                <iframe
                  title={`Ubicación de ${selectedEstablishment.name}`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(
                    selectedEstablishment.address
                  )}&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>

            {/* =============================================
                DISPONIBILIDAD
                ============================================= */}

            <div className="availability-section">
              <div className="availability-heading">
                <div>
                  <span className="eyebrow">
                    Solicitud de cita
                  </span>

                  <h3>
                    Consulta la disponibilidad
                  </h3>

                  <p>
                    Selecciona un día y después
                    el horario que prefieras.
                  </p>
                </div>

                <div className="availability-legend">
                  <span>
                    <i className="legend available" />
                    Disponible
                  </span>

                  <span>
                    <i className="legend limited" />
                    Pocos espacios
                  </span>

                  <span>
                    <i className="legend full" />
                    Sin disponibilidad
                  </span>
                </div>
              </div>

              {!requestSent ? (
                <>
                {availabilityLoading && (
                  <div className="availability-loading">
                    <div className="loading-spinner" />

                    <div>
                      <strong>
                        Consultando disponibilidad...
                      </strong>

                      <p>
                        Estamos revisando los horarios disponibles
                        del establecimiento.
                      </p>
                    </div>
                  </div>
                )}

                {!availabilityLoading &&
                  availabilityError && (
                    <div className="availability-error">
                      <span>⚠️</span>

                      <div>
                        <strong>
                          No pudimos cargar la disponibilidad
                        </strong>

                        <p>
                          {availabilityError}
                        </p>
                      </div>
                    </div>
                  )}

                  {!availabilityLoading &&
                  !availabilityError &&
                  availability.length > 0 && (
                    <div className="availability-days">
                      {availability.map((day) => (
                        <button
                          key={day.date}
                          type="button"
                          disabled={day.status === 'full'}
                          className={`availability-day ${day.status} ${
                            selectedDay?.date === day.date
                              ? 'selected'
                              : ''
                          }`}
                          onClick={() =>
                            selectDay(day)
                          }
                        >
                          <strong>
                            {formatDate(day.date)}
                          </strong>

                          <span>
                            {statusText(day.status)}
                          </span>

                          {day.status !== 'full' && (
                            <small>
                              {day.remaining}{' '}
                              {day.remaining === 1
                                ? 'espacio'
                                : 'espacios'}
                            </small>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {!availabilityLoading &&
                  !availabilityError &&
                  availability.length === 0 && (
                    <div className="availability-empty">
                      <span>📅</span>

                      <div>
                        <strong>
                          Sin disponibilidad publicada
                        </strong>

                        <p>
                          Este establecimiento todavía no ha
                          configurado horarios para los próximos días.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedDay && (
                    <div className="time-section">
                      <h4>
                        Horarios disponibles para{' '}
                        {formatDate(
                          selectedDay.date
                        )}
                      </h4>

                      <div className="time-grid">
                        {selectedDay.slots.map(
                          (slot) => (
                            <button
                              key={
                                slot
                              }
                              type="button"
                              className={
                                selectedTime ===
                                slot
                                  ? 'selected'
                                  : ''
                              }
                              onClick={() =>
                                setSelectedTime(
                                  slot
                                )
                              }
                            >
                              {
                                slot
                              }
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {!availabilityLoading &&
                    !availabilityError &&
                    availability.length > 0 && (
                      <form
                        className="appointment-form"
                        onSubmit={submitAppointment}
                      >
                    <div className="appointment-form-heading">
                      <h4>
                        Datos para solicitar la cita
                      </h4>

                      <p>
                        No necesitas crear una
                        cuenta.
                      </p>
                    </div>

                    <div className="appointment-fields">
                      <div className="form-field">
                        <label htmlFor="pet-name">
                          Nombre de la mascota
                        </label>

                        <input
                          id="pet-name"
                          type="text"
                          value={
                            petName
                          }
                          onChange={(
                            event
                          ) =>
                            setPetName(
                              event
                                .target
                                .value
                            )
                          }
                          placeholder="Ej. Milo"
                          maxLength={
                            60
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label htmlFor="appointment-phone">
                          Teléfono / WhatsApp
                        </label>

                        <input
                          id="appointment-phone"
                          type="tel"
                          value={
                            phone
                          }
                          onChange={(
                            event
                          ) =>
                            setPhone(
                              event
                                .target
                                .value
                            )
                          }
                          placeholder="55 1234 5678"
                          maxLength={
                            14
                          }
                        />
                      </div>
                    </div>

                    {formError && (
                      <div
                        className="form-error"
                        role="alert"
                      >
                        ⚠️{' '}
                        {formError}
                      </div>
                    )}

                    <div className="appointment-summary">
                      <div>
                        <span>
                          Día
                        </span>

                        <strong>
                          {selectedDay
                            ? formatDate(
                                selectedDay.date
                              )
                            : 'Sin seleccionar'}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Horario
                        </span>

                        <strong>
                          {selectedTime ||
                            'Sin seleccionar'}
                        </strong>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="button button-primary appointment-submit"
                      disabled={requestSending}
                    >
                      {requestSending
                        ? 'Enviando solicitud...'
                        : 'Solicitar cita'}
                    </button>

                    <p className="appointment-note">
                      La solicitud no representa
                      una cita confirmada. El
                      establecimiento deberá
                      aceptarla o ponerse en
                      contacto contigo.
                    </p>
                  </form>
                )}
                </>
              ) : (
                <div className="appointment-success">
                  <div className="success-icon">
                    ✓
                  </div>

                  <h3>
                    Solicitud enviada
                  </h3>

                  <p>
                    Tu solicitud para{' '}
                    <strong>
                      {petName}
                    </strong>{' '}
                    fue preparada correctamente.
                  </p>

                  <div className="success-summary">
                    <div>
                      <span>
                        Establecimiento
                      </span>

                      <strong>
                        {
                          selectedEstablishment.name
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Fecha
                      </span>

                      <strong>
                        {formatDate(
                          selectedDay.date
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Hora
                      </span>

                      <strong>
                        {
                          selectedTime
                        }
                      </strong>
                    </div>
                  </div>

                  <p className="appointment-note">
                    La solicitud fue registrada correctamente.
                    Recuerda que aún no representa una cita
                    confirmada. El establecimiento deberá
                    aceptarla o ponerse en contacto contigo.
                  </p>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      openEstablishment(
                        selectedEstablishment
                      );
                    }}
                  >
                    Hacer otra solicitud
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}