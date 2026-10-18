import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { estado, iniciarSesion } = useAuth();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [sinVerificar, setSinVerificar] = useState(false);
  const [espera, setEspera] = useState(0);
  const enviando = useRef(false);
  const correoInput = useRef(null);
  const passwordInput = useRef(null);

  useEffect(() => {
    if (espera <= 0) return;
    const timer = setTimeout(() => setEspera((valor) => Math.max(0, valor - 1)), 1000);
    return () => clearTimeout(timer);
  }, [espera]);

  if (estado === 'autenticado') return <Navigate to="/panel" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    if (enviando.current || espera > 0 || estado === 'cargando') return;
    setError('');
    setSinVerificar(false);
    const email = correo.trim().toLowerCase();
    if (
      email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      correoInput.current?.validity.typeMismatch
    ) {
      setError('Escribe un correo válido.');
      correoInput.current?.focus();
      return;
    }
    if (!password) {
      setError('Escribe tu contraseña.');
      passwordInput.current?.focus();
      return;
    }
    enviando.current = true;
    setOcupado(true);
    try {
      await iniciarSesion(email, password);
    } catch (fallo) {
      setError(fallo.message);
      setSinVerificar(fallo.code === 'CORREO_NO_VERIFICADO');
      if (fallo.retryAfter > 0) setEspera(Math.ceil(fallo.retryAfter));
    } finally {
      setPassword('');
      setShowPassword(false);
      enviando.current = false;
      setOcupado(false);
    }
  }

  return (
    <section className="login-page" aria-labelledby="login-title">
      <div className="container login-container">
        <div className="login-card">
          <div className="login-heading">
            <span className="eyebrow">Acceso para establecimientos</span>
            <h1 id="login-title">Iniciar sesión</h1>
            <p>Entra con el correo y la contraseña que elegiste al registrar tu establecimiento.</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit} noValidate aria-busy={ocupado}>
            <p className="login-required">Los campos con * son obligatorios.</p>
            <div className="login-field">
              <label htmlFor="login-email">Correo de acceso *</label>
              <input
                ref={correoInput} id="login-email" name="correo" type="email"
                autoComplete="username" autoCapitalize="none" spellCheck={false}
                maxLength={150} required value={correo} disabled={ocupado}
                placeholder="nombre@ejemplo.com"
                onChange={(event) => { setCorreo(event.target.value); setError(''); setSinVerificar(false); }}
              />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Contraseña *</label>
              <div className="login-password">
                <input
                  ref={passwordInput} id="login-password" name="password"
                  type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  required value={password} disabled={ocupado}
                  onChange={(event) => { setPassword(event.target.value); setError(''); }}
                />
                <button
                  className="login-password-toggle" type="button" disabled={ocupado}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-controls="login-password" aria-pressed={showPassword}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {sinVerificar && <Link className="auth-text-link" to="/registro?verificar=1">Verificar mi correo</Link>}
            {espera > 0 && <p className="auth-help">Puedes intentar de nuevo en {espera} s.</p>}
            <button
              className="button button-primary login-submit" type="submit"
              disabled={ocupado || espera > 0 || estado === 'cargando'}
            >
              {ocupado ? 'Entrando…' : estado === 'cargando' ? 'Comprobando sesión…' : 'Iniciar sesión'}
            </button>
          </form>
          <div className="login-register">
            <p>¿Tu establecimiento aún no está registrado?</p>
            <Link className="button button-secondary" to="/registro">Registrar establecimiento</Link>
          </div>
        </div>
        <aside className="login-public" aria-label="Consulta pública">
          <strong>¿Buscas atención para tu mascota?</strong>
          <p>Puedes consultar establecimientos y solicitar una cita sin crear una cuenta.</p>
          <Link to="/directorio">Explorar directorio <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
    </section>
  );
}