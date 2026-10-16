import { ZONA_HORARIA, UNIDADES_ETIQUETA } from '@pescaderia/shared';

const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKg = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtEntero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmtFechaHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_HORARIA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit' });

// Solo para MOSTRAR. Las cuentas se hacen con decimal.js (shared/dinero.js).
export const pesos = (v) => fmtPesos.format(Number(v ?? 0));

export function cantidad(v, unidad = 'KG') {
  const n = Number(v ?? 0);
  return unidad === 'UNIDAD' ? `${fmtEntero.format(n)} u.` : `${fmtKg.format(n)} kg`;
}

export const precioPor = (precio, unidad) => `${pesos(precio)} / ${UNIDADES_ETIQUETA[unidad] ?? unidad}`;

export const fechaHora = (v) => (v ? fmtFechaHora.format(new Date(v)) : '');
export const hora = (v) => (v ? fmtHora.format(new Date(v)) : '');

// 'YYYY-MM-DD' → 'DD/MM/YYYY'
export function fecha(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export const hoyIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());

export function sumarDiasIso(iso, dias) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const inicioMesIso = () => `${hoyIso().slice(0, 7)}-01`;

/** Valor de una celda de reporte según el tipo de columna. */
export function formatearValor(valor, tipo) {
  if (valor === '' || valor === null || valor === undefined) return '';
  switch (tipo) {
    case 'pesos': return pesos(valor);
    case 'cantidad': return Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 3 });
    case 'entero': return fmtEntero.format(Number(valor));
    case 'porcentaje': return porcentaje(valor);
    case 'fecha': return fecha(valor);
    default: return String(valor);
  }
}

export function diasHasta(iso) {
  if (!iso) return null;
  const hoy = new Date(`${hoyIso()}T00:00:00Z`);
  const objetivo = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Math.round((objetivo - hoy) / 86400000);
}

export function porcentaje(v, decimales = 1) {
  return `${Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`;
}

// Convierte lo que tipea el usuario ("1.250,5" o "1250.5") a string con punto decimal
export function normalizarNumero(texto) {
  const t = String(texto ?? '').trim().replace(/\s/g, '');
  if (!t) return '';
  if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
  return t;
}
