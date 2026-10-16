// Modal accesible (Radix Dialog): atrapa el foco, cierra con Escape o tocando afuera, bloquea el scroll.
// En celular aparece como hoja desde abajo; en pantallas grandes, centrado.
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Modal({ titulo, descripcion, icono: Icono, onCerrar, children, ancho = 'max-w-lg', pie }) {
  const bloquear = (e) => !onCerrar && e.preventDefault();
  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && onCerrar?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fundido bg-slate-950/55 backdrop-blur-[2px]" />
        <Dialog.Content
          {...(descripcion ? {} : { 'aria-describedby': undefined })}
          onEscapeKeyDown={bloquear}
          onPointerDownOutside={bloquear}
          className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] w-full animate-subir flex-col rounded-t-3xl bg-superficie shadow-alta focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-entrar sm:rounded-2xl ${ancho}`}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-superficie-3 sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:pt-5">
            <div className="flex min-w-0 items-center gap-3">
              {Icono && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primario-suave text-primario-texto">
                  <Icono size={20} aria-hidden />
                </span>
              )}
              <div className="min-w-0">
                <Dialog.Title className="truncate text-lg font-bold text-texto sm:text-xl">{titulo}</Dialog.Title>
                {descripcion && <Dialog.Description className="text-sm text-texto-suave">{descripcion}</Dialog.Description>}
              </div>
            </div>
            {onCerrar && (
              <Dialog.Close className="-mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto focus-visible:ring-4 focus-visible:ring-anillo" aria-label="Cerrar">
                <X size={22} />
              </Dialog.Close>
            )}
          </div>
          <div className="scroll-fino overflow-y-auto px-5 pb-5 pt-1">{children}</div>
          {pie && <div className="border-t border-borde px-5 py-4">{pie}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
