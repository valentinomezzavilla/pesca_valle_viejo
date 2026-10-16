import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const CONFIGURACION_INICIAL = {
  negocio: { nombre: 'Pescadería', direccion: '', telefono: '', cuit: '', mensaje_ticket: '¡Gracias por su compra!' },
  ticket_ancho: '80',
  punto_venta: 1,
  descuento_max_cajero: 10,
  dias_alerta_vencimiento: 2,
};

// Datos mínimos para que el sistema funcione. Es idempotente: se puede correr en cada deploy.
export async function seedBase(knex) {
  await knex('categorias')
    .insert([
      { nombre: 'Pescado fresco', orden: 1 },
      { nombre: 'Mariscos', orden: 2 },
      { nombre: 'Congelados', orden: 3 },
      { nombre: 'Elaborados', orden: 4 },
    ])
    .onConflict()
    .ignore();

  await knex('configuracion')
    .insert(Object.entries(CONFIGURACION_INICIAL).map(([clave, valor]) => ({ clave, valor: JSON.stringify(valor) })))
    .onConflict('clave')
    .ignore();

  await knex('cajas').insert({ nombre: 'Caja 1' }).onConflict('nombre').ignore();

  await knex('categorias_gasto')
    .insert(
      ['Hielo', 'Limpieza', 'Flete', 'Bolsas y envases', 'Sueldos', 'Servicios (luz, agua, gas)', 'Mantenimiento', 'Otros'].map(
        (nombre) => ({ nombre }),
      ),
    )
    .onConflict('nombre')
    .ignore();

  await knex('numeradores').insert({ tipo: 'TICKET_INTERNO', punto_venta: 1 }).onConflict(['tipo', 'punto_venta']).ignore();

  const { count } = await knex('usuarios').count('* as count').first();
  if (count === 0) {
    const password = env.ADMIN_PASSWORD ?? (env.NODE_ENV === 'production' ? null : 'admin1234');
    if (!password) throw new Error('Definí ADMIN_PASSWORD para crear el primer usuario dueño.');
    const pin = env.ADMIN_PIN ?? '1234';
    await knex('usuarios').insert({
      nombre: 'Dueño',
      usuario: env.ADMIN_USUARIO,
      password_hash: await bcrypt.hash(password, 10),
      pin_hash: await bcrypt.hash(pin, 10),
      rol: 'DUENO',
    });
    logger.warn(`Usuario dueño creado: "${env.ADMIN_USUARIO}". Cambiá la contraseña y el PIN desde "Mi cuenta".`);
  }
}
