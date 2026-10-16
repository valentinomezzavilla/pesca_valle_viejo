// Errores de negocio con mensajes pensados para mostrarse tal cual al usuario.
export class ErrorApp extends Error {
  constructor(mensaje, { codigo = 'ERROR', status = 400, campos } = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
    this.campos = campos;
  }
}

export class ErrorNegocio extends ErrorApp {
  constructor(mensaje, codigo = 'REGLA_DE_NEGOCIO', status = 409) {
    super(mensaje, { codigo, status });
  }
}

export class ErrorNoEncontrado extends ErrorApp {
  constructor(que = 'El registro') {
    super(`${que} no existe o fue dado de baja.`, { codigo: 'NO_ENCONTRADO', status: 404 });
  }
}

export class ErrorNoAutenticado extends ErrorApp {
  constructor() {
    super('Tu sesión se cerró. Volvé a ingresar.', { codigo: 'NO_AUTENTICADO', status: 401 });
  }
}

export class ErrorPermiso extends ErrorApp {
  constructor(mensaje = 'No tenés permiso para hacer esto.') {
    super(mensaje, { codigo: 'SIN_PERMISO', status: 403 });
  }
}

export class ErrorRequierePin extends ErrorApp {
  constructor(mensaje = 'Esta acción necesita la autorización del dueño. Pedile que ingrese su PIN.') {
    super(mensaje, { codigo: 'REQUIERE_PIN', status: 403 });
  }
}
