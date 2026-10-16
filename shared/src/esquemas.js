// Esquemas de validación (Zod). Los mensajes se muestran tal cual al usuario.
import { z } from 'zod';
import {
  MEDIOS_PAGO,
  TIPOS_DOCUMENTO_COMPRA,
  CONDICIONES_COMPRA,
  MEDIOS_PAGO_PROVEEDOR,
  TIPOS_MOV_CAJA_MANUAL,
  MOTIVOS_MERMA,
} from './constantes.js';
import { cuitValido, normalizarCuit } from './cuit.js';

// Número decimal recibido como string o number. Acepta coma decimal ("1,250").
const decimal = (decimales, { positivo = false, max } = {}) =>
  z
    .union([z.string(), z.number()], { errorMap: () => ({ message: 'Ingresá un número' }) })
    .transform((v) => String(v).trim().replace(',', '.'))
    .refine((v) => new RegExp(`^\\d+(\\.\\d{1,${decimales}})?$`).test(v), {
      message: decimales === 0 ? 'Ingresá un número entero' : `Ingresá un número válido (hasta ${decimales} decimales)`,
    })
    .refine((v) => !positivo || Number(v) > 0, { message: 'Tiene que ser mayor a cero' })
    .refine((v) => max === undefined || Number(v) <= max, { message: `No puede ser mayor a ${max}` });

export const zPesos = decimal(2);
export const zPesosPositivo = decimal(2, { positivo: true });
export const zCantidad = decimal(3, { positivo: true });
export const zCantidadCero = decimal(3);
export const zCosto = decimal(4);
export const zPorcentaje = decimal(2, { max: 100 });

const zId = z.coerce.number({ invalid_type_error: 'Falta elegir una opción' }).int().positive('Falta elegir una opción');
const texto = (max = 200) => z.string().trim().max(max, `Máximo ${max} caracteres`);
const textoOpcional = (max = 200) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), texto(max).nullable()).optional();
const textoRequerido = (campo, max = 200) => texto(max).min(1, `Completá ${campo}`);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const fechaOpcional = z.preprocess((v) => (v === '' || v === undefined ? null : v), fecha.nullable()).optional();
const pinOpcional = z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(/^\d{4,8}$/).optional());

// ---------- Auth y usuarios ----------
export const esquemaLogin = z.object({
  usuario: textoRequerido('el usuario', 50),
  password: z.string().min(1, 'Completá la contraseña'),
});

const zPassword = z.string().min(8, 'La contraseña tiene que tener al menos 8 caracteres').max(100);
const zPin = z.string().regex(/^\d{4,8}$/, 'El PIN tiene que tener entre 4 y 8 números');

export const esquemaCambioPassword = z.object({
  actual: z.string().min(1, 'Completá tu contraseña actual'),
  nueva: zPassword,
});

export const esquemaCambioPin = z.object({
  password: z.string().min(1, 'Completá tu contraseña'),
  pin: zPin,
});

export const esquemaVerificarPin = z.object({ pin: zPin });

export const esquemaUsuarioNuevo = z.object({
  nombre: textoRequerido('el nombre', 100),
  usuario: textoRequerido('el usuario', 50).regex(/^[a-zA-Z0-9._-]+$/, 'El usuario solo puede tener letras, números, punto y guiones'),
  password: zPassword,
  rol: z.enum(['DUENO', 'CAJERO']),
  pin: z.preprocess((v) => (v === '' ? undefined : v), zPin.optional()),
});

export const esquemaUsuarioEdicion = z.object({
  nombre: textoRequerido('el nombre', 100).optional(),
  rol: z.enum(['DUENO', 'CAJERO']).optional(),
  activo: z.boolean().optional(),
  pin: z.preprocess((v) => (v === '' ? undefined : v), zPin.optional()),
});

export const esquemaResetPassword = z.object({ password: zPassword });

// ---------- Configuración ----------
export const esquemaConfiguracion = z.object({
  negocio: z
    .object({
      nombre: textoRequerido('el nombre del negocio', 100),
      direccion: texto(200).optional().default(''),
      telefono: texto(50).optional().default(''),
      cuit: texto(20).optional().default(''),
      mensaje_ticket: texto(200).optional().default(''),
    })
    .optional(),
  ticket_ancho: z.enum(['58', '80']).optional(),
  punto_venta: z.coerce.number().int().min(1).max(99999).optional(),
  descuento_max_cajero: z.coerce.number().min(0).max(100).optional(),
  dias_alerta_vencimiento: z.coerce.number().int().min(0).max(60).optional(),
});

// ---------- Catálogo ----------
export const esquemaCategoria = z.object({
  nombre: textoRequerido('el nombre', 60),
  margen_objetivo: z.preprocess((v) => (v === '' ? null : v), zPorcentaje.nullable()).optional(),
  orden: z.coerce.number().int().min(0).optional(),
  activa: z.boolean().optional(),
});

export const esquemaProducto = z.object({
  codigo: textoOpcional(20),
  nombre: textoRequerido('el nombre', 100),
  categoria_id: zId,
  unidad: z.enum(['KG', 'UNIDAD'], { errorMap: () => ({ message: 'Elegí si se vende por kg o por unidad' }) }),
  precio_venta: zPesos,
  costo_referencia: zCosto.optional(),
  stock_minimo: zCantidadCero.optional(),
  controla_vencimiento: z.boolean().optional(),
  dias_vida_util: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable()).optional(),
  favorito: z.boolean().optional(),
  activo: z.boolean().optional(),
});

export const esquemaCambioPrecio = z.object({ precio_venta: zPesos });

export const esquemaPreciosMasivo = z.union([
  z.object({
    items: z.array(z.object({ id: zId, precio_venta: zPesos })).min(1, 'No hay precios para cambiar'),
  }),
  z.object({
    categoria_id: zId,
    porcentaje: z.coerce.number().min(-90, 'Porcentaje inválido').max(500, 'Porcentaje inválido'),
    redondeo: z.coerce.number().int().min(0).default(0), // múltiplo: 0, 10, 50, 100
  }),
]);

export const esquemaFavorito = z.object({ favorito: z.boolean() });

// ---------- Proveedores ----------
// Días para pagar (proveedores y clientes). 0 = en el día
const zPlazoDias = z.coerce
  .number({ invalid_type_error: 'Ingresá la cantidad de días' })
  .int('Ingresá días enteros')
  .min(0, 'No puede ser negativo')
  .max(365, 'Máximo 365 días')
  .optional();

const zCuit = z
  .preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z
      .string()
      .trim()
      .nullable()
      .refine((v) => v === null || cuitValido(v), { message: 'El CUIT no es válido. Revisá los números.' })
      .transform((v) => (v === null ? null : normalizarCuit(v))),
  )
  .optional();

export const esquemaProveedor = z.object({
  nombre: textoRequerido('el nombre', 100),
  cuit: zCuit,
  telefono: textoOpcional(50),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().email('Email inválido').nullable()).optional(),
  direccion: textoOpcional(200),
  contacto: textoOpcional(100),
  cbu_alias: textoOpcional(60),
  plazo_pago_dias: zPlazoDias,
  dias_entrega: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  notas: textoOpcional(1000),
  activo: z.boolean().optional(),
});

// ---------- Compras (ingreso de mercadería) ----------
export const esquemaCompra = z
  .object({
    proveedor_id: zId,
    fecha: fecha,
    tipo_documento: z.enum(TIPOS_DOCUMENTO_COMPRA),
    numero_documento: textoOpcional(40),
    condicion: z.enum(CONDICIONES_COMPRA),
    medio_pago: z.enum(MEDIOS_PAGO_PROVEEDOR).optional(),
    caja_id: zId.optional(),
    observaciones: textoOpcional(500),
    items: z
      .array(
        z
          .object({
            producto_id: zId,
            cantidad: zCantidad,
            costo_unitario: zCosto.optional(),
            subtotal: zPesos.optional(),
            fecha_vencimiento: fechaOpcional,
          })
          .refine((i) => i.costo_unitario !== undefined || i.subtotal !== undefined, {
            message: 'Completá el costo (por kg/unidad o el total de la línea)',
          }),
      )
      .min(1, 'Agregá al menos un producto'),
  })
  .refine((c) => c.condicion !== 'CONTADO' || c.medio_pago, {
    message: 'Elegí cómo se pagó',
    path: ['medio_pago'],
  })
  .refine((c) => c.medio_pago !== 'EFECTIVO_CAJA' || c.caja_id, {
    message: 'Elegí de qué caja sale la plata',
    path: ['caja_id'],
  });

export const esquemaAnulacion = z.object({
  motivo: textoRequerido('el motivo', 300),
  pinAutorizacion: pinOpcional,
  caja_id: zId.optional(),
});

// ---------- Ventas ----------
export const esquemaVenta = z.object({
  caja_id: zId,
  items: z
    .array(
      z.object({
        producto_id: zId,
        cantidad: zCantidad,
        descuento: zPesos.optional(),
      }),
    )
    .min(1, 'El carrito está vacío'),
  descuento_global: zPesos.optional(),
  pagos: z
    .array(
      z.object({
        medio: z.enum([...MEDIOS_PAGO, 'CUENTA_CORRIENTE']),
        monto: zPesosPositivo,
        referencia: textoOpcional(60),
      }),
    )
    .default([]),
  efectivo_recibido: zPesos.optional(),
  cliente_id: zId.optional(),
  pinAutorizacion: pinOpcional,
});

export const esquemaFiltroVentas = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  estado: z.enum(['CONFIRMADA', 'ANULADA']).optional(),
  caja_sesion_id: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------- Caja ----------
export const esquemaCaja = z.object({ nombre: textoRequerido('el nombre', 50), activa: z.boolean().optional() });
export const esquemaCategoriaGasto = z.object({ nombre: textoRequerido('el nombre', 60), activa: z.boolean().optional() });

export const esquemaAbrirCaja = z.object({ monto_inicial: zPesos });

export const esquemaMovimientoCaja = z
  .object({
    tipo: z.enum(TIPOS_MOV_CAJA_MANUAL),
    importe: zPesosPositivo,
    medio: z.enum(MEDIOS_PAGO).default('EFECTIVO'),
    categoria_gasto_id: zId.optional(),
    descripcion: textoOpcional(200),
    pinAutorizacion: pinOpcional,
  })
  .refine((m) => m.tipo !== 'GASTO' || m.categoria_gasto_id, {
    message: 'Elegí el rubro del gasto',
    path: ['categoria_gasto_id'],
  });

export const esquemaCerrarCaja = z.object({
  efectivo_contado: zPesos,
  detalle_arqueo: z.record(z.string(), z.coerce.number().int().min(0)).optional(),
  observaciones: textoOpcional(500),
});

// ---------- Fase 2: mermas, ajustes, inventario, pagos a proveedores ----------
export const esquemaMerma = z
  .object({
    producto_id: zId,
    cantidad: zCantidad,
    motivo: z.enum(MOTIVOS_MERMA, { errorMap: () => ({ message: 'Elegí el motivo' }) }),
    detalle: textoOpcional(300),
    lote_id: zId.optional(),
  })
  .refine((m) => m.motivo !== 'OTRO' || m.detalle, { message: 'Contanos qué pasó', path: ['detalle'] });

// El ajuste dice cuánto hay REALMENTE (no la diferencia): es más difícil equivocarse
export const esquemaAjusteStock = z.object({
  producto_id: zId,
  cantidad_real: zCantidadCero,
  motivo: textoRequerido('el motivo', 300),
  pinAutorizacion: pinOpcional,
});

export const esquemaInventarioNuevo = z.object({
  categoria_id: zId.optional(),
  observaciones: textoOpcional(300),
});

export const esquemaConteo = z.object({
  // null = deshacer el conteo de ese producto
  cantidad_contada: z.preprocess((v) => (v === '' ? null : v), zCantidadCero.nullable()),
});

export const esquemaCerrarInventario = z.object({ observaciones: textoOpcional(300) });

export const esquemaPagoProveedor = z
  .object({
    importe: zPesosPositivo,
    medio_pago: z.enum(MEDIOS_PAGO_PROVEEDOR),
    caja_id: zId.optional(),
    referencia: textoOpcional(60),
    fecha: fecha.optional(),
    descripcion: textoOpcional(200),
    cheque_numero: textoOpcional(30),
    cheque_banco: textoOpcional(60),
    cheque_fecha_cobro: fechaOpcional,
  })
  .refine((p) => p.medio_pago !== 'EFECTIVO_CAJA' || p.caja_id, { message: 'Elegí de qué caja sale la plata', path: ['caja_id'] })
  .refine((p) => p.medio_pago !== 'CHEQUE' || p.cheque_fecha_cobro, { message: 'Completá la fecha de cobro del cheque', path: ['cheque_fecha_cobro'] });

export const esquemaNotaCredito = z.object({
  importe: zPesosPositivo,
  referencia: textoOpcional(60),
  fecha: fecha.optional(),
  descripcion: textoRequerido('el detalle', 200),
});

export const esquemaAnularMovimientoProveedor = z.object({
  motivo: textoRequerido('por qué se anula', 200).refine((v) => v.length >= 3, { message: 'Contá un poco más por qué' }),
  caja_id: zId.optional(),
});

const fechaVaciaOpcional = z.preprocess((v) => (v === '' ? undefined : v), fecha.optional());

export const esquemaResumenCuenta = z
  .object({ desde: fechaVaciaOpcional, hasta: fechaVaciaOpcional })
  .refine((r) => !r.desde || !r.hasta || r.desde <= r.hasta, { message: 'La fecha "desde" tiene que ser anterior a "hasta"', path: ['desde'] });
export const esquemaResumenProveedor = esquemaResumenCuenta;

// ---------- Fase 3: clientes, fiado, reportes ----------
export const esquemaCliente = z.object({
  nombre: textoRequerido('el nombre', 100),
  telefono: textoOpcional(50),
  documento: textoOpcional(20),
  direccion: textoOpcional(200),
  limite_credito: z.preprocess((v) => (v === '' || v === undefined ? null : v), zPesos.nullable()).optional(),
  cuenta_corriente: z.boolean().optional(),
  plazo_pago_dias: zPlazoDias,
  notas: textoOpcional(500),
  activo: z.boolean().optional(),
  pinAutorizacion: pinOpcional,
});

export const esquemaAnularCobroCliente = z.object({
  motivo: textoRequerido('por qué se anula', 200).refine((v) => v.length >= 3, { message: 'Contá un poco más por qué' }),
  caja_id: zId.optional(),
  pinAutorizacion: pinOpcional,
});

export const esquemaCobroCliente = z.object({
  importe: zPesosPositivo,
  medio: z.enum(MEDIOS_PAGO).default('EFECTIVO'),
  caja_id: zId,
  descripcion: textoOpcional(200),
});

export const esquemaAjusteCliente = z.object({
  importe: zPesosPositivo,
  sentido: z.enum(['BAJAR', 'SUBIR'], { errorMap: () => ({ message: 'Elegí si baja o sube la deuda' }) }),
  motivo: textoRequerido('el motivo', 200),
});

export const esquemaFiltroReporte = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  formato: z.enum(['json', 'xlsx', 'pdf']).default('json'),
});

// ---------- Listados genéricos ----------
export const esquemaListado = z.object({
  q: z.string().trim().max(100).optional(),
  activo: z.enum(['true', 'false', 'todos']).optional(),
  categoria_id: z.coerce.number().int().positive().optional(),
  proveedor_id: z.coerce.number().int().positive().optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  bajo_minimo: z.enum(['true', 'false']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(500).default(100),
});
