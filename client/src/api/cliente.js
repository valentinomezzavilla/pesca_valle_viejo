export class ApiError extends Error {
  constructor(status, error) {
    super(error?.mensaje ?? 'Ocurrió un error inesperado.');
    this.status = status;
    this.codigo = error?.codigo ?? 'ERROR';
    this.campos = error?.campos ?? {};
  }
}

function armarQuery(query) {
  if (!query) return '';
  const limpio = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return limpio.length ? `?${new URLSearchParams(limpio)}` : '';
}

export async function api(ruta, { metodo = 'GET', datos, query } = {}) {
  let res;
  try {
    res = await fetch(`/api${ruta}${armarQuery(query)}`, {
      method: metodo,
      headers: datos !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, { codigo: 'SIN_CONEXION', mensaje: 'No hay conexión con el sistema. Revisá internet y probá de nuevo.' });
  }
  if (res.status === 204) return null;
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && ruta !== '/auth/login' && ruta !== '/auth/yo') {
      window.dispatchEvent(new Event('sesion-vencida'));
    }
    throw new ApiError(res.status, cuerpo?.error);
  }
  return cuerpo;
}

export const get = (ruta, query) => api(ruta, { query });
export const post = (ruta, datos = {}) => api(ruta, { metodo: 'POST', datos });
export const put = (ruta, datos = {}) => api(ruta, { metodo: 'PUT', datos });
export const patch = (ruta, datos = {}) => api(ruta, { metodo: 'PATCH', datos });

/**
 * Ejecuta una acción que puede necesitar el PIN del dueño.
 * fn(pin) → promesa. Si el servidor pide PIN, se lo pide al usuario y reintenta.
 * Devuelve null si el usuario cancela.
 */
export async function conPin(pedirPin, fn) {
  try {
    return await fn(undefined);
  } catch (e) {
    if (e.codigo !== 'REQUIERE_PIN') throw e;
    let mensaje = e.message;
    for (;;) {
      const pin = await pedirPin(mensaje);
      if (!pin) return null;
      try {
        return await fn(pin);
      } catch (e2) {
        if (e2.codigo === 'PIN_INCORRECTO') {
          mensaje = 'El PIN no es correcto. Probá de nuevo.';
          continue;
        }
        throw e2;
      }
    }
  }
}
