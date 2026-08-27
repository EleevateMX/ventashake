/**
 * Qué tan urgente está una comanda en la pantalla de la estación.
 *
 * Vive aquí y no en cada app porque las dos pantallas — barra y cocina —
 * tienen que seguir la misma regla, y solo cambia el minutero: la barra
 * aprieta a los 3 minutos, la cocina a los 5. Duplicar esto en dos
 * archivos es garantizar que dentro de un mes digan cosas distintas.
 *
 * La regla, tal como la pidió la barra:
 *
 *   · Recién llegada y sin activar  → parpadea en VERDE. Es una comanda
 *     nueva que nadie ha tomado; el parpadeo es para que se note entre el
 *     ruido, no para alarmar.
 *   · Activada y dentro de tiempo   → tranquila, sin parpadeo.
 *   · Activada y pasada de tiempo   → parpadea en ROJO.
 *
 * El reloj del rojo corre desde que se ACTIVÓ, no desde que llegó: lo que
 * se está midiendo es cuánto lleva alguien preparándola. Una comanda que
 * estuvo diez minutos esperando a que la tomaran no debe salir en rojo en
 * el segundo uno de su preparación.
 */
export type Urgencia = 'nueva' | 'a_tiempo' | 'tarde'

export function urgenciaComanda(
  estado: string,
  /** Cuándo cambió de estado por última vez (ISO). */
  actualizadoEn: string | null | undefined,
  ahora: number,
  umbralMinutos: number,
): Urgencia {
  if (estado === 'pendiente') return 'nueva'
  if (estado !== 'en_preparacion') return 'a_tiempo'

  if (!actualizadoEn) return 'a_tiempo'
  const desde = new Date(actualizadoEn).getTime()
  // Una fecha que no se puede leer no debe pintar la pantalla de rojo:
  // más vale no avisar que avisar por un dato roto.
  if (Number.isNaN(desde)) return 'a_tiempo'

  const minutos = (ahora - desde) / 60000
  return minutos >= umbralMinutos ? 'tarde' : 'a_tiempo'
}

/** Minutos que aguanta cada estación antes de ponerse en rojo. */
export const UMBRAL_MINUTOS = {
  bebidas: 3,
  alimentos: 5,
} as const
