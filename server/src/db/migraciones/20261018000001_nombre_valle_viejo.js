// El negocio pasa a llamarse "Pescadería Valle Viejo". Solo se cambia si todavía tiene el nombre genérico de fábrica.
export async function up(knex) {
  await knex.raw(`
    UPDATE configuracion
       SET valor = jsonb_set(valor, '{nombre}', '"Pescadería Valle Viejo"')
     WHERE clave = 'negocio' AND valor->>'nombre' IN ('Pescadería', '')
  `);
}

export async function down() {}
