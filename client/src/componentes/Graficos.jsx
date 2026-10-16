// Gráficos simples hechos con CSS (sin librerías): suficientes para el tablero y livianos.

/**
 * Barras verticales. datos: [{ etiqueta, valor, destacado?, titulo? }]
 * El alto de cada barra es proporcional al mayor valor.
 */
export function Barras({ datos, alto = 140, formato = (v) => v }) {
  const maximo = Math.max(...datos.map((d) => Number(d.valor)), 0);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: alto + 44 }} role="img" aria-label="Gráfico de barras">
      {datos.map((d) => {
        const proporcion = maximo > 0 ? Number(d.valor) / maximo : 0;
        return (
          <div key={d.etiqueta} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={d.titulo ?? `${d.etiqueta}: ${formato(d.valor)}`}>
            <span className="max-w-full truncate text-[11px] font-semibold tabular-nums text-texto-suave">{Number(d.valor) > 0 ? formato(d.valor) : ''}</span>
            <div
              className={`w-full max-w-12 rounded-t-lg transition-[height] duration-500 ${d.destacado ? 'bg-primario' : 'bg-primario/35'}`}
              style={{ height: Math.max(proporcion * alto, Number(d.valor) > 0 ? 4 : 2) }}
            />
            <span className={`text-xs ${d.destacado ? 'font-bold text-texto' : 'text-texto-suave'}`}>{d.etiqueta}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Barras horizontales con etiqueta y valor. datos: [{ etiqueta, valor, texto }] */
export function BarrasHorizontales({ datos }) {
  const maximo = Math.max(...datos.map((d) => Number(d.valor)), 0);
  return (
    <ul className="space-y-3">
      {datos.map((d) => (
        <li key={d.etiqueta}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-texto">{d.etiqueta}</span>
            <span className="shrink-0 font-semibold tabular-nums text-texto">{d.texto}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-superficie-2">
            <div className="h-full rounded-full bg-primario transition-[width] duration-500" style={{ width: `${maximo > 0 ? (Number(d.valor) / maximo) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
