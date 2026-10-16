import { Router } from 'express';
import { z } from 'zod';
import {
  esquemaCliente, esquemaListado, esquemaCobroCliente, esquemaAjusteCliente, esquemaAnularCobroCliente, esquemaResumenCuenta,
} from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx } from '../../lib/http.js';
import * as service from './clientes.service.js';
import * as resumen from './resumen.service.js';

export const clientesRouter = Router();
clientesRouter.use(requierePermiso('clientes.operar'));

const esquemaFiltro = esquemaListado.extend({ con_deuda: z.enum(['true', 'false']).optional() });

clientesRouter.get('/', validar(esquemaFiltro, 'query'), async (req, res) => {
  res.json(await service.listar(req.datos));
});

clientesRouter.get('/:id', async (req, res) => {
  res.json(await service.obtener(Number(req.params.id)));
});

// Saldo, vencimientos, compras sin pagar y movimientos
clientesRouter.get('/:id/ficha', async (req, res) => {
  res.json(await service.ficha(Number(req.params.id)));
});

clientesRouter.post('/', validar(esquemaCliente), async (req, res) => {
  res.status(201).json(await service.crear(ctx(req), req.datos));
});

clientesRouter.put('/:id', validar(esquemaCliente.partial()), async (req, res) => {
  res.json(await service.actualizar(ctx(req), Number(req.params.id), req.datos));
});

clientesRouter.post('/:id/cobros', validar(esquemaCobroCliente), async (req, res) => {
  res.status(201).json(await service.registrarCobro(ctx(req), Number(req.params.id), req.datos));
});

clientesRouter.post('/:id/ajustes', requierePermiso('clientes.ajustar'), validar(esquemaAjusteCliente), async (req, res) => {
  res.status(201).json(await service.ajustar(ctx(req), Number(req.params.id), req.datos));
});

// El permiso (dueño, o cajero con PIN) se resuelve en el service
clientesRouter.post('/:id/movimientos/:movId/anular', validar(esquemaAnularCobroCliente), async (req, res) => {
  res.status(201).json(await service.anularCobro(ctx(req), Number(req.params.id), Number(req.params.movId), req.datos));
});

const enviarPdf = (res, archivo) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(archivo.buffer);
};

clientesRouter.get('/:id/resumen.pdf', validar(esquemaResumenCuenta, 'query'), async (req, res) => {
  enviarPdf(res, await resumen.resumenPdf(Number(req.params.id), req.datos));
});

clientesRouter.get('/:id/detalle-deuda.pdf', async (req, res) => {
  enviarPdf(res, await resumen.detalleDeudaPdf(Number(req.params.id)));
});
