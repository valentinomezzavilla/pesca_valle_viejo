import { ZONA_HORARIA } from '@pescaderia/shared';

// Fecha de hoy (YYYY-MM-DD) en hora de Córdoba
export function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());
}

export function sumarDias(fechaIso, dias) {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Condiciones SQL para filtrar un TIMESTAMPTZ por días de calendario en hora de Córdoba.
// La conexión ya tiene TimeZone = Córdoba, así que '2026-10-13'::date se interpreta en esa zona.
export function filtroDias(query, columna, { desde, hasta }) {
  if (desde) query.whereRaw('?? >= ?::date', [columna, desde]);
  if (hasta) query.whereRaw("?? < ?::date + interval '1 day'", [columna, hasta]);
  return query;
}

// Días de calendario entre dos fechas 'YYYY-MM-DD' (hasta − desde)
export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}
