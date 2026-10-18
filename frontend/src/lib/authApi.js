export async function authApi(ruta, { method = 'GET', datos } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const respuesta = await fetch(`/api/auth/${ruta}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: method === 'GET' ? undefined : {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VetStec',
      },
      body: method === 'GET' ? undefined : JSON.stringify(datos || {}),
    });
    const contenido = await respuesta.json().catch(() => null);
    if (!respuesta.ok || contenido?.success !== true) {
      const error = new Error(contenido?.message || 'El servidor no pudo completar la operación.');
      error.status = respuesta.status;
      error.code = contenido?.code;
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