import { Router } from 'express';
import { db } from './config/db.js';
import { requiereSesion } from './middlewares/auth.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usuariosRouter } from './modules/usuarios/usuarios.routes.js';
import { configuracionRouter } from './modules/configuracion/configuracion.routes.js';
import { auditoriaRouter } from './modules/auditoria/auditoria.routes.js';
import { categoriasRouter } from './modules/categorias/categorias.routes.js';
import { productosRouter } from './modules/productos/productos.routes.js';
import { proveedoresRouter } from './modules/proveedores/proveedores.routes.js';
import { comprasRouter } from './modules/compras/compras.routes.js';
import { stockRouter } from './modules/stock/stock.routes.js';
import { ventasRouter } from './modules/ventas/ventas.routes.js';
import { comprobantesRouter } from './modules/comprobantes/comprobantes.routes.js';
import { reportesRouter } from './modules/reportes/reportes.routes.js';
import { clientesRouter } from './modules/clientes/clientes.routes.js';
import { mermasRouter } from './modules/mermas/mermas.routes.js';
import { inventarioRouter } from './modules/inventario/inventario.routes.js';
import { cajasRouter, cajaSesionesRouter, categoriasGastoRouter } from './modules/caja/caja.routes.js';

export const rutas = Router();

rutas.get('/salud', async (_req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ ok: true, base: 'ok', hora: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, base: 'sin conexión' });
  }
});

rutas.use('/auth', authRouter);

// Todo lo demás necesita sesión
rutas.use(requiereSesion);
rutas.use('/usuarios', usuariosRouter);
rutas.use('/configuracion', configuracionRouter);
rutas.use('/auditoria', auditoriaRouter);
rutas.use('/categorias', categoriasRouter);
rutas.use('/productos', productosRouter);
rutas.use('/proveedores', proveedoresRouter);
rutas.use('/compras', comprasRouter);
rutas.use('/stock', stockRouter);
rutas.use('/mermas', mermasRouter);
rutas.use('/clientes', clientesRouter);
rutas.use('/reportes', reportesRouter);
rutas.use('/inventarios', inventarioRouter);
rutas.use('/ventas', ventasRouter);
rutas.use('/comprobantes', comprobantesRouter);
rutas.use('/cajas', cajasRouter);
rutas.use('/caja-sesiones', cajaSesionesRouter);
rutas.use('/categorias-gasto', categoriasGastoRouter);
