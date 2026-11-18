import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const CONFIGS = {
  publico: {
    id: 'publico',
    badge: 'Asistente VetStec',
    title: 'Orientación para Mascotas',
    subtitle: 'Resuelve dudas sobre citas, directorio y registro',
    avatar: '🐾',
    welcome:
      '¡Hola! Soy el asistente virtual de VetStec. ¿Buscas una veterinaria/estética, quieres agendar una cita o registrar tu clínica?',
    quickPrompts: [
      '¿Cómo agendo una cita?',
      'Buscar veterinaria o estética',
      '¿Tiene costo para clientes?',
      'Registrar mi veterinaria',
    ],
    replies: [
      {
        keywords: ['registrar', 'registro', 'clinica', 'clínica', 'negocio', 'propietario', 'dueño', 'sucursal', 'alta'],
        answer:
          'Si tienes una veterinaria o estética canina, puedes crear tu cuenta de propietario, registrar tu sucursal con ubicación en mapa y subir tu documentación para aparecer en el directorio.',
        action: { label: 'Registrar establecimiento', to: '/registro' },
      },
      {
        keywords: ['cita', 'agendar', 'reservar', 'horario', 'disponibilidad'],
        answer:
          'Agendar es muy rápido y no necesitas crear cuenta: entra al Directorio, elige la clínica, revisa sus servicios, abre la pestaña Citas, selecciona día y horario e ingresa el nombre de tu mascota y tu WhatsApp.',
        action: { label: 'Ir al Directorio', to: '/directorio' },
      },
      {
        keywords: ['buscar', 'veterinaria', 'estetica', 'estética', 'directorio', 'cerca', 'codigo', 'cp', 'producto'],
        answer:
          'En nuestro Directorio puedes filtrar por Veterinaria o Estética, buscar por nombre o código postal, ver sus pestañas de Servicios, Citas y Productos (si venden) y escribirles directo por WhatsApp.',
        action: { label: 'Explorar Directorio', to: '/directorio' },
      },
      {
        keywords: ['costo', 'gratis', 'precio', 'cuenta', 'pagar'],
        answer:
          'Para los dueños de mascotas el uso del directorio y la solicitud de citas es 100% gratuito y sin registro obligatorio. Los precios de consultas, servicios o productos los establece cada establecimiento.',
      },
      {
        keywords: ['whatsapp', 'contacto', 'soporte', 'ayuda', 'humano'],
        answer:
          'Si necesitas soporte directo con el equipo de VetStec, puedes enviarnos un mensaje desde la sección de Contacto o abrir WhatsApp.',
        action: { label: 'Ir a Contacto', to: '/contacto' },
      },
    ],
    fallback:
      'Puedo ayudarte a buscar veterinarias o estéticas en el Directorio, explicarte cómo solicitar una cita sin crear cuenta o guiarte para registrar tu clínica.',
  },
  propietario: {
    id: 'propietario',
    badge: 'Copiloto Propietario',
    title: 'Asistente Operativo',
    subtitle: 'Guía de sucursales, catálogo, verificación y agenda',
    avatar: '🩺',
    welcome:
      '¡Hola! Soy tu asistente operativo de VetStec. ¿En qué parte de tu sucursal necesitas ayuda hoy?',
    quickPrompts: [
      '¿Cómo aparezco en el directorio?',
      'Configurar servicios y productos',
      'Publicar horarios y cupo de citas',
      'Confirmar solicitudes por WhatsApp',
    ],
    replies: [
      {
        keywords: ['directorio', 'aparecer', 'verificacion', 'verificación', 'aprobar', 'documentos', 'visible'],
        answer:
          'Para que tu sucursal sea visible en el Directorio público deben cumplirse 3 puntos: 1) Tener el interruptor "Visible en directorio" activado, 2) Tener tu verificación documental en estado APROBADO y 3) Tener tu cuenta verificada.',
      },
      {
        keywords: ['servicio', 'producto', 'catalogo', 'catálogo', 'inventario', 'precio', 'stock'],
        answer:
          'En las pestañas "Servicios" y "Productos" de tu sucursal puedes dar de alta consultas, estéticas y artículos en venta. Los productos con existencia mayor a 0 y tus servicios activos se muestran automáticamente en tu ficha pública.',
      },
      {
        keywords: ['horario', 'cupo', 'disponibilidad', 'agenda', 'capacidad'],
        answer:
          'Primero define tus días y horas de apertura en la pestaña "Horarios". Luego, en "Citas", publica la capacidad diaria y marca "Admitir reservas" para habilitar los espacios en el directorio.',
      },
      {
        keywords: ['whatsapp', 'solicitud', 'confirmar', 'cliente', 'cita'],
        answer:
          'Cuando un cliente solicita cita desde el directorio, aparece en "Solicitudes públicas del día". Puedes pulsar "Confirmar" para asignarle empleado/servicio y usar el botón "💬 WhatsApp" para avisarle al instante.',
      },
    ],
    fallback:
      'Te puedo guiar sobre: visibilidad en el directorio, verificación documental, alta de servicios/productos, publicación de cupos de citas o seguimiento a clientes por WhatsApp.',
  },
};

export default function VetStecChatbot() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOwnerPanel = location.pathname.startsWith('/panel');
  const config = isOwnerPanel ? CONFIGS.propietario : CONFIGS.publico;

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => [
    { id: 'init', sender: 'bot', text: config.welcome },
  ]);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    setMessages([{ id: `init-${config.id}`, sender: 'bot', text: config.welcome }]);
    setInput('');
  }, [config.id, config.welcome]);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  function handleSend(rawText) {
    const clean = String(rawText || '').trim();
    if (!clean) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: clean,
    };

    const normalized = clean.toLowerCase();
    const match = config.replies.find((item) =>
      item.keywords.some((kw) => normalized.includes(kw))
    );

    const botMsg = {
      id: `b-${Date.now() + 1}`,
      sender: 'bot',
      text: match ? match.answer : config.fallback,
      action: match?.action || null,
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput('');
  }

  return (
    <div className={`vetstec-chatbot ${isOwnerPanel ? 'is-owner' : 'is-public'}`}>
      {open && (
        <section
          className="chatbot-window"
          role="dialog"
          aria-label={config.title}
        >
          <header className="chatbot-header">
            <div className="chatbot-header-info">
              <span className="chatbot-avatar" aria-hidden="true">
                {config.avatar}
              </span>
              <div>
                <span className="chatbot-badge">{config.badge}</span>
                <h3>{config.title}</h3>
              </div>
            </div>

            <button
              type="button"
              className="chatbot-close"
              onClick={() => setOpen(false)}
              aria-label="Cerrar asistente"
            >
              ×
            </button>
          </header>

          <div className="chatbot-messages" aria-live="polite">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chatbot-bubble ${msg.sender === 'user' ? 'user' : 'bot'}`}
              >
                <p>{msg.text}</p>
                {msg.action && (
                  <button
                    type="button"
                    className="chatbot-action-btn"
                    onClick={() => {
                      navigate(msg.action.to);
                      setOpen(false);
                    }}
                  >
                    {msg.action.label} →
                  </button>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="chatbot-quick-list">
            {config.quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
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
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu duda aquí..."
              aria-label="Escribe tu mensaje para el asistente"
              maxLength={240}
            />
            <button type="submit" aria-label="Enviar mensaje">
              Enviar
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="chatbot-launcher"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={open ? 'Cerrar asistente virtual' : `Abrir ${config.title}`}
      >
        <span aria-hidden="true">{open ? '✕' : config.avatar}</span>
        <span>{open ? 'Cerrar' : config.badge}</span>
      </button>
    </div>
  );
}