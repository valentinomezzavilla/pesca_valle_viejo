// Store de sesiones de express-session sobre Knex: comparte el pool de la app
// (no abre conexiones aparte) y se puede revocar una sesión borrando su fila.
import session from 'express-session';

export class KnexSessionStore extends session.Store {
  constructor({ knex, tabla = 'sesiones', limpiezaMs = 15 * 60 * 1000 }) {
    super();
    this.knex = knex;
    this.tabla = tabla;
    if (limpiezaMs > 0) {
      this.timer = setInterval(() => this.limpiar().catch(() => {}), limpiezaMs);
      this.timer.unref();
    }
  }

  #vencimiento(sess) {
    const expira = sess?.cookie?.expires;
    return expira ? new Date(expira) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  get(sid, cb) {
    this.knex(this.tabla)
      .where({ sid })
      .andWhere('expire', '>', new Date())
      .first('sess')
      .then((fila) => cb(null, fila ? fila.sess : null), cb);
  }

  set(sid, sess, cb) {
    this.knex(this.tabla)
      .insert({ sid, sess: JSON.stringify(sess), expire: this.#vencimiento(sess) })
      .onConflict('sid')
      .merge()
      .then(() => cb?.(null), (err) => cb?.(err));
  }

  touch(sid, sess, cb) {
    this.knex(this.tabla)
      .where({ sid })
      .update({ expire: this.#vencimiento(sess) })
      .then(() => cb?.(null), (err) => cb?.(err));
  }

  destroy(sid, cb) {
    this.knex(this.tabla)
      .where({ sid })
      .del()
      .then(() => cb?.(null), (err) => cb?.(err));
  }

  limpiar() {
    return this.knex(this.tabla).where('expire', '<', new Date()).del();
  }

  cerrar() {
    clearInterval(this.timer);
  }
}
