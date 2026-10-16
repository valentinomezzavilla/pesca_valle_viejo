import { Router } from 'express';
import {
  esquemaProveedor, esquemaListado, esquemaPagoProveedor, esquemaNotaCredito, esquemaAnularMovimientoProveedor, esquemaResumenProveedor,
} from '@pescaderia/shared';
import { requierePermiso, puede } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx } from '../../lib/http.js';
import * as service from './proveedores.service.js';
import * as cuenta from './cuenta.service.js';
import * as resumen from './resumen.service.js';

export const proveedoresRouter = Router();
const editar = requierePermiso('proveedores.editar');

proveedoresRouter.get('/', validar(esquemaListado, 'query'), async (req, res) => {
  // El saldo y los vencimientos con el proveedor son información del dueño
  res.json(await service.listar(req.datos, { conSaldos: puede(req, 'proveedores.editar') }));
});

proveedoresRouter.get('/:id', async (req, res) => {
  res.json(await service.obtener(Number(req.params.id)));
});

proveedoresRouter.post('/', editar, validar(esquemaProveedor), async (req, res) => {
  res.status(201).json(await service.crear(ctx(req), req.datos));
});

proveedoresRouter.put('/:id', editar, validar(esquemaProveedor.partial()), async (req, res) => {
  res.json(await service.actualizar(ctx(req), Number(req.params.id), req.datos));
});

// Saldo, vencimientos, compras sin pagar, productos y movimientos: es información del dueño
proveedoresRouter.get('/:id/ficha', editar, async (req, res) => {
  res.json(await cuenta.ficha(Number(req.params.id)));
});

proveedoresRouter.post('/:id/pagos', requierePermiso('proveedores.pagar'), validar(esquemaPagoProveedor), async (req, res) => {
  res.status(201).json(await cuenta.registrarPago(ctx(req), Number(req.params.id), req.datos));
});

proveedoresRouter.post('/:id/notas-credito', requierePermiso('proveedores.pagar'), validar(esquemaNotaCredito), async (req, res) => {
  res.status(201).json(await cuenta.registrarNotaCredito(ctx(req), Number(req.params.id), req.datos));
});

proveedoresRouter.post(
  '/:id/movimientos/:movId/anular',
  requierePermiso('proveedores.pagar'),
  validar(esquemaAnularMovimientoProveedor),
  async (req, res) => {
    res.status(201).json(await cuenta.anularMovimiento(ctx(req), Number(req.params.id), Number(req.params.movId), req.datos));
  },
);

proveedoresRouter.get('/:id/resumen.pdf', editar, validar(esquemaResumenProveedor, 'query'), async (req, res) => {
  const archivo = await resumen.resumenPdf(Number(req.params.id), req.datos);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(archivo.buffer);
});
