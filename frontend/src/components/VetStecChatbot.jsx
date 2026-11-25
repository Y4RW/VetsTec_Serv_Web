import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const CONFIGS = {
  publico: {
    id: 'publico',
    badge: 'Asistente VetStec',
    launcherHint: '¡Guau! ¿Te ayudo?',
    title: 'Asistente Canino VetStec',
    subtitle: 'Clínicas reales, horarios, precios y citas',
    welcome:
      '¡Guau, hola! 🐶 Soy el asistente de **VetStec** conectado en vivo al directorio.\n\nPuedes preguntarme por **veterinarias o estéticas**, buscar por **código postal**, consultar **precios de servicios**, pedir orientación inicial para tu mascota o ver cómo **agendar cita**.',
    quickPrompts: [
      '¿Qué veterinarias hay disponibles?',
      '¿Qué servicios y precios ofrecen?',
      '¿Cómo agendo una cita?',
      'Registrar mi veterinaria',
    ],
  },
  propietario: {
    id: 'propietario',
    badge: 'Copiloto Propietario',
    launcherHint: 'Copiloto en vivo',
    title: 'Copiloto Operativo IA',
    subtitle: 'Diagnóstico en vivo de agenda, catálogo y stock',
    welcome:
      '¡Hola! 🐶🩺 Soy tu **Copiloto Operativo** conectado en tiempo real a los datos de tu sucursal.\n\nPuedo darte un **diagnóstico completo**, revisar tus **citas y solicitudes de hoy**, detectar **productos con stock bajo** o guiarte con tu horario semanal.',
    quickPrompts: [
      'Diagnóstico de mi sucursal',
      '¿Tengo citas o solicitudes hoy?',
      '¿Qué productos tienen stock bajo?',
      '¿Cómo aparezco en el directorio?',
    ],
  },
};

function DogFaceMascot({
  mode = 'publico',
  isThinking = false,
  isOpen = false,
  mini = false,
  className = '',
}) {
  const isOwner = mode === 'propietario';
  const collarFill = isOwner ? '#2b6cb0' : '#0b8783';
  const collarStroke = isOwner ? '#1b365d' : '#065f5b';
  const furMain = isOwner ? '#eec184' : '#f4b976';
  const furPatch = isOwner ? '#9c5a2b' : '#b86830';
  const earOuter = isOwner ? '#8a4c22' : '#a35724';

  return (
    <svg
      viewBox="0 0 120 120"
      className={`dog-face-svg ${isThinking ? 'is-thinking' : ''} ${
        isOpen ? 'is-open' : ''
      } ${mini ? 'is-mini' : ''} ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
    >
      {/* Oreja izquierda caída */}
      <g className="dog-ear dog-ear-left">
        <path
          d="M 39 29 C 25 16, 9 23, 7 45 C 5 62, 13 74, 24 70 C 30 68, 33 55, 37 44 Z"
          fill={earOuter}
          stroke="#5c2d0e"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M 33 34 C 25 26, 15 31, 14 46 C 13 56, 18 63, 23 61 C 27 59, 30 49, 33 41 Z"
          fill="#e5988b"
        />
      </g>

      {/* Oreja derecha caída */}
      <g className="dog-ear dog-ear-right">
        <path
          d="M 81 29 C 95 16, 111 23, 113 45 C 115 62, 107 74, 96 70 C 90 68, 87 55, 83 44 Z"
          fill={earOuter}
          stroke="#5c2d0e"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M 87 34 C 95 26, 105 31, 106 46 C 107 56, 102 63, 97 61 C 93 59, 90 49, 87 41 Z"
          fill="#e5988b"
        />
      </g>

      {/* Collar y placa VetStec (ocultos en avatar mini para mayor nitidez) */}
      {!mini && (
        <g className="dog-collar">
          <rect
            x="33"
            y="90"
            width="54"
            height="12"
            rx="6"
            fill={collarFill}
            stroke={collarStroke}
            strokeWidth="2.2"
          />
          <circle
            cx="60"
            cy="105"
            r="8.5"
            fill="#fbbf24"
            stroke="#b45309"
            strokeWidth="2"
          />
          {isOwner ? (
            <path
              d="M 60 101.2 V 108.8 M 56.2 105 H 63.8"
              stroke="#1b365d"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          ) : (
            <circle cx="60" cy="105" r="3" fill="#92400e" />
          )}
        </g>
      )}

      {/* Silueta principal de cabeza y mejillas peludas */}
      <path
        d="M 60 22 C 79 22, 91 32, 94 50 C 98 67, 94 84, 80 92 C 72 97, 66 98, 60 98 C 54 98, 48 97, 40 92 C 26 84, 22 67, 26 50 C 29 32, 41 22, 60 22 Z"
        fill={furMain}
        stroke="#6b3714"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />

      {/* Mechón superior de pelito */}
      <path
        d="M 52 24 Q 56 13 61 20 Q 66 13 69 24 Z"
        fill={furMain}
        stroke="#6b3714"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Manchita clásica en el ojo izquierdo */}
      <ellipse
        cx="43"
        cy="52"
        rx="13.5"
        ry="15.5"
        transform="rotate(-12 43 52)"
        fill={furPatch}
      />

      {/* Gorrito médico veterinario para el Copiloto Propietario */}
      {isOwner && !mini && (
        <g className="dog-vet-cap">
          <path
            d="M 41 25 C 42 13, 78 13, 79 25 Z"
            fill="#ffffff"
            stroke="#1b365d"
            strokeWidth="2.3"
            strokeLinejoin="round"
          />
          <rect x="39" y="23" width="42" height="4.5" rx="2.2" fill="#1b365d" />
          <path
            d="M 60 15.8 V 21.6 M 57.1 18.7 H 62.9"
            stroke="#2b6cb0"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Cejas expresivas */}
      <rect x="36" y="36.5" width="11" height="3.8" rx="1.9" fill="#fff7ed" transform="rotate(-8 41.5 38.4)" />
      <rect x="73" y="36.5" width="11" height="3.8" rx="1.9" fill="#6b3714" transform="rotate(8 78.5 38.4)" />

      {/* Mejillas sonrojadas */}
      <ellipse cx="31" cy="66" rx="5.5" ry="3.4" fill="#fb7185" opacity="0.42" />
      <ellipse cx="89" cy="66" rx="5.5" ry="3.4" fill="#fb7185" opacity="0.42" />

      {/* Ojos con brillo y parpadeo */}
      <g className="dog-eyes">
        <circle cx="43" cy="52" r="6.6" fill="#182230" />
        <circle cx="40.8" cy="49.6" r="2.3" fill="#ffffff" />
        <circle cx="45.2" cy="54.2" r="1.1" fill="#ffffff" />

        <circle cx="77" cy="52" r="6.6" fill="#182230" />
        <circle cx="74.8" cy="49.6" r="2.3" fill="#ffffff" />
        <circle cx="79.2" cy="54.2" r="1.1" fill="#ffffff" />
      </g>

      {/* Hocico crema esculpido */}
      <path
        d="M 60 54 C 73 54, 83 62, 83 73.5 C 83 83.5, 73.5 90.5, 60 90.5 C 46.5 90.5, 37 83.5, 37 73.5 C 37 62, 47 54, 60 54 Z"
        fill="#fff8ef"
        stroke="#d6b48c"
        strokeWidth="1.8"
      />

      {/* Lengüita rosada */}
      <g className="dog-tongue">
        <path
          d="M 54.2 78.5 L 65.8 78.5 L 65.8 84.8 C 65.8 89.2, 63.2 92, 60 92 C 56.8 92, 54.2 89.2, 54.2 84.8 Z"
          fill="#fb7185"
          stroke="#be123c"
          strokeWidth="1.6"
        />
        <line
          x1="60"
          y1="79.5"
          x2="60"
          y2="88.2"
          stroke="#be123c"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>

      {/* Sonrisa de perrito en W */}
      <path
        d="M 60 70 L 60 76 M 60 76 C 56.5 81.5, 48.5 81, 45.5 75.2 M 60 76 C 63.5 81.5, 71.5 81, 74.5 75.2"
        fill="none"
        stroke="#4a2511"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Puntos de bigotes */}
      <circle cx="42.5" cy="70" r="1.3" fill="#c79e74" />
      <circle cx="40.5" cy="73.8" r="1.3" fill="#c79e74" />
      <circle cx="77.5" cy="70" r="1.3" fill="#c79e74" />
      <circle cx="79.5" cy="73.8" r="1.3" fill="#c79e74" />

      {/* Nariz triangular redondeada con reflejo */}
      <path
        d="M 50.5 61.8 C 50.5 58, 69.5 58, 69.5 61.8 C 69.5 66.8, 63.8 71.2, 60 71.2 C 56.2 71.2, 50.5 66.8, 50.5 61.8 Z"
        fill="#1e293b"
      />
      <ellipse cx="56.8" cy="61.2" rx="4.2" ry="1.6" fill="#ffffff" opacity="0.45" />
    </svg>
  );
}

function DogWindowCrown({ mode = 'publico' }) {
  const isOwner = mode === 'propietario';
  const earOuter = isOwner ? '#1b365d' : '#a35724';
  const earBorder = isOwner ? '#102a43' : '#5c2d0e';
  const earInner = isOwner ? '#63b3ed' : '#e5988b';
  const tuftFill = isOwner ? '#2b6cb0' : '#f4b976';

  return (
    <div className="chatbot-dog-crown" aria-hidden="true">
      <svg viewBox="0 0 360 36" preserveAspectRatio="none" className="chatbot-dog-crown-svg">
        {/* Orejita izquierda asomando sobre la ventana */}
        <path
          d="M 28 36 C 22 12, 42 2, 64 10 C 76 15, 84 25, 88 36 Z"
          fill={earOuter}
          stroke={earBorder}
          strokeWidth="2.5"
        />
        <path
          d="M 40 35 C 38 19, 49 12, 62 17 C 70 20, 75 27, 77 35 Z"
          fill={earInner}
        />

        {/* Mechón central */}
        <path
          d="M 164 36 Q 173 18 181 28 Q 189 16 196 36 Z"
          fill={tuftFill}
          stroke={earBorder}
          strokeWidth="2"
        />

        {/* Orejita derecha asomando sobre la ventana */}
        <path
          d="M 332 36 C 338 12, 318 2, 296 10 C 284 15, 276 25, 272 36 Z"
          fill={earOuter}
          stroke={earBorder}
          strokeWidth="2.5"
        />
        <path
          d="M 320 35 C 322 19, 311 12, 298 17 C 290 20, 285 27, 283 35 Z"
          fill={earInner}
        />
      </svg>
    </div>
  );
}

function renderizarFragmentosEnLinea(linea, keyPrefijo) {
  const partes = String(linea).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return partes.map((parte, idx) => {
    if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) {
      return <strong key={`${keyPrefijo}-b-${idx}`}>{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith('*') && parte.endsWith('*') && parte.length > 2) {
      return <em key={`${keyPrefijo}-i-${idx}`}>{parte.slice(1, -1)}</em>;
    }
    return <span key={`${keyPrefijo}-t-${idx}`}>{parte}</span>;
  });
}

function MensajeFormateado({ texto }) {
  const lineas = String(texto || '').split('\n');
  const bloques = [];
  let listaActual = [];

  function vaciarLista(clave) {
    if (!listaActual.length) return;
    bloques.push(
      <ul key={`ul-${clave}`} className="chatbot-list">
        {listaActual.map((item, i) => (
          <li key={`li-${clave}-${i}`}>
            {renderizarFragmentosEnLinea(item, `${clave}-${i}`)}
          </li>
        ))}
      </ul>
    );
    listaActual = [];
  }

  lineas.forEach((raw, idx) => {
    const limpia = raw.trim();
    if (!limpia) {
      vaciarLista(idx);
      return;
    }
    if (/^[•\-]\s+/.test(limpia)) {
      listaActual.push(limpia.replace(/^[•\-]\s+/, ''));
    } else {
      vaciarLista(idx);
      bloques.push(
        <p key={`p-${idx}`}>
          {renderizarFragmentosEnLinea(limpia, `p-${idx}`)}
        </p>
      );
    }
  });
  vaciarLista('fin');

  return <div className="chatbot-rich-text">{bloques}</div>;
}

export default function VetStecChatbot() {
  const location = useLocation();
  const navigate = useNavigate();

  const isAdminRoute = location.pathname.startsWith('/admin');
  const isOwnerPanel = location.pathname.startsWith('/panel');
  const config = isOwnerPanel ? CONFIGS.propietario : CONFIGS.publico;

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [sugerencias, setSugerencias] = useState(config.quickPrompts);
  const [contexto, setContexto] = useState({});
  const [interactionId, setInteractionId] = useState(null);
  const [messages, setMessages] = useState(() => [
    { id: `init-${config.id}`, sender: 'bot', text: config.welcome, actions: [] },
  ]);

  const messagesEndRef = useRef(null);
  const peticionActiva = useRef(null);

  useEffect(() => {
    peticionActiva.current?.abort();
    setCargando(false);
    setMessages([
      { id: `init-${config.id}`, sender: 'bot', text: config.welcome, actions: [] },
    ]);
    setSugerencias(config.quickPrompts);
    setContexto({});
    setInteractionId(null);
    setInput('');
  }, [config.id, config.welcome, config.quickPrompts]);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, cargando, open]);

  if (isAdminRoute) {
    return null;
  }

  function reiniciarConversacion() {
    peticionActiva.current?.abort();
    setCargando(false);
    setContexto({});
    setInteractionId(null);
    setSugerencias(config.quickPrompts);
    setMessages([
      { id: `reset-${Date.now()}`, sender: 'bot', text: config.welcome, actions: [] },
    ]);
  }

  function ejecutarAccion(action) {
    if (!action) return;
    if (action.type === 'panel-tab' && action.tab) {
      if (!location.pathname.startsWith('/panel')) {
        navigate('/panel');
      }
      window.dispatchEvent(
        new CustomEvent('vetstec:navegar-panel', { detail: { tab: action.tab } })
      );
      return;
    }
    if (action.to) {
      navigate(action.to);
      setOpen(false);
    }
  }

  async function handleSend(rawText) {
    const clean = String(rawText || '').trim();
    if (!clean || cargando) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: clean,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setCargando(true);

    const controller = new AbortController();
    peticionActiva.current = controller;

    try {
      const endpoint = isOwnerPanel
        ? '/api/asistente/propietario'
        : '/api/asistente/publico';

      let response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(isOwnerPanel ? { 'X-Requested-With': 'VetStec' } : {}),
        },
        body: JSON.stringify({
          mensaje: clean,
          contexto,
          interactionId,
          ...(isOwnerPanel
            ? { idSucursal: window.__vetstecSucursalActiva || null }
            : {}),
        }),
        signal: controller.signal,
      });

      // Si la sesión del propietario venció, cae suavemente al asistente público
      if (isOwnerPanel && (response.status === 401 || response.status === 403)) {
        response = await fetch('/api/asistente/publico', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensaje: clean, contexto }),
          signal: controller.signal,
        });
      }

      const json = await response.json().catch(() => null);
      if (controller.signal.aborted) return;

      if (!response.ok || !json?.success || !json?.data?.respuesta) {
        throw new Error(
          json?.message || 'No pude procesar tu mensaje en este momento.'
        );
      }

      const { respuesta, actions, sugerencias: nuevasSug, contexto: nuevoCtx, interactionId: nuevoIntId } = json.data;

      if (nuevoCtx) setContexto(nuevoCtx);
      if (nuevoIntId) setInteractionId(nuevoIntId);
      if (Array.isArray(nuevasSug) && nuevasSug.length > 0) {
        setSugerencias(nuevasSug);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: 'bot',
          text: respuesta,
          actions: Array.isArray(actions) ? actions : [],
        },
      ]);
    } catch (err) {
      if (controller.signal.aborted) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          text:
            err.message ||
            'No pude conectarme con el servidor de VetStec. Verifica que la API esté activa e inténtalo nuevamente.',
          actions: isOwnerPanel
            ? []
            : [{ type: 'route', label: 'Ir al Directorio', to: '/directorio' }],
        },
      ]);
    } finally {
      if (!controller.signal.aborted) {
        setCargando(false);
      }
    }
  }

  return (
    <div className={`vetstec-chatbot ${isOwnerPanel ? 'is-owner' : 'is-public'}`}>
      {open && (
        <div className="chatbot-window-shell">
          <DogWindowCrown mode={config.id} />
          <section
            className="chatbot-window"
            role="dialog"
            aria-label={config.title}
          >
            <header className="chatbot-header">
              <div className="chatbot-header-info">
                <span className="chatbot-avatar-dog" aria-hidden="true">
                  <DogFaceMascot
                    mode={config.id}
                    isThinking={cargando}
                    isOpen={open}
                  />
                </span>
                <div>
                  <span className="chatbot-badge">{config.badge}</span>
                  <h3>{config.title}</h3>
                  <p className="chatbot-header-subtitle">{config.subtitle}</p>
                </div>
              </div>

              <div className="chatbot-header-actions">
                <button
                  type="button"
                  className="chatbot-reset"
                  onClick={reiniciarConversacion}
                  title="Reiniciar conversación"
                  aria-label="Reiniciar conversación"
                >
                  ↺
                </button>
                <button
                  type="button"
                  className="chatbot-close"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar asistente"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="chatbot-messages" aria-live="polite">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chatbot-msg-row ${msg.sender === 'user' ? 'user' : 'bot'}`}
                >
                  {msg.sender === 'bot' && (
                    <span className="chatbot-mini-dog" aria-hidden="true">
                      <DogFaceMascot mode={config.id} mini />
                    </span>
                  )}

                  <div
                    className={`chatbot-bubble ${msg.sender === 'user' ? 'user' : 'bot'}`}
                  >
                    {msg.sender === 'bot' ? (
                      <MensajeFormateado texto={msg.text} />
                    ) : (
                      <p>{msg.text}</p>
                    )}

                    {Array.isArray(msg.actions) && msg.actions.length > 0 && (
                      <div className="chatbot-actions-row">
                        {msg.actions.map((act, idx) =>
                          act.type === 'external' && act.href ? (
                            <a
                              key={`${msg.id}-act-${idx}`}
                              href={act.href}
                              target="_blank"
                              rel="noreferrer"
                              className="chatbot-action-btn chatbot-action-external"
                            >
                              {act.label} ↗
                            </a>
                          ) : (
                            <button
                              key={`${msg.id}-act-${idx}`}
                              type="button"
                              className="chatbot-action-btn"
                              onClick={() => ejecutarAccion(act)}
                            >
                              {act.label} →
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {cargando && (
                <div className="chatbot-msg-row bot">
                  <span className="chatbot-mini-dog" aria-hidden="true">
                    <DogFaceMascot mode={config.id} isThinking mini />
                  </span>
                  <div className="chatbot-bubble bot chatbot-typing" role="status">
                    <span className="chatbot-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>Olfateando datos en vivo…</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="chatbot-quick-list" aria-label="Sugerencias rápidas">
              {sugerencias.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={cargando}
                  className="chatbot-quick-chip"
                  onClick={() => handleSend(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form
              className="chatbot-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
            >
              <input
                type="text"
                value={input}
                disabled={cargando}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isOwnerPanel
                    ? 'Pregunta por tu agenda, stock o sucursal…'
                    : 'Escribe CP, clínica, síntoma o duda…'
                }
                aria-label="Escribe tu mensaje para el asistente"
                maxLength={400}
              />
              <button type="submit" disabled={cargando || !input.trim()} aria-label="Enviar mensaje">
                Enviar
              </button>
            </form>
          </section>
        </div>
      )}

      <button
        type="button"
        className={`chatbot-launcher ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={open ? 'Cerrar asistente virtual' : `Abrir ${config.title}`}
      >
        {!open && (
          <span className="chatbot-speech-tag">
            <span className="chatbot-speech-kicker">{config.badge}</span>
            <span className="chatbot-speech-main">{config.launcherHint}</span>
          </span>
        )}

        <span className="chatbot-dog-head-wrap" aria-hidden="true">
          <DogFaceMascot
            mode={config.id}
            isThinking={cargando}
            isOpen={open}
          />
          {open ? (
            <span className="chatbot-dog-close-badge">✕</span>
          ) : (
            <span className="chatbot-dog-status-dot" />
          )}
        </span>
      </button>
    </div>
  );
}
