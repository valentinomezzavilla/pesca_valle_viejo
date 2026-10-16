import { describe, it, expect } from 'vitest';
import { calcularVenta, prorratear, redondearAMultiplo, subtotalLinea, validarCalculoVenta } from '@pescaderia/shared';

describe('cálculos de dinero', () => {
  it('subtotal por peso redondea a centavos sin errores de punto flotante', () => {
    expect(subtotalLinea('1.235', '9500').toFixed(2)).toBe('11732.50');
    expect(subtotalLinea('0.333', '0.10').toFixed(2)).toBe('0.03');
    // 0.1 + 0.2 en float da 0.30000000000000004; acá no
    expect(subtotalLinea('0.3', '1').toFixed(2)).toBe('0.30');
  });

  it('prorratea un descuento y la suma da exacta', () => {
    const partes = prorratear('100', ['33.33', '33.33', '33.34']);
    expect(partes.reduce((a, p) => a.plus(p)).toFixed(2)).toBe('100.00');
    const partes2 = prorratear('10', ['1', '1', '1']);
    expect(partes2.map((p) => p.toFixed(2)).sort()).toEqual(['3.33', '3.33', '3.34']);
  });

  it('no le asigna descuento a una línea con peso cero', () => {
    const partes = prorratear('5', ['0', '10', '10.01']);
    expect(partes[0].toFixed(2)).toBe('0.00');
  });

  it('calcula una venta completa con descuentos', () => {
    const c = calcularVenta({
      items: [
        { cantidad: '1.250', precioUnitario: '9500', descuento: '0' },
        { cantidad: '2', precioUnitario: '1500', descuento: '500' },
      ],
      descuentoGlobal: '1000',
    });
    expect(c.subtotal.toFixed(2)).toBe('14875.00');
    expect(c.descuentoItems.toFixed(2)).toBe('500.00');
    expect(c.total.toFixed(2)).toBe('13375.00');
    const sumaLineas = c.lineas.reduce((a, l) => a.plus(l.total), c.lineas[0].total.minus(c.lineas[0].total));
    expect(sumaLineas.toFixed(2)).toBe('13375.00');
    expect(validarCalculoVenta(c)).toBeNull();
  });

  it('detecta descuentos imposibles', () => {
    const c = calcularVenta({ items: [{ cantidad: '1', precioUnitario: '100', descuento: '150' }] });
    expect(validarCalculoVenta(c)).toMatch(/descuento/);
    const c2 = calcularVenta({ items: [{ cantidad: '1', precioUnitario: '100' }], descuentoGlobal: '101' });
    expect(validarCalculoVenta(c2)).toMatch(/descuento/);
  });

  it('redondea precios a múltiplos', () => {
    expect(redondearAMultiplo('9534', 10).toFixed(0)).toBe('9530');
    expect(redondearAMultiplo('9550', 100).toFixed(0)).toBe('9600');
    expect(redondearAMultiplo('9534.567', 0).toFixed(2)).toBe('9534.57');
  });
});
