import { aCosto, aPesos, dec, redondear, sumar } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import { sumarDias } from '../../lib/fechas.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as caja from '../caja/caja.service.js';
import * as stock from '../stock/stock.service.js';
import * as repo from './compras.repository.js';

export const listar = (filtros) => repo.listar(db, filtros);

export async function obtener(id) {
  const compra = await repo.buscarPorId(db, id);
  if (!compra) throw new ErrorNoEncontrado('El ingreso de mercadería');
  compra.items = await repo.items(db, id);
  return compra;
}

// Normaliza cada línea: se puede cargar el costo por kg/unidad o el total de la línea (como viene en el remito)
function normalizarItem(item) {
  if (item.subtotal !== undefined) {
    const subtotal = redondear(item.subtotal, 2);
    return { ...item, subtotal, costo: redondear(subtotal.div(item.cantidad), 4) };
  }
  const costo = redondear(item.costo_unitario, 4);
  return { ...item, costo, subtotal: redondear(costo.times(item.cantidad), 2) };
}

/**
 * Ingreso de mercadería: crea la compra, un lote por línea (FIFO), suma stock, actualiza el costo de referencia
 * y registra la deuda con el proveedor. Si se pagó en el momento, registra también el pago
 * (y el egreso de caja si fue en efectivo).
 */
export async function crear(ctx, datos) {
  return db.transaction(async (trx) => {
    const proveedor = await trx('proveedores').where({ id: datos.proveedor_id }).first();
    if (!proveedor || !proveedor.activo) throw new ErrorNoEncontrado('El proveedor');

    const items = datos.items.map(normalizarItem);
    const total = sumar(items.map((i) => i.subtotal));
    const productos = await stock.bloquearProductos(trx, items.map((i) => i.producto_id));
    for (const it of items) {
      const p = productos.get(it.producto_id);
      if (!p.activo) throw new ErrorNegocio(`El producto "${p.nombre}" está dado de baja.`);
      if (p.unidad === 'UNIDAD' && !dec(it.cantidad).isInteger()) {
        throw new ErrorNegocio(`"${p.nombre}" se maneja por unidad: la cantidad tiene que ser entera.`);
      }
    }

    let sesionCaja = null;
    if (datos.condicion === 'CONTADO' && datos.medio_pago === 'EFECTIVO_CAJA') {
      sesionCaja = await caja.sesionAbiertaParaOperar(trx, datos.caja_id);
    }

    const [compra] = await trx('compras')
      .insert({
        proveedor_id: datos.proveedor_id,
        fecha: datos.fecha,
        tipo_documento: datos.tipo_documento,
        numero_documento: datos.numero_documento ?? null,
        condicion: datos.condicion,
        total: aPesos(total),
        observaciones: datos.observaciones ?? null,
        usuario_id: ctx.usuario.id,
      })
      .returning('*');

    for (const it of items) {
      const p = productos.get(it.producto_id);
      const vencimiento = it.fecha_vencimiento ?? (p.controla_vencimiento && p.dias_vida_util ? sumarDias(datos.fecha, p.dias_vida_util) : null);
      const [ci] = await trx('compra_items')
        .insert({
          compra_id: compra.id,
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          costo_unitario: aCosto(it.costo),
          subtotal: aPesos(it.subtotal),
          fecha_vencimiento: vencimiento,
        })
        .returning('id');
      await stock.ingresar(trx, {
        productoId: it.producto_id,
        cantidad: it.cantidad,
        costoUnitario: it.costo,
        fechaVencimiento: vencimiento,
        origenLote: 'COMPRA',
        compraItemId: ci.id,
        tipoMovimiento: 'COMPRA',
        origenMov: { compra_item_id: ci.id },
        usuarioId: ctx.usuario.id,
      });
      await trx('productos').where({ id: it.producto_id }).update({ costo_referencia: aCosto(it.costo) });
    }

    if (total.gt(0)) {
      await trx('cc_proveedores_movimientos').insert({
        proveedor_id: datos.proveedor_id,
        tipo: 'COMPRA',
        importe: aPesos(total),
        compra_id: compra.id,
        fecha: datos.fecha,
        descripcion: `${datos.tipo_documento} ${datos.numero_documento ?? ''}`.trim(),
        usuario_id: ctx.usuario.id,
      });

      if (datos.condicion === 'CONTADO') {
        let cajaMov = null;
        if (sesionCaja) {
          cajaMov = await caja.registrarMovimiento(trx, {
            sesionId: sesionCaja.id,
            tipo: 'PAGO_PROVEEDOR',
            medio: 'EFECTIVO',
            importe: total.neg(),
            descripcion: `${proveedor.nombre} — ingreso #${compra.id}`,
            usuarioId: ctx.usuario.id,
          });
        }
        await trx('cc_proveedores_movimientos').insert({
          proveedor_id: datos.proveedor_id,
          tipo: 'PAGO',
          compra_id: compra.id,
          importe: aPesos(total.neg()),
          medio_pago: datos.medio_pago,
          caja_movimiento_id: cajaMov?.id ?? null,
          fecha: datos.fecha,
          descripcion: `Pago de la compra #${compra.id}`,
          usuario_id: ctx.usuario.id,
        });
      }
    }

    await auditoria.registrar(trx, ctx, {
      accion: 'COMPRA_REGISTRADA',
      entidad: 'compra',
      entidadId: compra.id,
      despues: { proveedor: proveedor.nombre, total: compra.total, condicion: compra.condicion, items: items.length },
    });
    return compra;
  });
}

/**
 * Anula un ingreso si su mercadería todavía no se tocó. Revierte stock y la deuda.
 * Si se había pagado en el momento, el pago queda registrado: el saldo queda a favor
 * (el proveedor nos debe) y se resuelve con el proveedor.
 */
export async function anular(ctx, id, { motivo }) {
  return db.transaction(async (trx) => {
    const compra = await trx('compras').where({ id }).forUpdate().first();
    if (!compra) throw new ErrorNoEncontrado('El ingreso de mercadería');
    if (compra.estado === 'ANULADA') throw new ErrorNegocio('Este ingreso ya estaba anulado.');
    const items = await trx('compra_items').where({ compra_id: id }).orderBy('producto_id');
    for (const it of items) {
      const lote = await trx('lotes').where({ compra_item_id: it.id }).first();
      await stock.retirarLoteCompleto(trx, { lote, compraItemId: it.id, usuarioId: ctx.usuario.id });
    }
    if (dec(compra.total).gt(0)) {
      await trx('cc_proveedores_movimientos').insert({
        proveedor_id: compra.proveedor_id,
        tipo: 'ANULACION_COMPRA',
        importe: aPesos(dec(compra.total).neg()),
        compra_id: id,
        descripcion: `Anulación: ${motivo}`,
        usuario_id: ctx.usuario.id,
      });
    }
    const [anulada] = await trx('compras')
      .where({ id })
      .update({ estado: 'ANULADA', anulada_por_id: ctx.usuario.id, anulada_en: trx.fn.now(), motivo_anulacion: motivo })
      .returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'COMPRA_ANULADA', entidad: 'compra', entidadId: id, motivo, antes: { estado: compra.estado, total: compra.total } });
    return anulada;
  });
}
