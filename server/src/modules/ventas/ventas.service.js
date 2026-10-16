import { aPesos, calcularVenta, dec, sumar, validarCalculoVenta } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as auth from '../auth/auth.service.js';
import * as caja from '../caja/caja.service.js';
import * as comprobantes from '../comprobantes/comprobantes.service.js';
import * as clientes from '../clientes/clientes.service.js';
import * as configuracion from '../configuracion/configuracion.service.js';
import * as stock from '../stock/stock.service.js';
import * as repo from './ventas.repository.js';

/**
 * Confirma una venta. Todo en UNA transacción:
 * venta + ítems + descuento de stock FIFO (costo real) + pagos + movimientos de caja + ticket interno.
 * Los precios salen SIEMPRE de la base (el cliente solo manda producto y cantidad).
 */
export async function crear(ctx, datos) {
  return db.transaction(async (trx) => {
    const sesion = await caja.sesionAbiertaParaOperar(trx, datos.caja_id);

    // Bloquea los productos en orden de id (evita deadlocks entre ventas simultáneas)
    const productos = await stock.bloquearProductos(trx, datos.items.map((i) => i.producto_id));
    const itemsConPrecio = datos.items.map((i) => {
      const p = productos.get(i.producto_id);
      if (!p.activo) throw new ErrorNegocio(`"${p.nombre}" está dado de baja y no se puede vender.`);
      if (p.unidad === 'UNIDAD' && !dec(i.cantidad).isInteger()) {
        throw new ErrorNegocio(`"${p.nombre}" se vende por unidad: la cantidad tiene que ser entera.`);
      }
      return { ...i, precioUnitario: p.precio_venta, producto: p };
    });

    const calculo = calcularVenta({ items: itemsConPrecio, descuentoGlobal: datos.descuento_global ?? 0 });
    const error = validarCalculoVenta(calculo);
    if (error) throw new ErrorNegocio(error, 'DESCUENTO_INVALIDO', 400);

    // Descuento por encima del máximo del cajero → PIN del dueño
    let autorizadoPorId = null;
    const maxCajero = dec(await configuracion.obtener(trx, 'descuento_max_cajero'));
    if (calculo.porcentajeDescuento.gt(maxCajero)) {
      autorizadoPorId = await auth.autorizar(trx, ctx, 'ventas.descuento_libre', datos.pinAutorizacion);
    }

    // Pagos
    const montoFiado = sumar(datos.pagos.filter((p) => p.medio === 'CUENTA_CORRIENTE').map((p) => p.monto));
    let cliente = null;
    let autorizoLimiteId = null;
    if (datos.cliente_id) cliente = await clientes.bloquearCliente(trx, datos.cliente_id);
    if (montoFiado.gt(0)) {
      if (!cliente) throw new ErrorNegocio('Para fiar tenés que elegir a qué cliente.', 'FIADO_SIN_CLIENTE', 400);
      if (!cliente.cuenta_corriente) {
        throw new ErrorNegocio(`${cliente.nombre} no tiene cuenta corriente. Habilitala desde Clientes.`, 'SIN_CUENTA_CORRIENTE');
      }
      // Pasarse del límite de crédito necesita el PIN del dueño
      if (cliente.limite_credito !== null) {
        const deudaConEsta = (await clientes.saldoDe(trx, cliente.id)).plus(montoFiado);
        if (deudaConEsta.gt(cliente.limite_credito)) {
          autorizoLimiteId = await auth.autorizar(
            trx, ctx, 'clientes.exceder_limite', datos.pinAutorizacion,
            `${cliente.nombre} se pasa de su límite de crédito ($${aPesos(cliente.limite_credito)}). Pedile el PIN al dueño para fiarle igual.`,
          );
        }
      }
    }
    const totalPagos = sumar(datos.pagos.map((p) => p.monto));
    if (!totalPagos.eq(calculo.total)) {
      throw new ErrorNegocio(
        `Los pagos ($${aPesos(totalPagos)}) no coinciden con el total de la venta ($${aPesos(calculo.total)}).`,
        'PAGOS_NO_COINCIDEN',
        400,
      );
    }
    const efectivo = sumar(datos.pagos.filter((p) => p.medio === 'EFECTIVO').map((p) => p.monto));
    let vuelto = dec(0);
    if (datos.efectivo_recibido !== undefined) {
      if (dec(datos.efectivo_recibido).lt(efectivo)) {
        throw new ErrorNegocio('El efectivo recibido es menor que lo que se paga en efectivo.', 'EFECTIVO_INSUFICIENTE', 400);
      }
      vuelto = dec(datos.efectivo_recibido).minus(efectivo);
    }

    const [venta] = await trx('ventas')
      .insert({
        caja_sesion_id: sesion.id,
        usuario_id: ctx.usuario.id,
        cliente_id: cliente?.id ?? null,
        subtotal: aPesos(calculo.subtotal),
        descuento_items: aPesos(calculo.descuentoItems),
        descuento_global: aPesos(calculo.descuentoGlobal),
        total: aPesos(calculo.total),
        vuelto: aPesos(vuelto),
      })
      .returning('*');

    // Ítems + stock. Se procesan en orden de producto para tomar los locks de lotes siempre igual.
    const lineas = calculo.lineas.map((l, i) => ({ ...l, orden: i })).sort((a, b) => a.producto_id - b.producto_id || a.orden - b.orden);
    let costoVenta = dec(0);
    const faltantes = [];
    const itemsGuardados = [];
    for (const l of lineas) {
      const [item] = await trx('venta_items')
        .insert({
          venta_id: venta.id,
          producto_id: l.producto_id,
          descripcion: l.producto.nombre,
          unidad: l.producto.unidad,
          cantidad: l.cantidad,
          precio_unitario: l.producto.precio_venta,
          subtotal: aPesos(l.subtotal),
          descuento: aPesos(l.descuento),
          descuento_prorrateado: aPesos(l.descuentoProrrateado),
          total: aPesos(l.total),
        })
        .returning('*');
      const consumo = await stock.consumir(trx, {
        productoId: l.producto_id,
        cantidad: l.cantidad,
        tipo: 'VENTA',
        origen: { venta_item_id: item.id },
        usuarioId: ctx.usuario.id,
      });
      await trx('venta_items').where({ id: item.id }).update({ costo_total: aPesos(consumo.costoTotal) });
      costoVenta = costoVenta.plus(consumo.costoTotal);
      if (consumo.faltante.gt(0)) faltantes.push({ producto: l.producto.nombre, cantidad: consumo.faltante.toFixed(3) });
      itemsGuardados.push({ ...item, costo_total: aPesos(consumo.costoTotal), orden: l.orden });
    }
    await trx('ventas').where({ id: venta.id }).update({ costo_total: aPesos(costoVenta) });

    for (const p of datos.pagos) {
      await trx('venta_pagos').insert({ venta_id: venta.id, medio: p.medio, monto: p.monto, referencia: p.referencia ?? null });
      // El fiado no mueve la caja: queda como deuda del cliente
      if (p.medio === 'CUENTA_CORRIENTE') continue;
      await caja.registrarMovimiento(trx, {
        sesionId: sesion.id,
        tipo: 'VENTA',
        medio: p.medio,
        importe: p.monto,
        ventaId: venta.id,
        usuarioId: ctx.usuario.id,
      });
    }

    if (montoFiado.gt(0)) {
      await trx('cc_clientes_movimientos').insert({
        cliente_id: cliente.id,
        tipo: 'VENTA',
        importe: aPesos(montoFiado),
        venta_id: venta.id,
        usuario_id: ctx.usuario.id,
      });
    }

    const comprobante = await comprobantes.emitirTicketInterno(trx, venta, cliente);

    if (autorizoLimiteId && autorizoLimiteId !== ctx.usuario.id) {
      await auditoria.registrar(trx, ctx, {
        accion: 'FIADO_LIMITE_EXCEDIDO',
        entidad: 'venta',
        entidadId: venta.id,
        despues: { cliente: cliente.nombre, limite: cliente.limite_credito, fiado: aPesos(montoFiado) },
        autorizadoPorId: autorizoLimiteId,
      });
    }
    if (autorizadoPorId && autorizadoPorId !== ctx.usuario.id) {
      await auditoria.registrar(trx, ctx, {
        accion: 'DESCUENTO_AUTORIZADO',
        entidad: 'venta',
        entidadId: venta.id,
        despues: { porcentaje: calculo.porcentajeDescuento.toFixed(2), total: venta.total },
        autorizadoPorId,
      });
    }

    return {
      venta: { ...venta, costo_total: aPesos(costoVenta) },
      items: itemsGuardados.sort((a, b) => a.orden - b.orden).map(({ orden, ...i }) => i),
      comprobante: { ...comprobante, numero_formateado: comprobantes.numeroFormateado(comprobante) },
      faltantes,
    };
  });
}

/**
 * Anula una venta: devuelve la mercadería a los mismos lotes, devuelve la plata (movimientos negativos
 * en la caja abierta) y anula el comprobante. Cajero: necesita PIN del dueño.
 */
export async function anular(ctx, id, { motivo, pinAutorizacion, caja_id }) {
  return db.transaction(async (trx) => {
    const venta = await trx('ventas').where({ id }).forUpdate().first();
    if (!venta) throw new ErrorNoEncontrado('La venta');
    if (venta.estado === 'ANULADA') throw new ErrorNegocio('Esta venta ya estaba anulada.', 'YA_ANULADA');
    const autorizadoPorId = await auth.autorizar(trx, ctx, 'ventas.anular', pinAutorizacion);

    // La plata se devuelve desde la caja del turno original si sigue abierta; si no, desde la caja indicada
    let sesion = await trx('caja_sesiones').where({ id: venta.caja_sesion_id, estado: 'ABIERTA' }).forShare().first();
    if (!sesion) {
      if (!caja_id) throw new ErrorNegocio('El turno de esa venta ya cerró. Elegí desde qué caja abierta se devuelve la plata.', 'ELEGIR_CAJA', 400);
      sesion = await caja.sesionAbiertaParaOperar(trx, caja_id);
    }

    const movimientos = await repo.movimientosStockDeVenta(trx, id);
    await stock.bloquearProductos(trx, movimientos.map((m) => m.producto_id));
    for (const m of movimientos) {
      await stock.devolver(trx, {
        productoId: m.producto_id,
        cantidad: dec(m.cantidad).neg(),
        loteId: m.lote_id,
        costoUnitario: m.costo_unitario,
        tipo: 'ANULACION_VENTA',
        origenMov: { venta_item_id: m.venta_item_id },
        usuarioId: ctx.usuario.id,
      });
    }

    const pagos = await repo.pagos(trx, id);
    for (const p of pagos) {
      if (p.medio === 'CUENTA_CORRIENTE') {
        // La deuda del cliente por esta venta se cancela
        await trx('clientes').where({ id: venta.cliente_id }).forUpdate().first('id'); // aunque ya esté dado de baja
        await trx('cc_clientes_movimientos').insert({
          cliente_id: venta.cliente_id,
          tipo: 'ANULACION_VENTA',
          importe: aPesos(dec(p.monto).neg()),
          venta_id: id,
          descripcion: motivo,
          usuario_id: ctx.usuario.id,
        });
        continue;
      }
      await caja.registrarMovimiento(trx, {
        sesionId: sesion.id,
        tipo: 'ANULACION_VENTA',
        medio: p.medio,
        importe: dec(p.monto).neg(),
        ventaId: id,
        descripcion: motivo,
        usuarioId: ctx.usuario.id,
      });
    }

    await comprobantes.anularDeVenta(trx, id);
    const [anulada] = await trx('ventas')
      .where({ id })
      .update({
        estado: 'ANULADA',
        anulada_por_id: ctx.usuario.id,
        anulacion_autorizada_por_id: autorizadoPorId,
        anulada_en: trx.fn.now(),
        motivo_anulacion: motivo,
      })
      .returning('*');

    await auditoria.registrar(trx, ctx, {
      accion: 'VENTA_ANULADA',
      entidad: 'venta',
      entidadId: id,
      antes: { estado: 'CONFIRMADA', total: venta.total },
      motivo,
      autorizadoPorId,
    });
    return anulada;
  });
}

export async function listar(filtros) {
  const [ventas, resumen] = await Promise.all([repo.listar(db, filtros), repo.totales(db, filtros)]);
  return { ventas, resumen: { cantidad: Number(resumen.cantidad), total: aPesos(resumen.total), costo_total: aPesos(resumen.costo_total) } };
}

export async function obtener(id) {
  const venta = await repo.buscarPorId(db, id);
  if (!venta) throw new ErrorNoEncontrado('La venta');
  const [items, pagos, comps] = await Promise.all([repo.items(db, id), repo.pagos(db, id), repo.comprobantes(db, id)]);
  return {
    ...venta,
    items,
    pagos,
    comprobantes: comps.map((c) => ({ ...c, numero_formateado: comprobantes.numeroFormateado(c) })),
  };
}
