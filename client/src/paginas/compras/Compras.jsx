import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, PackageOpen, PackagePlus, Plus } from 'lucide-react';
import { CONDICIONES_COMPRA_ETIQUETA, TIPOS_DOCUMENTO_COMPRA_ETIQUETA } from '@pescaderia/shared';
import { get, post } from '../../api/cliente.js';
import { useSesion } from '../../contexto/Sesion.jsx';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { Cargando, Dato, Encabezado, Etiqueta, Tabla } from '../../componentes/Varios.jsx';
import { cantidad, fecha, fechaHora, pesos } from '../../lib/formato.js';

export function Compras() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const detalle = Number(params.get('ver')) || null;
  const compras = useQuery({ queryKey: ['compras'], queryFn: () => get('/compras', { porPagina: 200 }) });

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Ingreso de mercadería" icono={PackagePlus} subtitulo="Cada remito o factura que llega del proveedor.">
        <Boton tamanio="grande" icono={Plus} onClick={() => navigate('/mercaderia/nuevo')}>Ingresar mercadería</Boton>
      </Encabezado>
      {compras.isLoading ? (
        <Cargando />
      ) : (
        <Tabla
          filas={compras.data}
          alTocarFila={(c) => setParams({ ver: c.id })}
          vacio="Todavía no se cargó mercadería."
          iconoVacio={PackageOpen}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', render: (c) => <span className="tabular-nums text-texto-suave">{fecha(c.fecha)}</span> },
            { clave: 'proveedor', titulo: 'Proveedor', render: (c) => <span className="font-semibold">{c.proveedor}</span> },
            { clave: 'documento', titulo: 'Comprobante', render: (c) => <span>{TIPOS_DOCUMENTO_COMPRA_ETIQUETA[c.tipo_documento]} <span className="font-mono text-sm text-texto-suave">{c.numero_documento ?? ''}</span></span> },
            { clave: 'condicion', titulo: 'Pago', render: (c) => (c.condicion === 'CONTADO' ? <Etiqueta tono="verde">Pagado</Etiqueta> : <Etiqueta tono="amarillo">A cuenta</Etiqueta>) },
            { clave: 'total', titulo: 'Total', derecha: true, render: (c) => <strong className={c.estado === 'ANULADA' ? 'text-texto-tenue line-through' : ''}>{pesos(c.total)}</strong> },
            { clave: 'estado', titulo: '', render: (c) => c.estado === 'ANULADA' && <Etiqueta tono="rojo" icono={Ban}>Anulado</Etiqueta> },
          ]}
        />
      )}
      {detalle && <DetalleCompra id={detalle} onCerrar={() => setParams({})} />}
    </div>
  );
}

function DetalleCompra({ id, onCerrar }) {
  const queryClient = useQueryClient();
  const { puede } = useSesion();
  const { avisar, pedirTexto } = useDialogos();
  const q = useQuery({ queryKey: ['compra', id], queryFn: () => get(`/compras/${id}`) });
  const c = q.data;

  const anular = async () => {
    const motivo = await pedirTexto({
      titulo: 'Anular ingreso',
      mensaje: 'Se saca la mercadería del stock y se descuenta la deuda con el proveedor. Solo se puede si todavía no se vendió nada de este ingreso.',
      etiqueta: 'Motivo',
      textoConfirmar: 'Anular ingreso',
      peligro: true,
    });
    if (!motivo) return;
    try {
      await post(`/compras/${id}/anular`, { motivo });
      avisar('Ingreso anulado.');
      ['compras', 'compra', 'productos-pos', 'stock', 'proveedores'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      avisar(e.message, 'error');
    }
  };

  return (
    <Modal titulo={`Ingreso #${id}`} icono={PackagePlus} descripcion={c ? `${c.proveedor} · ${fecha(c.fecha)}` : undefined} onCerrar={onCerrar} ancho="sm:max-w-3xl">
      {!c ? (
        <Cargando />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-x-8 gap-y-2 rounded-2xl bg-superficie-2 p-4 ring-1 ring-inset ring-borde sm:grid-cols-2">
            <Dato etiqueta="Comprobante">{TIPOS_DOCUMENTO_COMPRA_ETIQUETA[c.tipo_documento]} {c.numero_documento}</Dato>
            <Dato etiqueta="Pago">{CONDICIONES_COMPRA_ETIQUETA[c.condicion]}</Dato>
            <Dato etiqueta="Cargó">{c.usuario_nombre}</Dato>
            <Dato etiqueta="Registrado">{fechaHora(c.creado_en)}</Dato>
          </div>
          {c.observaciones && <p className="rounded-xl bg-superficie-2 px-4 py-3 text-texto-suave">{c.observaciones}</p>}
          {c.estado === 'ANULADA' && (
            <div className="rounded-xl bg-peligro-suave px-4 py-3 text-peligro-texto">
              <strong>Anulado</strong> el {fechaHora(c.anulada_en)} por {c.anulada_por}. Motivo: {c.motivo_anulacion}
            </div>
          )}
          <Tabla
            filas={c.items}
            columnas={[
              { clave: 'producto', titulo: 'Producto', render: (i) => <span className="font-medium">{i.producto}</span> },
              { clave: 'cantidad', titulo: 'Cantidad', derecha: true, render: (i) => cantidad(i.cantidad, i.unidad) },
              { clave: 'costo', titulo: 'Costo unit.', derecha: true, render: (i) => pesos(i.costo_unitario) },
              { clave: 'subtotal', titulo: 'Subtotal', derecha: true, render: (i) => <strong>{pesos(i.subtotal)}</strong> },
              { clave: 'vence', titulo: 'Vence', render: (i) => fecha(i.fecha_vencimiento) || '—' },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {c.estado === 'CONFIRMADA' && puede('compras.anular') ? (
              <Boton variante="peligro-suave" icono={Ban} onClick={anular}>Anular este ingreso</Boton>
            ) : (
              <span />
            )}
            <div className="text-2xl font-bold tabular-nums">Total {pesos(c.total)}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
