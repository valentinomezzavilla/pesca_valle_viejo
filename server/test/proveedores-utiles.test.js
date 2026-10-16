import { describe, it, expect } from 'vitest';
import {
  cuitValido, normalizarCuit, numeroWhatsApp, esquemaProveedor, esquemaPagoProveedor, esquemaAnularMovimientoProveedor,
} from '@pescaderia/shared';

describe('CUIT', () => {
  it('valida el dígito verificador', () => {
    expect(cuitValido('20-12345678-6')).toBe(true);
    expect(cuitValido('20123456786')).toBe(true);
    expect(cuitValido('33-69345023-9')).toBe(true); // AFIP
    expect(cuitValido('20-12345678-5')).toBe(false);
    expect(cuitValido('30-71234567-8')).toBe(false);
    expect(cuitValido('2012345678')).toBe(false);
    expect(cuitValido('')).toBe(false);
    expect(cuitValido(null)).toBe(false);
  });

  it('normaliza con guiones', () => {
    expect(normalizarCuit('20123456786')).toBe('20-12345678-6');
    expect(normalizarCuit(' 20.12345678.6 ')).toBe('20-12345678-6');
    expect(normalizarCuit('123')).toBe(null);
  });
});

describe('WhatsApp', () => {
  it('arma el número internacional desde como lo escribe la gente', () => {
    expect(numeroWhatsApp('223 555-0101')).toBe('5492235550101');
    expect(numeroWhatsApp('11 4555-0202')).toBe('5491145550202');
    expect(numeroWhatsApp('0351 15 1234567')).toBe('5493511234567');
    expect(numeroWhatsApp('011 15 4555-0202')).toBe('5491145550202');
    expect(numeroWhatsApp('+54 9 11 4555-0202')).toBe('5491145550202');
    expect(numeroWhatsApp('+54 11 4555 0202')).toBe('5491145550202');
  });

  it('devuelve null si no se puede saber el número', () => {
    expect(numeroWhatsApp('4555-0202')).toBe(null);
    expect(numeroWhatsApp('15 4555-0202')).toBe(null); // celular sin característica
    expect(numeroWhatsApp('15-5123-4567')).toBe(null);
    expect(numeroWhatsApp('')).toBe(null);
    expect(numeroWhatsApp(null)).toBe(null);
    expect(numeroWhatsApp('llamar a Raúl')).toBe(null);
  });
});

describe('esquemas de proveedores', () => {
  it('normaliza el CUIT y rechaza uno mal escrito', () => {
    expect(esquemaProveedor.parse({ nombre: 'X', cuit: '20123456786' }).cuit).toBe('20-12345678-6');
    expect(esquemaProveedor.parse({ nombre: 'X', cuit: '' }).cuit).toBe(null);
    const mal = esquemaProveedor.safeParse({ nombre: 'X', cuit: '20-12345678-5' });
    expect(mal.success).toBe(false);
    expect(mal.error.issues[0].message).toBe('El CUIT no es válido. Revisá los números.');
  });

  it('acepta plazo y días de entrega', () => {
    const p = esquemaProveedor.parse({ nombre: 'X', plazo_pago_dias: '15', dias_entrega: [1, 4] });
    expect(p.plazo_pago_dias).toBe(15);
    expect(p.dias_entrega).toEqual([1, 4]);
    expect(esquemaProveedor.safeParse({ nombre: 'X', plazo_pago_dias: '400' }).success).toBe(false);
    expect(esquemaProveedor.safeParse({ nombre: 'X', dias_entrega: [7] }).success).toBe(false);
  });

  it('el cheque necesita fecha de cobro', () => {
    const sin = esquemaPagoProveedor.safeParse({ importe: '100', medio_pago: 'CHEQUE' });
    expect(sin.success).toBe(false);
    expect(sin.error.issues[0].path).toEqual(['cheque_fecha_cobro']);
    expect(esquemaPagoProveedor.safeParse({ importe: '100', medio_pago: 'CHEQUE', cheque_fecha_cobro: '2026-10-20' }).success).toBe(true);
  });

  it('anular pide motivo', () => {
    expect(esquemaAnularMovimientoProveedor.safeParse({ motivo: '' }).success).toBe(false);
    expect(esquemaAnularMovimientoProveedor.parse({ motivo: 'Cargado dos veces' }).motivo).toBe('Cargado dos veces');
  });
});
