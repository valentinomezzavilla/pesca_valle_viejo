export const ZONA_HORARIA = 'America/Argentina/Cordoba';

export const ROLES = { DUENO: 'DUENO', CAJERO: 'CAJERO' };
export const ROLES_ETIQUETA = { DUENO: 'Dueño', CAJERO: 'Cajero' };

export const UNIDADES = { KG: 'KG', UNIDAD: 'UNIDAD' };
export const UNIDADES_ETIQUETA = { KG: 'kg', UNIDAD: 'unidad' };

export const MEDIOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO'];
// Medios con los que entra plata a la caja. CUENTA_CORRIENTE (fiado) no mueve la caja: queda como deuda del cliente.
export const MEDIOS_PAGO_ETIQUETA = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA_DEBITO: 'Débito',
  TARJETA_CREDITO: 'Crédito',
  CUENTA_CORRIENTE: 'Cuenta corriente',
};

export const TIPOS_DOCUMENTO_COMPRA = ['REMITO', 'FACTURA', 'SIN_COMPROBANTE'];
export const TIPOS_DOCUMENTO_COMPRA_ETIQUETA = {
  REMITO: 'Remito',
  FACTURA: 'Factura',
  SIN_COMPROBANTE: 'Sin comprobante',
};

export const CONDICIONES_COMPRA = ['CONTADO', 'CUENTA_CORRIENTE'];
export const CONDICIONES_COMPRA_ETIQUETA = { CONTADO: 'Pagado en el momento', CUENTA_CORRIENTE: 'A cuenta (queda debiendo)' };

export const MEDIOS_PAGO_PROVEEDOR = ['EFECTIVO_CAJA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO'];
export const MEDIOS_PAGO_PROVEEDOR_ETIQUETA = {
  EFECTIVO_CAJA: 'Efectivo de la caja',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

export const TIPOS_MOV_CAJA_ETIQUETA = {
  APERTURA: 'Apertura',
  VENTA: 'Venta',
  ANULACION_VENTA: 'Venta anulada',
  COBRO_CLIENTE: 'Cobro de fiado',
  PAGO_PROVEEDOR: 'Pago a proveedor',
  ANULACION_PAGO_PROVEEDOR: 'Pago a proveedor anulado',
  ANULACION_COBRO_CLIENTE: 'Cobro de cuenta corriente anulado',
  GASTO: 'Gasto',
  RETIRO: 'Retiro',
  INGRESO: 'Ingreso de cambio',
};

// Movimientos que el usuario carga a mano en la caja
export const TIPOS_MOV_CAJA_MANUAL = ['GASTO', 'RETIRO', 'INGRESO'];

export const MOTIVOS_MERMA_ETIQUETA = {
  VENCIDO: 'Vencido',
  MAL_ESTADO: 'Mal estado',
  LIMPIEZA_FILETEADO: 'Limpieza / fileteado',
  CADENA_FRIO: 'Se cortó la cadena de frío',
  ROTURA: 'Rotura',
  OTRO: 'Otro',
};

export const MOTIVOS_MERMA = Object.keys(MOTIVOS_MERMA_ETIQUETA);

export const TIPOS_MOV_STOCK_ETIQUETA = {
  COMPRA: 'Ingreso de mercadería',
  ANULACION_COMPRA: 'Ingreso anulado',
  VENTA: 'Venta',
  ANULACION_VENTA: 'Venta anulada',
  MERMA: 'Merma',
  AJUSTE: 'Ajuste',
  INVENTARIO: 'Inventario',
};

export const TIPOS_MOV_CC_CLIENTE_ETIQUETA = {
  VENTA: 'Compra a cuenta',
  PAGO: 'Pago',
  ANULACION_VENTA: 'Venta anulada',
  AJUSTE: 'Ajuste',
  ANULACION_PAGO: 'Cobro anulado',
};

export const TIPOS_MOV_CC_PROVEEDOR_ETIQUETA = {
  COMPRA: 'Ingreso de mercadería',
  PAGO: 'Pago',
  NOTA_CREDITO: 'Nota de crédito',
  ANULACION_COMPRA: 'Ingreso anulado',
  AJUSTE: 'Ajuste',
  ANULACION_PAGO: 'Pago anulado',
  ANULACION_NOTA_CREDITO: 'Nota de crédito anulada',
};

export const LEYENDA_COMPROBANTE_INTERNO = 'Comprobante no válido como factura';

// Índice = Date#getUTCDay() (0 = domingo). En pantalla se muestran de lunes a domingo.
export const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const ORDEN_DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0];
