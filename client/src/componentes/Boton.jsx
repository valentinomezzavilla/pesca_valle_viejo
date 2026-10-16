import { forwardRef } from 'react';
import { LoaderCircle } from 'lucide-react';

const VARIANTES = {
  primario: 'bg-primario text-sobre-primario shadow-suave hover:bg-primario-hover',
  exito: 'bg-exito text-sobre-exito shadow-suave hover:bg-exito-hover',
  peligro: 'bg-peligro text-sobre-peligro shadow-suave hover:bg-peligro-hover',
  secundario: 'bg-superficie text-texto shadow-suave ring-1 ring-inset ring-borde-fuerte hover:bg-superficie-2',
  suave: 'bg-primario-suave text-primario-texto hover:brightness-95 dark:hover:brightness-125',
  'peligro-suave': 'bg-peligro-suave text-peligro-texto hover:brightness-95 dark:hover:brightness-125',
  fantasma: 'text-primario-texto hover:bg-primario-suave',
};

const TAMANIOS = {
  chico: 'h-9 gap-1.5 rounded-lg px-3 text-sm',
  normal: 'min-h-11 gap-2 rounded-xl px-4 text-[15px]',
  grande: 'min-h-14 gap-2.5 rounded-xl px-5 text-lg',
  icono: 'size-11 rounded-xl',
};

const TAMANIO_ICONO = { chico: 16, normal: 18, grande: 22, icono: 20 };

/** Clases de un botón, para usar en enlaces (<a>, <Link>) con el mismo aspecto. */
export const clasesBoton = ({ variante = 'primario', tamanio = 'normal', className = '' } = {}) =>
  `inline-flex shrink-0 select-none items-center justify-center font-semibold transition-[background-color,filter,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-anillo ${VARIANTES[variante]} ${TAMANIOS[tamanio]} ${className}`;

export const Boton = forwardRef(function Boton(
  { variante = 'primario', tamanio = 'normal', icono: Icono, iconoDerecha: IconoDerecha, cargando = false, className = '', children, disabled, type = 'button', ...props },
  ref,
) {
  const tamIcono = TAMANIO_ICONO[tamanio];
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || cargando}
      className={`inline-flex shrink-0 select-none items-center justify-center font-semibold transition-[background-color,filter,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-anillo disabled:pointer-events-none disabled:opacity-45 ${VARIANTES[variante]} ${TAMANIOS[tamanio]} ${className}`}
      {...props}
    >
      {cargando ? <LoaderCircle size={tamIcono} className="animate-spin" aria-hidden /> : Icono && <Icono size={tamIcono} strokeWidth={2.2} aria-hidden />}
      {children}
      {IconoDerecha && !cargando && <IconoDerecha size={tamIcono} strokeWidth={2.2} aria-hidden />}
    </button>
  );
});
