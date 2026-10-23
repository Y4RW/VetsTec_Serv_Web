
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authApi } from '../lib/authApi';

const AuthContext = createContext(null);
const AVISO = 'vetstec:cambio-sesion';
function avisar() {
  try { localStorage.setItem(AVISO, String(Date.now()) + Math.random()); } catch { /* El cierre en esta pestaña funciona sin almacenamiento. */ }
}
const sinSesion = { estado: 'anonimo', sesion: null, error: '' };

export function AuthProvider({ children }) {
  const [acceso, setAcceso] = useState({ ...sinSesion, estado: 'cargando' });
  const revision = useRef(0);

  const comprobarSesion = useCallback(async () => {
    const actual = ++revision.current;
    setAcceso((anterior) => ({ ...anterior,
      estado: anterior.estado === 'autenticado' ? 'autenticado' : 'cargando', error: '',
    }));
    try {
      const sesion = await authApi('sesion');
      if (actual === revision.current) {
        setAcceso({ estado: 'autenticado', sesion, error: '' });
      }
    } catch (error) {
      if (actual !== revision.current) return;
      setAcceso(error.status === 401 ? sinSesion : {
        estado: 'error', sesion: null, error: error.message,
      });
    }
  }, []);

  useEffect(() => {
    comprobarSesion();
    const alMostrar = (event) => {
      if (event.persisted) comprobarSesion();
    };
    const alInvalidar = () => { revision.current += 1; setAcceso(sinSesion); };
    const entrePestanas = (event) => { if (event.key === AVISO) comprobarSesion(); };
    window.addEventListener('storage', entrePestanas);
    window.addEventListener('vetstec:sesion-vencida', alInvalidar);
    window.addEventListener('focus', comprobarSesion);
    window.addEventListener('pageshow', alMostrar);
    return () => {
      revision.current += 1;
      window.removeEventListener('storage', entrePestanas);
      window.removeEventListener('vetstec:sesion-vencida', alInvalidar);
      window.removeEventListener('focus', comprobarSesion);
      window.removeEventListener('pageshow', alMostrar);
    };
  }, [comprobarSesion]);

  async function iniciarSesion(correo, password) {
    revision.current += 1;
    const sesion = await authApi('login', { method: 'POST', datos: { correo, password } });
    revision.current += 1;
    setAcceso({ estado: 'autenticado', sesion, error: '' });
    avisar();
  }

  async function cerrarSesion() {
    revision.current += 1;
    await authApi('logout', { method: 'POST' });
    revision.current += 1;
    setAcceso(sinSesion);
    avisar();
  }

  return (
    <AuthContext.Provider value={{ ...acceso, comprobarSesion, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth necesita AuthProvider.');
  return contexto;
}