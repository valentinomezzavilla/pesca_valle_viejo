/**
 * Servidor TCP mínimo que expone un PGlite (PostgreSQL en WebAssembly) con el protocolo de Postgres.
 * SOLO para desarrollo y tests: en producción se usa PostgreSQL real.
 *
 * ¿Por qué no @electric-sql/pglite-socket? Dos problemas que rompen la conexión después de un error
 * (ej. violación de un CHECK) cuando el cliente está en otro proceso:
 *  1. Procesa cada evento 'data' en paralelo (setImmediate async); acá todo va en cadena y en orden.
 *  2. PGlite responde un ReadyForQuery ('Z') apenas falla un Execute, y otro al llegar el Sync. El protocolo
 *     manda uno solo (después del Sync): el 'Z' de más hace que el cliente asigne cada respuesta a la consulta
 *     siguiente. Acá se descartan los 'Z' que no responden a un Sync ('S') o a una consulta simple ('Q').
 *
 * Acepta una conexión a la vez (PGlite tiene una sola sesión): usar pool de 1 conexión.
 */
import net from 'node:net';

const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;
const PROTOCOLO_V3 = 196608;

// Quita los mensajes ReadyForQuery ('Z') de una respuesta del servidor
function sinReadyForQuery(respuesta) {
  const partes = [];
  let i = 0;
  while (i + 5 <= respuesta.length) {
    const largo = 1 + respuesta.readInt32BE(i + 1);
    if (respuesta[i] !== 0x5a) partes.push(respuesta.subarray(i, i + largo));
    i += largo;
  }
  if (i < respuesta.length) partes.push(respuesta.subarray(i));
  return Buffer.concat(partes);
}

export async function iniciarServidorPglite({ db, puerto, host = '127.0.0.1' }) {
  await db.waitReady;
  let conexionActiva = null;

  const servidor = net.createServer((socket) => {
    if (conexionActiva) {
      socket.end();
      return;
    }
    conexionActiva = socket;
    socket.setNoDelay(true);

    let buffer = Buffer.alloc(0);
    let inicioCompleto = false;
    let cadena = Promise.resolve();

    async function enviar(mensaje, { inicio = false } = {}) {
      const partes = [];
      await db.runExclusive(() =>
        db.execProtocolRawStream(new Uint8Array(mensaje), {
          onRawData: (datos) => {
            if (datos.length) partes.push(Buffer.from(datos));
          },
        }),
      );
      let respuesta = Buffer.concat(partes);
      const tipo = String.fromCharCode(mensaje[0]);
      if (!inicio && tipo !== 'S' && tipo !== 'Q') respuesta = sinReadyForQuery(respuesta);
      if (respuesta.length && socket.writable) socket.write(respuesta);
    }

    async function procesar(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (!inicioCompleto) {
          if (buffer.length < 8) return;
          const largo = buffer.readInt32BE(0);
          const codigo = buffer.readInt32BE(4);
          if (largo === 8 && (codigo === SSL_REQUEST || codigo === GSSENC_REQUEST)) {
            socket.write('N'); // sin SSL: el cliente sigue en texto plano (es local)
            buffer = buffer.subarray(8);
            continue;
          }
          if (codigo !== PROTOCOLO_V3) throw new Error('Protocolo de inicio no soportado');
          if (buffer.length < largo) return;
          await enviar(buffer.subarray(0, largo), { inicio: true });
          buffer = buffer.subarray(largo);
          inicioCompleto = true;
          continue;
        }
        if (buffer.length < 5) return;
        const largo = 1 + buffer.readInt32BE(1);
        if (buffer.length < largo) return;
        const mensaje = buffer.subarray(0, largo);
        buffer = buffer.subarray(largo);
        if (mensaje[0] === 0x58) { // 'X' Terminate
          socket.end();
          return;
        }
        await enviar(mensaje);
      }
    }

    socket.on('data', (chunk) => {
      cadena = cadena.then(() => procesar(chunk)).catch((err) => socket.destroy(err));
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      cadena = cadena.then(async () => {
        // Si el cliente se fue en medio de una transacción, se deshace
        if (db.isInTransaction()) await db.exec('ROLLBACK').catch(() => {});
        conexionActiva = null;
      });
    });
  });

  await new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(puerto, host, resolve);
  });

  return {
    detener: () =>
      new Promise((resolve) => {
        conexionActiva?.destroy();
        servidor.close(() => resolve());
      }),
  };
}
