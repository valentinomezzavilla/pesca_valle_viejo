import bcrypt from 'bcryptjs';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as repo from './usuarios.repository.js';

const RONDAS = 10;

export function listar() {
  return repo.listar(db);
}

export async function crear(ctx, { nombre, usuario, password, rol, pin }) {
  return db.transaction(async (trx) => {
    const nuevo = await repo.insertar(trx, {
      nombre,
      usuario,
      rol,
      password_hash: await bcrypt.hash(password, RONDAS),
      pin_hash: pin ? await bcrypt.hash(pin, RONDAS) : null,
    });
    await auditoria.registrar(trx, ctx, { accion: 'USUARIO_CREADO', entidad: 'usuario', entidadId: nuevo.id, despues: { nombre, usuario, rol } });
    return nuevo;
  });
}

export async function actualizar(ctx, id, { nombre, rol, activo, pin }) {
  return db.transaction(async (trx) => {
    const actual = await repo.buscarPorId(trx, id);
    if (!actual) throw new ErrorNoEncontrado('El usuario');
    const esUnoMismo = id === ctx.usuario.id;
    if (esUnoMismo && activo === false) throw new ErrorNegocio('No podés desactivar tu propio usuario.');
    if (esUnoMismo && rol && rol !== actual.rol) throw new ErrorNegocio('No podés cambiar tu propio rol.');
    const dejaDeSerDuenoActivo = actual.rol === 'DUENO' && actual.activo && (rol === 'CAJERO' || activo === false);
    if (dejaDeSerDuenoActivo && (await repo.contarDuenosActivos(trx, id)) === 0) {
      throw new ErrorNegocio('Tiene que quedar al menos un dueño activo.');
    }
    const cambios = {};
    if (nombre !== undefined) cambios.nombre = nombre;
    if (rol !== undefined) cambios.rol = rol;
    if (activo !== undefined) cambios.activo = activo;
    if (pin) cambios.pin_hash = await bcrypt.hash(pin, RONDAS);
    const actualizado = Object.keys(cambios).length ? await repo.actualizar(trx, id, cambios) : actual;
    if (activo === false) await repo.borrarSesionesDe(trx, id);
    await auditoria.registrar(trx, ctx, {
      accion: 'USUARIO_MODIFICADO',
      entidad: 'usuario',
      entidadId: id,
      antes: { nombre: actual.nombre, rol: actual.rol, activo: actual.activo },
      despues: { nombre: actualizado.nombre, rol: actualizado.rol, activo: actualizado.activo, pin_cambiado: !!pin },
    });
    return { id: actualizado.id, nombre: actualizado.nombre, usuario: actualizado.usuario, rol: actualizado.rol, activo: actualizado.activo };
  });
}

export async function resetearPassword(ctx, id, password) {
  return db.transaction(async (trx) => {
    const actual = await repo.buscarPorId(trx, id);
    if (!actual) throw new ErrorNoEncontrado('El usuario');
    await repo.actualizar(trx, id, { password_hash: await bcrypt.hash(password, RONDAS) });
    await repo.borrarSesionesDe(trx, id);
    await auditoria.registrar(trx, ctx, { accion: 'PASSWORD_BLANQUEADA', entidad: 'usuario', entidadId: id });
  });
}
