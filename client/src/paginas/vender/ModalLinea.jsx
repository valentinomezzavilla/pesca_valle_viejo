import { useState } from 'react';
import { BadgePercent, DollarSign, Pencil, Percent, Trash2 } from 'lucide-react';
import { dec, redondear, subtotalLinea } from '@pescaderia/shared';
import { Modal } from '../../componentes/Modal.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { SelectorBotones } from '../../componentes/Formulario.jsx';
import { TecladoNumerico, Visor, tecladoANumero } from '../../componentes/TecladoNumerico.jsx';
import { cantidad, pesos } from '../../lib/formato.js';

function editorDescuento({ base, tipo, setTipo, valor, setValor }) {
  const numero = dec(tecladoANumero(valor) || 0);
  const descuento = tipo === 'porcentaje' ? redondear(dec(base).times(numero).div(100), 2) : redondear(numero, 2);
  return {
    descuento,
    valido: descuento.lte(base),
    ui: (
      <div className="space-y-3">
        <SelectorBotones
          etiqueta="Tipo de descuento"
          valor={tipo}
          onCambio={(t) => {
            setTipo(t);
            setValor('');
          }}
          opciones={[
            { valor: 'porcentaje', etiqueta: 'Porcentaje', icono: Percent },
            { valor: 'monto', etiqueta: 'Monto fijo', icono: DollarSign },
          ]}
        />
        <Visor etiqueta={tipo === 'porcentaje' ? 'Porcentaje' : 'Monto'} valor={valor} prefijo={tipo === 'monto' ? '$' : undefined} sufijo={tipo === 'porcentaje' ? '%' : undefined} />
        <TecladoNumerico valor={valor} onCambio={setValor} maxDecimales={2} />
      </div>
    ),
  };
}

/** Editar una línea del carrito: cambiar cantidad, aplicar descuento o quitarla. */
export function ModalLinea({ linea, onCambiarCantidad, onDescuento, onQuitar, onCerrar }) {
  const subtotal = subtotalLinea(linea.cantidad, linea.producto.precio_venta);
  const [tipo, setTipo] = useState('porcentaje');
  const [valor, setValor] = useState('');
  const { descuento, valido, ui } = editorDescuento({ base: subtotal, tipo, setTipo, valor, setValor });

  return (
    <Modal titulo={linea.producto.nombre} descripcion={`${cantidad(linea.cantidad, linea.producto.unidad)} · ${pesos(subtotal.toString())}`} onCerrar={onCerrar} ancho="sm:max-w-md">
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Boton variante="secundario" tamanio="grande" icono={Pencil} onClick={onCambiarCantidad}>Cantidad</Boton>
        <Boton variante="peligro-suave" tamanio="grande" icono={Trash2} onClick={onQuitar}>Quitar</Boton>
      </div>

      <h3 className="mb-3 flex items-center gap-2 font-bold text-texto"><BadgePercent size={18} className="text-texto-suave" aria-hidden /> Descuento en este producto</h3>
      {ui}
      {!valido && <p role="alert" className="mt-2 font-medium text-peligro-texto">El descuento no puede ser mayor que el precio.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Boton variante="secundario" onClick={() => onDescuento('0')} disabled={dec(linea.descuento || 0).isZero()}>Quitar descuento</Boton>
        <Boton onClick={() => onDescuento(descuento.toFixed(2))} disabled={!valido || descuento.isZero()}>
          Aplicar −{pesos(descuento.toString())}
        </Boton>
      </div>
    </Modal>
  );
}

/** Descuento sobre el total de la venta */
export function ModalDescuentoGlobal({ subtotal, actual, onAplicar, onCerrar }) {
  const [tipo, setTipo] = useState('porcentaje');
  const [valor, setValor] = useState('');
  const { descuento, valido, ui } = editorDescuento({ base: subtotal, tipo, setTipo, valor, setValor });

  return (
    <Modal titulo="Descuento a toda la venta" icono={BadgePercent} descripcion={`Sobre ${pesos(subtotal)}`} onCerrar={onCerrar} ancho="sm:max-w-md">
      {ui}
      <p className="mt-3 text-center text-lg text-texto-suave">
        Descuento: <strong className="text-texto">{pesos(descuento.toString())}</strong>
      </p>
      {!valido && <p role="alert" className="mt-1 text-center font-medium text-peligro-texto">El descuento no puede ser mayor que el total.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Boton variante="secundario" onClick={() => onAplicar('0')} disabled={dec(actual || 0).isZero()}>Quitar descuento</Boton>
        <Boton onClick={() => onAplicar(descuento.toFixed(2))} disabled={!valido || descuento.isZero()}>Aplicar</Boton>
      </div>
    </Modal>
  );
}
