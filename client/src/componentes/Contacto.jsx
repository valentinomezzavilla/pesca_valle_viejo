import { MessageCircle, Phone } from 'lucide-react';
import { clasesBoton } from './Boton.jsx';
import { enlaceLlamar, enlaceWhatsApp } from '../lib/proveedores.js';

/** Llamar y WhatsApp como botones con texto. Si el número no sirve para WhatsApp, lo dice en vez de abrir un link roto. */
export function BotonesContacto({ telefono, tamanio = 'normal', mensaje, className = '' }) {
  if (!telefono) return <span className="text-texto-tenue">Sin teléfono</span>;
  const wa = enlaceWhatsApp(telefono, mensaje);
  const tamIcono = tamanio === 'grande' ? 22 : 18;
  return (
    <span className={`flex flex-wrap gap-2 ${className}`} onClick={(e) => e.stopPropagation()}>
      <a href={enlaceLlamar(telefono)} className={clasesBoton({ variante: 'secundario', tamanio })}>
        <Phone size={tamIcono} aria-hidden /> Llamar
      </a>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamanio })}>
          <MessageCircle size={tamIcono} aria-hidden /> WhatsApp
        </a>
      ) : (
        <span className={`${clasesBoton({ variante: 'secundario', tamanio })} pointer-events-none opacity-60`} title="El teléfono no tiene característica o está mal escrito">
          <MessageCircle size={tamIcono} aria-hidden /> Revisá el teléfono
        </span>
      )}
    </span>
  );
}
