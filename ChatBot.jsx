import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TOPIC_CHIPS,
  INITIAL_SUGGESTIONS,
  getVetBotFallbackResponse,
} from '../utils/vetbotKnowledge';

const SESSION_KEY = 'vetstec_vetbot_messages';
const SOUND_KEY = 'vetstec_vetbot_sound';

const DEFAULT_WELCOME = {
  id: 'welcome',
  sender: 'bot',
  text: '¡Hola! 🐾 Soy **VetBot**, el asistente de **VetStec**.\n\nEstoy aquí para orientarte sobre clínicas veterinarias, estéticas caninas, cómo agendar citas para tu mascota o resolver dudas generales de salud.\n\n¿En qué te puedo ayudar hoy?',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  suggestions: INITIAL_SUGGESTIONS,
  actions: [
    { label: 'Ir al Directorio', icon: '📍', path: '/directorio' },
    { label: 'Contactar a VetStec', icon: '✉️', path: '/contacto' },
  ],
};

function playSoftChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {
    // Silently ignore audio context errors
  }
}

function formatBotText(text) {
  if (!text) return null;

  const paragraphs = text.split(/\n\n+/);

  return paragraphs.map((para, pIdx) => {
    const lines = para.split('\n');
    const isList = lines.some((l) => /^\s*([•\-\*]|\d+\.)\s+/.test(l));

    if (isList) {
      return (
        <ul key={pIdx} className="chatbot-list">
          {lines.map((line, lIdx) => {
            const cleanLine = line.replace(/^\s*([•\-\*]|\d+\.)\s+/, '').trim();
            if (!cleanLine) return null;
            return (
              <li key={lIdx} dangerouslySetInnerHTML={{ __html: renderMarkdownInline(cleanLine) }} />
            );
          })}
        </ul>
      );
    }

    // Alerta / Urgencia destacada
    const isAlert = para.includes('🚨') || para.includes('⚠️');

    return (
      <p
        key={pIdx}
        className={`chatbot-paragraph ${isAlert ? 'chatbot-paragraph-alert' : ''}`}
        dangerouslySetInnerHTML={{ __html: renderMarkdownInline(para) }}
      />
    );
  });
}

function renderMarkdownInline(str) {
  let safe = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Negrita **texto**
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Cursiva *texto*
  safe = safe.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // Código inline `código`
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

  return safe;
}

export default function ChatBot() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Inicializar mensajes desde sessionStorage para persistir entre rutas
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // Ignorar error de parsing
    }
    return [DEFAULT_WELCOME];
  });

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const [copiedId, setCopiedId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const rootRef = useRef(null);

  // Guardar en sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
    } catch (e) {
      // Storage lleno o privado
    }
  }, [messages]);

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
      setHasUnread(false);
    }
  }, [isOpen, isMinimized, messages]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setShowTooltip(false);
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  const closeChat = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    }
    setIsOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  };

  // Cerrar con ESC solo si el foco está en el asistente
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === 'Escape' &&
        isOpen &&
        rootRef.current?.contains(document.activeElement)
      ) {
        closeChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_KEY, String(next));
      } catch { }
      return next;
    });
  };

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    let replyData = null;

    try {
      const historyPayload = newMessages.slice(-6).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      // Timeout con AbortController de 6 segundos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: historyPayload,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.reply) {
          replyData = {
            text: data.reply,
            suggestions: data.suggestions && data.suggestions.length > 0 ? data.suggestions : INITIAL_SUGGESTIONS,
            mode: data.mode || 'server',
          };
        }
      }
    } catch (err) {
      // Si la API falla o está offline, el asistente no se rompe: usamos el motor de conocimiento local
      console.info('VetBot: Usando base de conocimiento autónoma para responder:', query);
    }

    // Si el servidor no respondió o falló, usar motor local enriquecido
    if (!replyData) {
      const localFallback = getVetBotFallbackResponse(query);
      replyData = {
        text: localFallback.text,
        suggestions: localFallback.suggestions,
        actions: localFallback.actions,
        mode: 'local_knowledge',
      };
    }

    const botMessage = {
      id: `bot-${Date.now()}`,
      sender: 'bot',
      text: replyData.text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: replyData.suggestions,
      actions: replyData.actions,
      mode: replyData.mode,
    };

    setMessages((prev) => [...prev, botMessage]);
    setLoading(false);

    if (soundEnabled) {
      playSoftChime();
    }

    if (!isOpen || isMinimized) {
      setHasUnread(true);
    }
  };

  const handleResetChat = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    }
    const freshWelcome = {
      id: `welcome-${Date.now()}`,
      sender: 'bot',
      text: '¡Conversación reiniciada! 🐾 ¿En qué más puedo orientarte sobre tu mascota o los servicios de VetStec?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: INITIAL_SUGGESTIONS,
      actions: [
        { label: 'Ir al Directorio', icon: '📍', path: '/directorio' },
        { label: 'Contactar a VetStec', icon: '✉️', path: '/contacto' },
      ],
    };
    setMessages([freshWelcome]);
  };

  const handleDownloadChat = () => {
    const lines = messages.map(
      (m) => `[${m.timestamp}] ${m.sender === 'user' ? 'Tú' : 'VetBot'}:\n${m.text}\n`
    );
    const content = `Historial de conversación con VetBot (VetStec)\nFecha: ${new Date().toLocaleDateString()}\n=========================================\n\n${lines.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VetBot-Conversacion-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a);
  };

  const handleCopyMessage = async (msgId, text) => {
    try {
      const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');
      await navigator.clipboard.writeText(cleanText);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSpeakMessage = (msgId, text) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/[•\-#]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-MX';
    utterance.rate = 1.05;

    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSendMessage();
  };

  const executeAction = (action) => {
    if (action.path) {
      navigate(action.path);
      if (window.innerWidth < 768) setIsOpen(false);
    }
  };

  return (
    <aside className="chatbot-root" aria-label="Asistente Virtual VetStec" ref={rootRef}>
      {/* TOOLTIP INICIAL */}
      {!isOpen && showTooltip && (
        <div className="chatbot-launcher-tooltip">
          <span>
            <span aria-hidden="true">🐾 </span>
            ¿Dudas con tu mascota? ¡Pregúntame!
          </span>
          <button
            type="button"
            className="chatbot-tooltip-close"
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(false);
            }}
            aria-label="Cerrar aviso"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      {/* BOTÓN FLOTANTE DISPARADOR */}
      <button
        ref={launcherRef}
        type="button"
        id="vetstec-chatbot-launcher"
        className={`chatbot-launcher ${isOpen ? 'is-active' : ''}`}
        onClick={() => {
          setIsOpen((prev) => !prev);
          setIsMinimized(false);
          setShowTooltip(false);
        }}
        aria-expanded={isOpen}
        aria-controls="vetstec-chatbot-window"
        aria-label={
          isOpen
            ? 'Cerrar asistente virtual'
            : `Abrir asistente virtual de VetStec${hasUnread ? ' (tienes un mensaje nuevo)' : ''}`
        }
      >
        <span className="chatbot-launcher-icon" aria-hidden="true">
          {isOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              <circle cx="9" cy="10" r="1.2" fill="currentColor"></circle>
              <circle cx="15" cy="10" r="1.2" fill="currentColor"></circle>
            </svg>
          )}
        </span>
        {hasUnread && !isOpen && <span className="chatbot-badge" aria-hidden="true" />}
      </button>

      {/* VENTANA DEL CHATBOT */}
      {isOpen && (
        <section
          id="vetstec-chatbot-window"
          className={`chatbot-window ${isMinimized ? 'is-minimized' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby="vetstec-chatbot-title"
          aria-describedby="vetstec-chatbot-subtitle"
        >
          {/* CABECERA */}
          <header className="chatbot-header">
            <div className="chatbot-header-info">
              <div className="chatbot-avatar" aria-hidden="true">
                <span>🐾</span>
                <span className="chatbot-avatar-pulse"></span>
              </div>
              <div className="chatbot-header-text">
                <h2 className="chatbot-title" id="vetstec-chatbot-title">VetBot</h2>
                <span className="chatbot-subtitle" id="vetstec-chatbot-subtitle">
                  <span className="chatbot-status-dot" aria-hidden="true"></span>
                  En línea • Asistente VetStec
                </span>
              </div>
            </div>

            <div className="chatbot-header-actions">
              {/* Botón de Sonido */}
              <button
                type="button"
                className="chatbot-header-btn"
                title={soundEnabled ? 'Silenciar sonidos' : 'Activar sonidos'}
                onClick={toggleSound}
                aria-label={soundEnabled ? 'Silenciar sonidos' : 'Activar sonidos'}
              >
                <span aria-hidden="true">{soundEnabled ? '🔔' : '🔕'}</span>
              </button>

              {/* Botón Descargar conversación */}
              <button
                type="button"
                className="chatbot-header-btn"
                title="Descargar conversación"
                onClick={handleDownloadChat}
                aria-label="Descargar historial de conversación"
              >
                <span aria-hidden="true">📥</span>
              </button>

              {/* Botón Reiniciar conversación */}
              <button
                type="button"
                className="chatbot-header-btn"
                title="Reiniciar chat"
                onClick={handleResetChat}
                aria-label="Reiniciar conversación"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                  <path d="M21 3v5h-5"></path>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                  <path d="M3 21v-5h5"></path>
                </svg>
              </button>

              {/* Botón Minimizar */}
              <button
                type="button"
                className="chatbot-header-btn"
                title={isMinimized ? 'Expandir' : 'Minimizar'}
                onClick={() => setIsMinimized((prev) => !prev)}
                aria-label={isMinimized ? 'Expandir chat' : 'Minimizar chat'}
                aria-expanded={!isMinimized}
              >
                <span aria-hidden="true">{isMinimized ? '□' : '–'}</span>
              </button>

              {/* Botón Cerrar */}
              <button
                type="button"
                className="chatbot-header-btn"
                title="Cerrar chat"
                onClick={closeChat}
                aria-label="Cerrar ventana de chat"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </header>

          {/* CONTENIDO PRINCIPAL SI NO ESTÁ MINIMIZADO */}
          {!isMinimized && (
            <>
              {/* CATEGORÍAS RÁPIDAS (TEMAS DESTACADOS) */}
              <nav className="chatbot-topics-bar" aria-label="Temas frecuentes">
                <div className="chatbot-topics-scroll">
                  {TOPIC_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className="chatbot-topic-btn"
                      onClick={() => handleSendMessage(chip.query)}
                      disabled={loading}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </nav>

              {/* LISTA DE MENSAJES */}
              <div
                className="chatbot-body"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Conversación con VetBot"
                tabIndex={0}
              >
                {messages.map((msg) => {
                  const isBot = msg.sender === 'bot';

                  // Detectar acciones si no vienen explícitas
                  let actionItems = msg.actions || [];
                  if (isBot && actionItems.length === 0) {
                    const t = msg.text.toLowerCase();
                    if (t.includes('directorio') || t.includes('clínica') || t.includes('establecimiento')) {
                      actionItems.push({ label: 'Ir al Directorio', icon: '📍', path: '/directorio' });
                    }
                    if (t.includes('contacto') || t.includes('formulario')) {
                      actionItems.push({ label: 'Ir a Contacto', icon: '✉️', path: '/contacto' });
                    }
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`chatbot-message-wrapper ${isBot ? 'is-bot' : 'is-user'}`}
                    >
                      {isBot && (
                        <div className="chatbot-msg-avatar" aria-hidden="true">
                          🐾
                        </div>
                      )}

                      <div className="chatbot-bubble-col">
                        <div className={`chatbot-bubble ${msg.isError ? 'is-error' : ''}`}>
                          <span className="sr-only">{isBot ? 'VetBot dice: ' : 'Tú: '}</span>
                          {isBot ? formatBotText(msg.text) : <p>{msg.text}</p>}

                          {/* ACCIONES DIRECTAS EN EL MENSAJE */}
                          {actionItems.length > 0 && (
                            <div className="chatbot-actions-row">
                              {actionItems.map((action, aIdx) => (
                                <button
                                  key={aIdx}
                                  type="button"
                                  className="chatbot-action-link"
                                  onClick={() => executeAction(action)}
                                >
                                  <span>{action.label}</span>
                                  <span aria-hidden="true">{action.icon}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* BARRA DE HERRAMIENTAS DEL MENSAJE (HORA + COPIAR + VOZ) */}
                        <div className="chatbot-msg-footer">
                          <span className="chatbot-msg-time">
                            <span className="sr-only">Enviado a las </span>
                            {msg.timestamp}
                          </span>

                          {isBot && (
                            <div className="chatbot-msg-tools">
                              <button
                                type="button"
                                className="chatbot-tool-btn"
                                onClick={() => handleCopyMessage(msg.id, msg.text)}
                                title={copiedId === msg.id ? '¡Copiado!' : 'Copiar respuesta'}
                                aria-label={copiedId === msg.id ? 'Texto copiado al portapapeles' : 'Copiar respuesta'}
                              >
                                {copiedId === msg.id ? '✓' : '📋'}
                              </button>

                              {'speechSynthesis' in window && (
                                <button
                                  type="button"
                                  className={`chatbot-tool-btn ${speakingId === msg.id ? 'is-speaking' : ''}`}
                                  onClick={() => handleSpeakMessage(msg.id, msg.text)}
                                  title={speakingId === msg.id ? 'Detener lectura' : 'Escuchar respuesta'}
                                  aria-label={speakingId === msg.id ? 'Detener lectura en voz alta' : 'Escuchar respuesta en voz alta'}
                                >
                                  {speakingId === msg.id ? '⏹' : '🔊'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* SUGERENCIAS DE ACCIÓN RÁPIDA */}
                        {isBot && msg.suggestions && msg.suggestions.length > 0 && (
                          <div
                            className="chatbot-suggestions"
                            role="group"
                            aria-labelledby={`${msg.id}-suggestions-title`}
                          >
                            <span
                              className="chatbot-suggestions-title"
                              id={`${msg.id}-suggestions-title`}
                            >
                              Sugerencias:
                            </span>
                            <div className="chatbot-chips-wrap">
                              {msg.suggestions.map((sug, sIdx) => (
                                <button
                                  key={sIdx}
                                  type="button"
                                  className="chatbot-chip"
                                  onClick={() => handleSendMessage(sug)}
                                  disabled={loading}
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* INDICADOR DE ESCRITURA */}
                {loading && (
                  <div className="chatbot-message-wrapper is-bot">
                    <div className="chatbot-msg-avatar" aria-hidden="true">
                      🐾
                    </div>
                    <div className="chatbot-bubble-col">
                      <div className="chatbot-bubble is-typing" role="status">
                        <span className="sr-only">VetBot está procesando tu respuesta…</span>
                        <span className="dot" aria-hidden="true"></span>
                        <span className="dot" aria-hidden="true"></span>
                        <span className="dot" aria-hidden="true"></span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* BARRA DE ENTRADA CON AUTO-ENVÍO Y ACCESIBILIDAD */}
              <form className="chatbot-footer" onSubmit={handleSubmit} aria-busy={loading}>
                <label htmlFor="vetstec-chatbot-input" className="sr-only">
                  Escribe tu mensaje para VetBot
                </label>
                <div className="chatbot-input-wrapper">
                  <input
                    ref={inputRef}
                    id="vetstec-chatbot-input"
                    type="text"
                    className="chatbot-input"
                    placeholder="Escribe una pregunta sobre citas, salud o cuidados..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    maxLength={500}
                    autoComplete="off"
                    enterKeyHint="send"
                  />
                  {input.length > 50 && (
                    <span className="chatbot-input-counter" aria-hidden="true">
                      {input.length}/500
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  className="chatbot-send-btn"
                  disabled={!input.trim() || loading}
                  aria-label="Enviar mensaje a VetBot"
                  title="Enviar mensaje"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </aside>
  );
}
