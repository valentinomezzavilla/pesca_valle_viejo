// Contexto de la operación que los controllers pasan a los services (quién y desde dónde).
export const ctx = (req) => ({ usuario: req.usuario, ip: req.ip });

// Saca campos de costo/margen de las respuestas para quien no puede verlos.
export function sinCostos(obj, puedeVer) {
  if (puedeVer || obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((o) => sinCostos(o, false));
  if (typeof obj !== 'object' || obj instanceof Date) return obj;
  const limpio = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/^(costo|valor_stock|margen|ganancia)/.test(k)) continue;
    limpio[k] = sinCostos(v, false);
  }
  return limpio;
}
