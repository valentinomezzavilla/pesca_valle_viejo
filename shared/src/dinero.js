// Aritmética de dinero y cantidades con decimal.js. Nunca usar Number para operar plata.
// La misma función de cálculo de venta corre en el POS (vista previa) y en el servidor (verdad),
// así lo que ve el cajero es exactamente lo que se guarda.
import Decimal from 'decimal.js';

export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const dec = (v) => new D(v === null || v === undefined || v === '' ? 0 : v);
export const redondear = (v, decimales = 2) => dec(v).toDecimalPlaces(decimales, D.ROUND_HALF_UP);

// Formatos "de base de datos" (string con decimales fijos)
export const aPesos = (v) => redondear(v, 2).toFixed(2);
export const aCantidad = (v) => redondear(v, 3).toFixed(3);
export const aCosto = (v) => redondear(v, 4).toFixed(4);

export const sumar = (valores) => valores.reduce((acc, v) => acc.plus(dec(v)), dec(0));
export const minimo = (a, b) => (dec(a).lt(dec(b)) ? dec(a) : dec(b));

export const subtotalLinea = (cantidad, precioUnitario) => redondear(dec(cantidad).times(dec(precioUnitario)), 2);

// Redondea un precio al múltiplo más cercano (ej. 10 o 100 pesos). multiplo <= 0 → solo 2 decimales.
export function redondearAMultiplo(valor, multiplo) {
  const m = dec(multiplo);
  if (m.lte(0)) return redondear(valor, 2);
  return dec(valor).div(m).toDecimalPlaces(0, D.ROUND_HALF_UP).times(m);
}

// Reparte `total` (en pesos) proporcionalmente a `pesos`. Los centavos de redondeo van a la línea más grande,
// así ninguna línea con peso 0 recibe descuento y la suma da exacta.
export function prorratear(total, pesos) {
  const t = redondear(total, 2);
  const ps = pesos.map(dec);
  const sumaPesos = sumar(ps);
  if (t.isZero() || sumaPesos.isZero()) return ps.map(() => dec(0));
  const partes = ps.map((p) => redondear(t.times(p).div(sumaPesos), 2));
  const diferencia = t.minus(sumar(partes));
  if (!diferencia.isZero()) {
    let iMayor = 0;
    ps.forEach((p, i) => { if (p.gt(ps[iMayor])) iMayor = i; });
    partes[iMayor] = partes[iMayor].plus(diferencia);
  }
  return partes;
}

/**
 * Calcula los importes de una venta.
 * items: [{ cantidad, precioUnitario, descuento? }]  (descuento = monto en pesos de la línea)
 * descuentoGlobal: monto en pesos sobre el total.
 * Devuelve Decimals. No valida: ver validarCalculoVenta.
 */
export function calcularVenta({ items, descuentoGlobal = 0 }) {
  const lineas = items.map((it) => {
    const subtotal = subtotalLinea(it.cantidad, it.precioUnitario);
    const descuento = redondear(it.descuento ?? 0, 2);
    return { ...it, subtotal, descuento };
  });
  const subtotal = sumar(lineas.map((l) => l.subtotal));
  const descuentoItems = sumar(lineas.map((l) => l.descuento));
  const dg = redondear(descuentoGlobal, 2);
  const prorrateo = prorratear(dg, lineas.map((l) => l.subtotal.minus(l.descuento)));
  lineas.forEach((l, i) => {
    l.descuentoProrrateado = prorrateo[i];
    l.total = l.subtotal.minus(l.descuento).minus(prorrateo[i]);
  });
  const total = subtotal.minus(descuentoItems).minus(dg);
  const porcentajeDescuento = subtotal.isZero()
    ? dec(0)
    : descuentoItems.plus(dg).div(subtotal).times(100);
  return { lineas, subtotal, descuentoItems, descuentoGlobal: dg, total, porcentajeDescuento };
}

// Devuelve un mensaje de error en lenguaje simple, o null si la venta es coherente.
export function validarCalculoVenta(calculo) {
  for (const l of calculo.lineas) {
    if (l.descuento.gt(l.subtotal)) return 'El descuento de un producto no puede ser mayor que su precio.';
  }
  if (calculo.total.lt(0)) return 'El descuento no puede ser mayor que el total de la venta.';
  return null;
}
