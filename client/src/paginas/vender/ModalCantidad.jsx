import { useState } from 'react';
import { CircleDollarSign, Minus, Plus, Scale } from 'lucide-react';
import { dec, redondear, subtotalLinea } from '@pescaderia/shared';
import { Modal } from '../../componentes/Modal.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { SelectorBotones } from '../../componentes/Formulario.jsx';
import { TecladoNumerico, Visor, numeroATeclado, tecladoANumero } from '../../componentes/TecladoNumerico.jsx';
import { cantidad as fmtCantidad, pesos, precioPor } from '../../lib/formato.js';

const ATAJOS_KG = ['0,250', '0,500', '1', '1,500', '2'];

/** Pide el peso (o las unidades) de un producto. En kg también se puede pedir "por importe" ($5000 de merluza). */
export function ModalCantidad({ producto, inicial, onConfirmar, onCerrar }) {
  const porKg = producto.unidad === 'KG';
  const [modo, setModo] = useState('cantidad');
  const [valor, setValor] = useState(inicial ? numeroATeclado(Number(inicial).toString()) : porKg ? '' : '1');

  const numero = tecladoANumero(valor);
  let cantidad = '';
  if (numero && dec(numero).gt(0)) {
    cantidad = modo === 'importe' ? redondear(dec(numero).div(producto.precio_venta), 3).toString() : numero;
  }
  const valida = cantidad !== '' && dec(cantidad).gt(0);
  const subtotal = valida ? subtotalLinea(cantidad, producto.precio_venta) : dec(0);

  const confirmar = () => valida && onConfirmar(cantidad);
  const sumarUnidad = (delta) => setValor(String(Math.max(1, (Number(numero) || 0) + delta)));

  return (
    <Modal titulo={producto.nombre} descripcion={precioPor(producto.precio_venta, producto.unidad)} onCerrar={onCerrar} ancho="sm:max-w-md">
      <div className="space-y-3">
        {porKg && (
          <SelectorBotones
            etiqueta="Forma de cargar"
            valor={modo}
            onCambio={(m) => {
              setModo(m);
              setValor('');
            }}
            opciones={[
              { valor: 'cantidad', etiqueta: 'Por peso', icono: Scale },
              { valor: 'importe', etiqueta: 'Por importe', icono: CircleDollarSign },
            ]}
          />
        )}

        <Visor
          etiqueta={modo === 'importe' ? 'Importe en pesos' : porKg ? 'Peso' : 'Unidades'}
          valor={valor}
          prefijo={modo === 'importe' ? '$' : undefined}
          sufijo={modo === 'cantidad' && porKg ? 'kg' : undefined}
        />

        {porKg && modo === 'cantidad' && (
          <div className="grid grid-cols-5 gap-1.5">
            {ATAJOS_KG.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setValor(a)}
                className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${valor === a ? 'bg-primario text-sobre-primario' : 'bg-primario-suave text-primario-texto hover:brightness-95 dark:hover:brightness-125'}`}
              >
                {a}
              </button>
            ))}
          </div>
        )}
        {!porKg && (
          <div className="grid grid-cols-2 gap-2">
            <Boton variante="secundario" tamanio="grande" icono={Minus} onClick={() => sumarUnidad(-1)} aria-label="Restar una unidad">1</Boton>
            <Boton variante="secundario" tamanio="grande" icono={Plus} onClick={() => sumarUnidad(1)} aria-label="Sumar una unidad">1</Boton>
          </div>
        )}

        <TecladoNumerico valor={valor} onCambio={setValor} sinDecimales={!porKg} maxDecimales={modo === 'importe' ? 2 : 3} onConfirmar={confirmar} />

        <div className="flex items-center justify-between rounded-2xl bg-primario-suave px-4 py-3">
          <span className="font-medium text-primario-texto">{valida ? fmtCantidad(cantidad, producto.unidad) : 'Sin cantidad'}</span>
          <span className="text-2xl font-bold tabular-nums text-primario-texto">{pesos(subtotal.toString())}</span>
        </div>

        <Boton variante="exito" tamanio="grande" className="w-full" onClick={confirmar} disabled={!valida}>
          {inicial ? 'Guardar cambio' : 'Agregar a la venta'}
        </Boton>
      </div>
    </Modal>
  );
}
