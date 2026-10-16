import { DIAS_SEMANA, ORDEN_DIAS_SEMANA, numeroWhatsApp } from '@pescaderia/shared';
import { hoyIso } from './formato.js';

export function enlaceWhatsApp(telefono, texto) {
  const n = numeroWhatsApp(telefono);
  if (!n) return null;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

export const enlaceLlamar = (telefono) => {
  const t = String(telefono ?? '').replace(/[^\d+]/g, '');
  return t ? `tel:${t}` : null;
};

export const vieneHoy = (dias) => (dias ?? []).includes(new Date(`${hoyIso()}T12:00:00Z`).getUTCDay());

export const nombresDias = (dias) => ORDEN_DIAS_SEMANA.filter((d) => (dias ?? []).includes(d)).map((d) => DIAS_SEMANA[d]).join(', ');

export function textoVencimiento(dias) {
  if (dias < 0) return `Vencida hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
  if (dias === 0) return 'Vence hoy';
  return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`;
}
