// CUIT/CUIL argentino: 11 dígitos; el último es verificador (módulo 11).
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

const digitos = (texto) => String(texto ?? '').replace(/\D/g, '');

export function cuitValido(texto) {
  const d = digitos(texto);
  if (d.length !== 11) return false;
  const suma = PESOS_CUIT.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  if (resto === 10) return false;
  return (resto === 11 ? 0 : resto) === Number(d[10]);
}

export function normalizarCuit(texto) {
  const d = digitos(texto);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : null;
}
