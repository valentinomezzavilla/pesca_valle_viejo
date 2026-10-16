import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api/cliente.js';

const CLAVE = 'pescaderia.cajaId';

function leerCajaGuardada() {
  try {
    return Number(localStorage.getItem(CLAVE)) || null;
  } catch {
    return null;
  }
}

/** Caja física en la que trabaja este dispositivo (se recuerda en el navegador) y su turno abierto. */
export function useCaja() {
  const [cajaId, setCajaIdEstado] = useState(leerCajaGuardada);
  const cajas = useQuery({ queryKey: ['cajas'], queryFn: () => get('/cajas') });
  const activas = (cajas.data ?? []).filter((c) => c.activa);

  // Si no hay caja elegida (o ya no existe), se toma la primera activa
  useEffect(() => {
    if (!activas.length) return;
    if (!cajaId || !activas.some((c) => c.id === cajaId)) setCajaIdEstado(activas[0].id);
  }, [activas, cajaId]);

  const setCajaId = (id) => {
    setCajaIdEstado(id);
    try {
      localStorage.setItem(CLAVE, String(id));
    } catch {
      /* sin almacenamiento: se usa solo en esta pantalla */
    }
  };

  const actual = useQuery({
    queryKey: ['caja-actual', cajaId],
    queryFn: () => get(`/cajas/${cajaId}/actual`),
    enabled: !!cajaId,
  });

  return {
    cajas: activas,
    cajaId,
    setCajaId,
    caja: activas.find((c) => c.id === cajaId),
    resumen: actual.data ?? null, // null = cerrada
    abierta: !!actual.data,
    cargando: cajas.isLoading || actual.isLoading,
    refrescar: () => actual.refetch(),
  };
}
