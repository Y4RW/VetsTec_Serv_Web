import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authApi } from '../lib/authApi';

const AuthContext = createContext(null);
const sinSesion = { estado: 'anonimo', sesion: null, error: '' };

export function AuthProvider({ children }) {
  const [acceso, setAcceso] = useState({ ...sinSesion, estado: 'cargando' });
  const revision = useRef(0);

  const comprobarSesion = useCallback(async () => {
    const actual = ++revision.current;
    setAcceso((anterior) => ({ ...anterior, estado: 'cargando', error: '' }));
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
    window.addEventListener('focus', comprobarSesion);
    window.addEventListener('pageshow', alMostrar);
    return () => {
      revision.current += 1;
      window.removeEventListener('focus', comprobarSesion);
      window.removeEventListener('pageshow', alMostrar);
    };
  }, [comprobarSesion]);

  async function iniciarSesion(correo, password) {
    revision.current += 1;
    const sesion = await authApi('login', { method: 'POST', datos: { correo, password } });
    revision.current += 1;
    setAcceso({ estado: 'autenticado', sesion, error: '' });
  }

  async function cerrarSesion() {
    revision.current += 1;
    await authApi('logout', { method: 'POST' });
    revision.current += 1;
    setAcceso(sinSesion);
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