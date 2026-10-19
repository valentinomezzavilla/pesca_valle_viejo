import { Inbox, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';

export function Cargando({ texto = 'Cargando...' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-texto-suave">
      <LoaderCircle size={22} className="animate-spin text-primario" aria-hidden />
      {texto}
    </div>
  );
}

export function Vacio({ icono: Icono = Inbox, titulo, children, accion }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-borde px-6 py-14 text-center">
      <span className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-superficie-2 text-texto-tenue">
        <Icono size={28} aria-hidden />
      </span>
      {titulo && <p className="text-lg font-semibold text-texto">{titulo}</p>}
      <div className="mt-1 max-w-sm text-texto-suave">{children}</div>
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

export function ErrorCarga({ error, reintentar }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl bg-peligro-suave px-6 py-10 text-center text-peligro-texto">
      <TriangleAlert size={32} aria-hidden />
      <p className="mt-2 text-lg font-semibold">{error?.message ?? 'No se pudo cargar la información.'}</p>
      {reintentar && (
        <button type="button" onClick={reintentar} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-semibold hover:bg-peligro/10">
          <RotateCcw size={18} aria-hidden /> Reintentar
        </button>
      )}
    </div>
  );
}

export function Encabezado({ titulo, subtitulo, icono: Icono, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icono && (
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-primario-suave text-primario-texto sm:flex">
            <Icono size={24} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-texto sm:text-[28px]">{titulo}</h1>
          {subtitulo && <p className="mt-0.5 text-texto-suave">{subtitulo}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-end gap-2">{children}</div>}
    </div>
  );
}

export function Tarjeta({ className = '', titulo, icono: Icono, accion, children }) {
  return (
    <section className={`rounded-2xl bg-superficie p-5 shadow-suave ring-1 ring-borde ${className}`}>
      {titulo && (
        <div className="mb-4 flex items-center justify-between gap-3 md:col-span-full">
          <h2 className="flex items-center gap-2 text-base font-bold text-texto">
            {Icono && <Icono size={18} className="text-texto-suave" aria-hidden />}
            {titulo}
          </h2>
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

const TONOS_INDICADOR = {
  normal: { valor: 'text-texto', icono: 'bg-primario-suave text-primario-texto' },
  bueno: { valor: 'text-exito-texto', icono: 'bg-exito-suave text-exito-texto' },
  malo: { valor: 'text-peligro-texto', icono: 'bg-peligro-suave text-peligro-texto' },
  alerta: { valor: 'text-alerta-texto', icono: 'bg-alerta-suave text-alerta-texto' },
};

export function Indicador({ etiqueta, valor, tono = 'normal', detalle, icono: Icono }) {
  const t = TONOS_INDICADOR[tono];
  return (
    <div className="min-w-0 rounded-2xl bg-superficie p-4 shadow-suave ring-1 ring-borde">
      <div className="flex items-center gap-2.5">
        {Icono && (
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9 ${t.icono}`}>
            <Icono size={18} aria-hidden />
          </span>
        )}
        <span className="text-sm font-medium leading-tight text-texto-suave">{etiqueta}</span>
      </div>
      <div className={`mt-2 truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${t.valor}`}>{valor}</div>
      {detalle && <div className="mt-0.5 text-sm text-texto-suave">{detalle}</div>}
    </div>
  );
}

const TONOS_ETIQUETA = {
  gris: 'bg-superficie-2 text-texto-suave ring-borde',
  verde: 'bg-exito-suave text-exito-texto ring-exito/20',
  rojo: 'bg-peligro-suave text-peligro-texto ring-peligro/20',
  amarillo: 'bg-alerta-suave text-alerta-texto ring-alerta/25',
  azul: 'bg-primario-suave text-primario-texto ring-primario/20',
};

export function Etiqueta({ tono = 'gris', icono: Icono, children }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset ${TONOS_ETIQUETA[tono]}`}>
      {Icono && <Icono size={13} strokeWidth={2.5} aria-hidden />}
      {children}
    </span>
  );
}

// Tabla responsive: en celular cada fila es una tarjeta (nada queda escondido a la derecha);
// desde tablet es una tabla con scroll horizontal dentro de su caja, nunca de la página.
export function Tabla({ columnas, filas, alTocarFila, vacio = 'No hay datos para mostrar.', iconoVacio, claveFila = (f, i) => f.id ?? i, pie }) {
  if (!filas?.length) return <Vacio icono={iconoVacio}>{vacio}</Vacio>;
  return (
    <>
      <TarjetasTabla columnas={columnas} filas={filas} alTocarFila={alTocarFila} claveFila={claveFila} pie={pie} />
      <TablaAncha columnas={columnas} filas={filas} alTocarFila={alTocarFila} claveFila={claveFila} pie={pie} />
    </>
  );
}

function TarjetasTabla({ columnas, filas, alTocarFila, claveFila, pie }) {
  // El título de la tarjeta es la columna marcada `principal` (o la primera con título); las columnas sin título
  // (favorito, estado, "ver") van en la misma línea; el resto se lista como "etiqueta: valor".
  const marcada = columnas.findIndex((c) => c.principal);
  const iPrincipal = marcada >= 0 ? marcada : columnas.findIndex((c) => c.titulo);
  const principal = columnas[iPrincipal];
  const antes = columnas.slice(0, iPrincipal).filter((c) => !c.titulo);
  const despues = columnas.slice(iPrincipal + 1).filter((c) => !c.titulo);
  const datos = columnas.filter((c, i) => c.titulo && i !== iPrincipal);
  return (
    <ul className="space-y-2.5 sm:hidden">
      {filas.map((f, i) => (
        <li
          key={claveFila(f, i)}
          onClick={alTocarFila ? () => alTocarFila(f) : undefined}
          onKeyDown={alTocarFila ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), alTocarFila(f)) : undefined}
          tabIndex={alTocarFila ? 0 : undefined}
          role={alTocarFila ? 'button' : undefined}
          className={`rounded-2xl bg-superficie p-4 shadow-suave ring-1 ring-borde ${alTocarFila ? 'cursor-pointer transition-colors active:bg-primario-suave/60 focus-visible:ring-4 focus-visible:ring-anillo focus-visible:outline-none' : ''}`}
        >
          <div className="flex items-center gap-2">
            {antes.map((c) => (
              <div key={c.clave} className="shrink-0">{c.render ? c.render(f) : f[c.clave]}</div>
            ))}
            <div className="min-w-0 flex-1 text-[17px] text-texto">{principal.render ? principal.render(f) : f[principal.clave]}</div>
            {despues.map((c) => (
              <div key={c.clave} className="shrink-0 empty:hidden">{c.render ? c.render(f) : f[c.clave]}</div>
            ))}
          </div>
          {datos.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-borde pt-3">
              {datos.map((c) => (
                <div key={c.clave} className="min-w-0 has-[dd:empty]:hidden">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-texto-suave">{c.titulo}</dt>
                  <dd className={`mt-0.5 break-words text-[15px] text-texto ${c.derecha ? 'tabular-nums' : ''}`}>{c.render ? c.render(f) : f[c.clave]}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
      {pie && (
        <li className="rounded-2xl bg-superficie-2 p-4 ring-1 ring-borde-fuerte">
          <div className="text-[17px] font-bold text-texto">{pie[principal.clave] ?? 'Total'}</div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            {datos
              .filter((c) => pie[c.clave] != null && pie[c.clave] !== '')
              .map((c) => (
                <div key={c.clave}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-texto-suave">{c.titulo}</dt>
                  <dd className="mt-0.5 font-bold tabular-nums text-texto">{pie[c.clave]}</dd>
                </div>
              ))}
          </dl>
        </li>
      )}
    </ul>
  );
}

function TablaAncha({ columnas, filas, alTocarFila, claveFila, pie }) {
  return (
    <div className="scroll-fino hidden overflow-x-auto rounded-2xl bg-superficie shadow-suave ring-1 ring-borde sm:block">
      <table className="w-full min-w-max text-left text-[15px]">
        <thead>
          <tr className="border-b border-borde bg-superficie-2/60">
            {columnas.map((c) => (
              <th key={c.clave} scope="col" className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-texto-suave ${c.derecha ? 'text-right' : ''}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {filas.map((f, i) => (
            <tr
              key={claveFila(f, i)}
              onClick={alTocarFila ? () => alTocarFila(f) : undefined}
              onKeyDown={alTocarFila ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), alTocarFila(f)) : undefined}
              tabIndex={alTocarFila ? 0 : undefined}
              className={alTocarFila ? 'cursor-pointer transition-colors hover:bg-primario-suave/50 focus-visible:bg-primario-suave/60 focus-visible:outline-none' : ''}
            >
              {columnas.map((c) => (
                <td key={c.clave} className={`px-4 py-3.5 text-texto ${c.derecha ? 'text-right tabular-nums' : ''}`}>
                  {c.render ? c.render(f) : f[c.clave]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {pie && (
          <tfoot>
            <tr className="border-t-2 border-borde-fuerte bg-superficie-2/60 font-bold">
              {columnas.map((c, i) => (
                <td key={c.clave} className={`px-4 py-3 text-texto ${c.derecha ? 'text-right tabular-nums' : ''}`}>
                  {pie[c.clave] ?? (i === 0 ? 'Total' : '')}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Fila "clave: valor" para resúmenes */
export function Dato({ etiqueta, children, fuerte = false, tono }) {
  const tonos = { bueno: 'text-exito-texto', malo: 'text-peligro-texto', alerta: 'text-alerta-texto' };
  return (
    <div className={`flex items-baseline justify-between gap-4 ${tono ? tonos[tono] : ''}`}>
      <span className={fuerte ? 'font-semibold' : 'text-texto-suave'}>{etiqueta}</span>
      <span className={`tabular-nums ${fuerte ? 'text-lg font-bold' : 'font-semibold'}`}>{children}</span>
    </div>
  );
}
