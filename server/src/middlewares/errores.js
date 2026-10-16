import { ErrorApp } from '../lib/errores.js';
import { logger } from '../config/logger.js';

const MENSAJES_UNICOS = {
  ux_usuarios_usuario: 'Ya existe un usuario con ese nombre de usuario.',
  ux_categorias_nombre: 'Ya existe una categoría con ese nombre.',
  ux_productos_codigo: 'Ya hay otro producto con ese código.',
  ux_proveedores_nombre: 'Ya existe un proveedor con ese nombre.',
  ux_compras_documento: 'Ese remito o factura de este proveedor ya fue cargado.',
  ux_caja_sesion_abierta: 'Esa caja ya está abierta.',
  ux_inventario_abierto: 'Ya hay un inventario en curso.',
  cajas_nombre_key: 'Ya existe una caja con ese nombre.',
  categorias_gasto_nombre_key: 'Ya existe un rubro de gasto con ese nombre.',
  cc_proveedores_movimientos_anula_movimiento_id_key: 'Ese movimiento ya estaba anulado.',
  cc_clientes_movimientos_anula_movimiento_id_key: 'Ese cobro ya estaba anulado.',
};

export function noEncontrado(_req, res) {
  res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'La dirección pedida no existe.' } });
}

// eslint-disable-next-line no-unused-vars
export function manejadorErrores(err, req, res, _next) {
  if (err instanceof ErrorApp) {
    return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message, campos: err.campos } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { codigo: 'DATOS_INVALIDOS', mensaje: 'Los datos enviados no tienen un formato válido.' } });
  }
  // Errores de PostgreSQL que pueden llegar por carreras o datos raros
  if (err?.code === '23505') {
    const mensaje = MENSAJES_UNICOS[err.constraint] ?? 'Ese dato ya existe.';
    return res.status(409).json({ error: { codigo: 'DUPLICADO', mensaje } });
  }
  if (err?.code === '23503') {
    return res.status(409).json({ error: { codigo: 'EN_USO', mensaje: 'Ese registro está relacionado con otros datos y no se puede usar o borrar así.' } });
  }
  if (err?.code === '23514' || err?.code === '22003' || err?.code === '22P02') {
    logger.warn({ err, url: req.originalUrl }, 'Datos rechazados por la base');
    return res.status(400).json({ error: { codigo: 'DATOS_INVALIDOS', mensaje: 'Algún dato no es válido. Revisá los números ingresados.' } });
  }
  logger.error({ err, url: req.originalUrl, usuario: req.usuario?.id }, 'Error no controlado');
  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Probá de nuevo y, si sigue, avisá al administrador.' } });
}
