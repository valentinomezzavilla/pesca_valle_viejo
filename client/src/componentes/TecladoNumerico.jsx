import { Delete } from 'lucide-react';

// Teclado numérico grande para pantallas táctiles. Trabaja sobre un string con coma decimal.
export function TecladoNumerico({ valor, onCambio, sinDecimales = false, maxDecimales = 3, onConfirmar }) {
  const tocar = (tecla) => {
    if (tecla === 'borrar') return onCambio(valor.slice(0, -1));
    if (tecla === 'limpiar') return onCambio('');
    if (tecla === ',') {
      if (sinDecimales || valor.includes(',')) return;
      return onCambio(valor === '' ? '0,' : `${valor},`);
    }
    const [, decimales] = valor.split(',');
    if (decimales !== undefined && decimales.length >= maxDecimales) return;
    if (valor === '0') return onCambio(tecla);
    onCambio(valor + tecla);
  };

  const teclas = ['7', '8', '9', '4', '5', '6', '1', '2', '3', sinDecimales ? 'limpiar' : ',', '0', 'borrar'];
  return (
    <div className="grid grid-cols-3 gap-2" onKeyDown={(e) => e.key === 'Enter' && onConfirmar?.()}>
      {teclas.map((t) => {
        const especial = t === 'borrar' || t === 'limpiar';
        return (
          <button
            key={t}
            type="button"
            onClick={() => tocar(t)}
            aria-label={t === 'borrar' ? 'Borrar' : t === 'limpiar' ? 'Limpiar' : t === ',' ? 'Coma decimal' : t}
            className={`flex h-14 select-none items-center justify-center rounded-xl text-2xl font-semibold tabular-nums transition-[background-color,transform] duration-100 active:scale-95 focus-visible:ring-4 focus-visible:ring-anillo sm:h-16 ${
              especial ? 'bg-superficie-3 text-texto-suave hover:text-texto' : 'bg-superficie-2 text-texto hover:bg-superficie-3'
            }`}
          >
            {t === 'borrar' ? <Delete size={26} aria-hidden /> : t === 'limpiar' ? 'C' : t}
          </button>
        );
      })}
    </div>
  );
}

/** Visor del número que se está tipeando */
export function Visor({ etiqueta, valor, prefijo, sufijo, placeholder = '0' }) {
  return (
    <div className="rounded-2xl bg-superficie-2 px-4 py-3 text-right ring-1 ring-inset ring-borde">
      <div className="text-xs font-semibold uppercase tracking-wide text-texto-suave">{etiqueta}</div>
      <div className="mt-0.5 min-h-11 truncate text-4xl font-bold tabular-nums tracking-tight text-texto">
        {prefijo && <span className="mr-1 text-texto-suave">{prefijo}</span>}
        {valor || <span className="text-texto-tenue">{placeholder}</span>}
        {sufijo && <span className="ml-1 text-2xl text-texto-suave">{sufijo}</span>}
      </div>
    </div>
  );
}

// "1,250" → "1.250" (para mandar a la API)
export const tecladoANumero = (v) => (v ? v.replace(',', '.') : '');
// "1.250" → "1,250"
export const numeroATeclado = (v) => (v === undefined || v === null ? '' : String(v).replace('.', ','));
