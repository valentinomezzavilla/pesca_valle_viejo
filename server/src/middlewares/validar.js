import { ErrorApp } from '../lib/errores.js';

// Valida body o query con un esquema Zod y deja el resultado limpio en req.datos
export const validar = (esquema, origen = 'body') => (req, _res, next) => {
  const resultado = esquema.safeParse(req[origen] ?? {});
  if (!resultado.success) {
    const campos = {};
    for (const issue of resultado.error.issues) {
      const clave = issue.path.join('.') || '_';
      campos[clave] ??= issue.message;
    }
    const primero = Object.values(campos)[0];
    throw new ErrorApp(primero ?? 'Revisá los datos ingresados.', { codigo: 'DATOS_INVALIDOS', status: 400, campos });
  }
  req.datos = resultado.data;
  next();
};
