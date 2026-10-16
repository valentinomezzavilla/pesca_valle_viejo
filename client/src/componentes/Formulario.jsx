// Campos de formulario grandes, legibles y con estados claros (foco, error, deshabilitado).
import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

export const clasesInput =
  'w-full min-h-12 rounded-xl border border-borde-fuerte bg-superficie px-4 py-2.5 text-base text-texto placeholder:text-texto-tenue transition-[border-color,box-shadow] focus:border-primario focus:outline-none focus:ring-4 focus:ring-anillo disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:text-texto-suave';

const claseError = 'border-peligro focus:border-peligro focus:ring-peligro/25';

function Etiquetado({ id, etiqueta, error, ayuda, className = '', children }) {
  return (
    <div className={className}>
      {etiqueta && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-texto">
          {etiqueta}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-peligro-texto">{error}</p>
      ) : (
        ayuda && <p className="mt-1.5 text-sm text-texto-suave">{ayuda}</p>
      )}
    </div>
  );
}

export function Campo({ etiqueta, error, ayuda, className = '', icono: Icono, ...props }) {
  const id = useId();
  return (
    <Etiquetado id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} className={className}>
      <div className="relative">
        {Icono && <Icono size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-tenue" aria-hidden />}
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${clasesInput} ${Icono ? 'pl-10' : ''} ${error ? claseError : ''}`}
          {...props}
        />
      </div>
    </Etiquetado>
  );
}

export function Selector({ etiqueta, error, ayuda, opciones, vacio, className = '', ...props }) {
  const id = useId();
  return (
    <Etiquetado id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} className={className}>
      <div className="relative">
        <select id={id} aria-invalid={!!error} className={`${clasesInput} cursor-pointer appearance-none pr-10 ${error ? claseError : ''}`} {...props}>
          {vacio !== undefined && <option value="">{vacio}</option>}
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-texto-suave" aria-hidden />
      </div>
    </Etiquetado>
  );
}

export function AreaTexto({ etiqueta, error, ayuda, className = '', ...props }) {
  const id = useId();
  return (
    <Etiquetado id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} className={className}>
      <textarea id={id} rows={3} className={`${clasesInput} resize-y ${error ? claseError : ''}`} {...props} />
    </Etiquetado>
  );
}

/** Interruptor (switch) accesible con etiqueta y ayuda. */
export function Interruptor({ etiqueta, checked, onChange, ayuda }) {
  const id = useId();
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-borde bg-superficie px-4 py-2.5">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block font-medium text-texto">{etiqueta}</span>
        {ayuda && <span className="block text-sm text-texto-suave">{ayuda}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:ring-4 focus-visible:ring-anillo ${checked ? 'bg-primario' : 'bg-borde-fuerte'}`}
      >
        <span className={`absolute left-0 top-0.5 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

/** Opciones como botones grandes (control segmentado). Cada opción: { valor, etiqueta, icono? } */
export function SelectorBotones({ opciones, valor, onCambio, columnas = 2, etiqueta }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
      {opciones.map((o) => {
        const activo = valor === o.valor;
        const Icono = o.icono;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-[15px] font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-anillo ${
              activo ? 'border-primario bg-primario-suave text-primario-texto' : 'border-borde bg-superficie text-texto-suave hover:border-borde-fuerte hover:text-texto'
            }`}
          >
            {Icono && <Icono size={18} aria-hidden />}
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
