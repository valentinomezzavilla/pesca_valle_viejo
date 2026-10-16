/**
 * Número para wa.me (549 + característica + número, sin 0 ni 15) a partir de como lo escribe la gente.
 * Devuelve null si no hay forma segura de saberlo (ej. falta la característica).
 */
export function numeroWhatsApp(telefono) {
  let d = String(telefono ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('549') && d.length === 13) return d;
  if (d.startsWith('54') && d.length === 12) return `549${d.slice(2)}`;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    // El "15" va después de la característica, que tiene 2, 3 o 4 dígitos
    const k = [2, 3, 4].find((i) => d.slice(i, i + 2) === '15');
    if (k === undefined) return null;
    d = d.slice(0, k) + d.slice(k + 2);
  }
  // Ninguna característica empieza con 15: es un celular escrito sin característica
  return d.length === 10 && !d.startsWith('15') ? `549${d}` : null;
}
