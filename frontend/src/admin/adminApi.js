async function pedirAdmin(ruta, { method = 'GET', datos, imagen = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const respuesta = await fetch(`/api/admin/${ruta}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: method === 'GET' ? undefined : {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VetStec-Admin',
      },
      body: method === 'GET' ? undefined : JSON.stringify(datos || {}),
    });
    if (imagen && respuesta.ok) return respuesta.blob();
    const contenido = await respuesta.json().catch(() => null);
    if (!respuesta.ok || contenido?.success !== true) {
      const error = new Error(contenido?.message || 'El servidor no pudo completar la operación.');
      error.status = respuesta.status;
      error.retryAfter = Number(contenido?.retryAfter || respuesta.headers.get('Retry-After') || 0);
      throw error;
    }
    return contenido.data;
  } catch (error) {
    if (error.status) throw error;
    throw new Error('No pudimos comunicarnos con el servidor. Revisa la conexión e intenta nuevamente.');
  } finally {
    clearTimeout(timer);
  }
}

export const adminApi = (ruta, opciones) => pedirAdmin(`auth/${ruta}`, opciones);
export const solicitudesApi = (ruta = '', opciones) => pedirAdmin(`solicitudes${ruta}`, opciones);