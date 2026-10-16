import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, FileMinus2, FileText, HandCoins, Package, Pencil, ReceiptText, Truck, Undo2 } from 'lucide-react';
import { MEDIOS_PAGO_PROVEEDOR_ETIQUETA, TIPOS_DOCUMENTO_COMPRA_ETIQUETA, TIPOS_MOV_CC_PROVEEDOR_ETIQUETA, UNIDADES_ETIQUETA, dec } from '@pescaderia/shared';
import { get } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { BotonesContacto } from '../../componentes/Contacto.jsx';
import { MovimientosCuenta, TarjetaSaldo } from '../../componentes/CuentaCorriente.jsx';
import { Cargando, Dato, Encabezado, ErrorCarga, Etiqueta, Tabla, Tarjeta } from '../../componentes/Varios.jsx';
import { fecha, pesos } from '../../lib/formato.js';
import { nombresDias, textoVencimiento } from '../../lib/proveedores.js';
import { ModalProveedor } from './ModalProveedor.jsx';
import { ModalAnular, ModalNotaCredito, ModalPago, ModalResumen } from './ModalesCuenta.jsx';

const fmtDia = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const diaLargo = (iso) => fmtDia.format(new Date(`${iso}T12:00:00Z`));

function EtiquetaEstado({ compra }) {
  if (compra.estado === 'VENCIDA') return <Etiqueta tono="rojo">{textoVencimiento(compra.dias_para_vencer)}</Etiqueta>;
  const pronto = compra.dias_para_vencer <= 3;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Etiqueta tono={pronto ? 'amarillo' : 'azul'}>{textoVencimiento(compra.dias_para_vencer)}</Etiqueta>
      {compra.estado === 'PARCIAL' && <Etiqueta>Pagada a medias</Etiqueta>}
    </span>
  );
}

function CambioPrecio({ actual, anterior }) {
  if (!anterior) return <span className="text-texto-tenue">Primera compra</span>;
  const dif = dec(actual).minus(anterior);
  if (dif.isZero()) return <span className="text-texto-suave">Igual</span>;
  return dif.gt(0) ? (
    <span className="inline-flex items-center gap-1 font-semibold text-peligro-texto"><ArrowUp size={16} aria-hidden /> Subió {pesos(dif.toFixed(2))}</span>
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-exito-texto"><ArrowDown size={16} aria-hidden /> Bajó {pesos(dif.abs().toFixed(2))}</span>
  );
}

export function FichaProveedor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { avisar } = useDialogos();
  const [modal, setModal] = useState(null); // 'pago' | 'nota' | 'resumen' | 'editar' | { anular: movimiento }
  const q = useQuery({ queryKey: ['ficha-proveedor', id], queryFn: () => get(`/proveedores/${id}/ficha`) });

  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCarga error={q.error} reintentar={q.refetch} />;
  const { proveedor: p, saldo, vencido, proximo_vencimiento: proximo, compras_pendientes: pendientes, productos, movimientos } = q.data;

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      avisar('Copiado. Ya lo podés pegar en el home banking.');
    } catch {
      avisar('No se pudo copiar. Seleccionalo y copialo a mano.', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/proveedores" className="mb-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primario-texto hover:underline">
        <ArrowLeft size={18} aria-hidden /> Volver a Proveedores
      </Link>
      <Encabezado titulo={p.nombre} icono={Truck} subtitulo={[p.contacto, p.telefono].filter(Boolean).join(' · ') || 'Proveedor'} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Boton variante="exito" tamanio="grande" icono={HandCoins} onClick={() => setModal('pago')}>Registrar pago</Boton>
        <Boton variante="secundario" tamanio="grande" icono={FileText} onClick={() => setModal('resumen')} className="sm:order-last">Resumen de cuenta</Boton>
        <BotonesContacto telefono={p.telefono} tamanio="grande" className="col-span-2 grid grid-cols-2 [&>*]:w-full" />
      </div>

      <TarjetaSaldo
        saldo={saldo}
        textoDeuda="Le debemos"
        textoAFavor="Le pagamos de más (saldo a favor nuestro)"
        textoCero="Estamos al día"
        detalle={
          dec(saldo).gt(0) && (
            <span className="mt-2 block space-y-1 text-base">
              <span className="block font-semibold">{dec(vencido).gt(0) ? `Ya vencido: ${pesos(vencido)}` : 'Nada vencido'}</span>
              {proximo && (
                <span className="block">
                  Próximo vencimiento: <span className="capitalize">{diaLargo(proximo.fecha)}</span> — {pesos(proximo.importe)}
                </span>
              )}
            </span>
          )
        }
      >
        <Boton variante="secundario" tamanio="grande" icono={FileMinus2} onClick={() => setModal('nota')}>Nota de crédito</Boton>
      </TarjetaSaldo>

      <h2 className="mb-3 text-lg font-bold text-texto">Compras sin pagar</h2>
      <div className="mb-8">
        <Tabla
          filas={pendientes}
          claveFila={(c) => c.compra_id}
          alTocarFila={(c) => navigate(`/mercaderia?ver=${c.compra_id}`)}
          vacio="No hay compras sin pagar."
          iconoVacio={ReceiptText}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', render: (c) => fecha(c.fecha) },
            { clave: 'doc', titulo: 'Comprobante', render: (c) => `${TIPOS_DOCUMENTO_COMPRA_ETIQUETA[c.tipo_documento]} ${c.numero_documento ?? ''}`.trim() },
            { clave: 'total', titulo: 'Total', derecha: true, render: (c) => pesos(c.total) },
            { clave: 'pendiente', titulo: 'Falta pagar', derecha: true, render: (c) => <strong>{pesos(c.pendiente)}</strong> },
            { clave: 'estado', titulo: '¿Cuándo vence?', render: (c) => <EtiquetaEstado compra={c} /> },
          ]}
        />
      </div>

      <h2 className="mb-3 text-lg font-bold text-texto">Productos que te vende</h2>
      <div className="mb-8">
        <Tabla
          filas={productos}
          claveFila={(x) => x.producto_id}
          vacio="Todavía no le compraste nada."
          iconoVacio={Package}
          columnas={[
            { clave: 'producto', titulo: 'Producto', render: (x) => <span className="font-semibold">{x.producto}</span> },
            { clave: 'costo', titulo: 'Último precio', derecha: true, render: (x) => `${pesos(x.costo_unitario)} / ${UNIDADES_ETIQUETA[x.unidad]}` },
            { clave: 'fecha', titulo: 'Fecha', render: (x) => fecha(x.fecha) },
            { clave: 'cambio', titulo: 'Comparado con la compra anterior', render: (x) => <CambioPrecio actual={x.costo_unitario} anterior={x.costo_anterior} /> },
          ]}
        />
      </div>

      <h2 className="mb-3 text-lg font-bold text-texto">Movimientos</h2>
      <MovimientosCuenta
        movimientos={movimientos}
        etiquetas={TIPOS_MOV_CC_PROVEEDOR_ETIQUETA}
        extra={(m) => (
          <span className="text-texto-suave">
            {m.medio_pago && ` · ${MEDIOS_PAGO_PROVEEDOR_ETIQUETA[m.medio_pago]}`}
            {m.referencia && ` (${m.referencia})`}
            {m.cheque_fecha_cobro && ` · Cheque ${m.cheque_numero ?? ''} ${m.cheque_banco ?? ''} · se cobra el ${fecha(m.cheque_fecha_cobro)}`}
          </span>
        )}
        accion={(m) =>
          m.se_puede_anular && (
            <Boton variante="peligro-suave" icono={Undo2} onClick={() => setModal({ anular: m })}>Anular</Boton>
          )
        }
      />

      <Tarjeta className="mt-8" titulo="Datos del proveedor" icono={Truck} accion={<Boton variante="secundario" icono={Pencil} onClick={() => setModal('editar')}>Editar datos</Boton>}>
        <div className="space-y-3">
          <Dato etiqueta="CUIT">{p.cuit || '—'}</Dato>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-texto-suave">CBU o alias</span>
            {p.cbu_alias ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-all font-mono font-semibold">{p.cbu_alias}</span>
                <Boton variante="secundario" icono={Copy} onClick={() => copiar(p.cbu_alias)}>Copiar</Boton>
              </span>
            ) : (
              <span className="font-semibold">—</span>
            )}
          </div>
          <Dato etiqueta="Plazo para pagarle">{p.plazo_pago_dias ? `${p.plazo_pago_dias} días` : 'Se le paga en el día'}</Dato>
          <Dato etiqueta="Días que entrega">{nombresDias(p.dias_entrega) || '—'}</Dato>
          <Dato etiqueta="Email">{p.email || '—'}</Dato>
          <Dato etiqueta="Dirección">{p.direccion || '—'}</Dato>
          {p.notas && <p className="whitespace-pre-line rounded-xl bg-superficie-2 p-3 text-texto">{p.notas}</p>}
        </div>
      </Tarjeta>

      {modal === 'pago' && <ModalPago proveedor={p} saldo={saldo} onCerrar={() => setModal(null)} />}
      {modal === 'nota' && <ModalNotaCredito proveedor={p} onCerrar={() => setModal(null)} />}
      {modal === 'resumen' && <ModalResumen proveedor={p} onCerrar={() => setModal(null)} />}
      {modal === 'editar' && <ModalProveedor proveedor={p} onCerrar={() => setModal(null)} />}
      {modal?.anular && <ModalAnular proveedor={p} movimiento={modal.anular} onCerrar={() => setModal(null)} />}
    </div>
  );
}
