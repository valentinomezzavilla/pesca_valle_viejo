// Mapa de permisos por rol. Lo usa el backend para autorizar y el frontend para mostrar u ocultar botones.
// Si un permiso no incluye al CAJERO pero figura en PERMISOS_CON_PIN, el cajero puede hacerlo
// con el PIN del dueño en el momento.
export const PERMISOS = {
  'ventas.crear': ['DUENO', 'CAJERO'],
  'ventas.ver_todas': ['DUENO'],
  'ventas.anular': ['DUENO'],
  'ventas.descuento_libre': ['DUENO'],
  'costos.ver': ['DUENO'],
  'productos.editar': ['DUENO'],
  'compras.crear': ['DUENO', 'CAJERO'],
  'compras.anular': ['DUENO'],
  'proveedores.editar': ['DUENO'],
  'stock.ver': ['DUENO', 'CAJERO'],
  'caja.operar': ['DUENO', 'CAJERO'],
  'caja.retiro': ['DUENO'],
  'caja.historial': ['DUENO'],
  'caja.configurar': ['DUENO'],
  'usuarios.gestionar': ['DUENO'],
  'configuracion.editar': ['DUENO'],
  'auditoria.ver': ['DUENO'],
  // Fase 2: control de mercadería
  'mermas.registrar': ['DUENO', 'CAJERO'],
  'stock.ajustar': ['DUENO'],
  'inventario.contar': ['DUENO', 'CAJERO'],
  'inventario.cerrar': ['DUENO'],
  'proveedores.pagar': ['DUENO'],
  // Fase 3: clientes, fiado y reportes
  'clientes.operar': ['DUENO', 'CAJERO'],
  'clientes.ajustar': ['DUENO'],
  'clientes.exceder_limite': ['DUENO'],
  // Habilitar cuenta corriente, cambiar límite o plazo, anular un cobro
  'clientes.administrar_cuenta': ['DUENO'],
  'reportes.ver': ['DUENO'],
};

export const PERMISOS_CON_PIN = ['ventas.anular', 'ventas.descuento_libre', 'caja.retiro', 'stock.ajustar', 'clientes.exceder_limite', 'clientes.administrar_cuenta'];

export function tienePermiso(rol, permiso) {
  return PERMISOS[permiso]?.includes(rol) ?? false;
}

export function permisosDeRol(rol) {
  return Object.keys(PERMISOS).filter((p) => tienePermiso(rol, p));
}
