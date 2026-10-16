import { createContext, useContext, useEffect, useState } from 'react';

const CLAVE = 'pescaderia.tema';
export const TEMAS = ['claro', 'oscuro', 'sistema'];
export const TEMAS_ETIQUETA = { claro: 'Claro', oscuro: 'Oscuro', sistema: 'Automático' };

function leer() {
  try {
    return localStorage.getItem(CLAVE) || 'sistema';
  } catch {
    return 'sistema';
  }
}

function aplicar(tema) {
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', oscuro);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#07111b' : '#0a2236');
}

const TemaContexto = createContext(null);

/** Tema de la interfaz: claro, oscuro o automático (según el dispositivo). Se recuerda en el navegador. */
export function TemaProvider({ children }) {
  const [tema, setTemaEstado] = useState(leer);

  useEffect(() => {
    aplicar(tema);
    if (tema !== 'sistema') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => aplicar('sistema');
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [tema]);

  const setTema = (t) => {
    setTemaEstado(t);
    try {
      localStorage.setItem(CLAVE, t);
    } catch {
      /* sin almacenamiento: vale solo para esta sesión */
    }
  };
  const siguiente = () => setTema(TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length]);

  return <TemaContexto.Provider value={{ tema, setTema, siguiente }}>{children}</TemaContexto.Provider>;
}

export const useTema = () => useContext(TemaContexto);
