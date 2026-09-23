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

/**
 * Qué vaso agarrar, contando lo que el cliente le agregó.
 *
 * El caso que lo pidió: **El Clásico es de 16 oz, pero con un «Preparado»
 * encima es un signature de 20 oz.** La pantalla de barra leía las onzas
 * del producto base y decía 16, así que el shake se preparaba en el vaso
 * chico y no cabía. Nadie lo reportó como «las onzas están mal» — se
 * reportó como «hay que poner el vaso de 20 oz cuando se elige un
 * preparado», que es el síntoma.
 *
 * La regla es **el vaso más grande de todo lo que va adentro**: un extra
 * puede subir el tamaño, nunca bajarlo. Y el tamaño sale del catálogo
 * (`productos.onzas`), no de una lista de nombres escrita aquí: el día
 * que entre un preparado nuevo tiene que traer su vaso solo.
 */
export function vasoDeItem(
  item: { productos?: { onzas?: number | null } | null },
  extras: ReadonlyArray<{ productos?: { onzas?: number | null } | null }> = [],
): number | null {
  const tamanos = [item, ...extras]
    .map((x) => x.productos?.onzas)
    .filter((o): o is number => typeof o === 'number' && o > 0)
  return tamanos.length > 0 ? Math.max(...tamanos) : null
}

/**
 * Un pedido programado: pagado ahora, para recoger más tarde.
 *
 * Tres estados y cada uno resuelve un miedo distinto que se dijo al
 * pedirlo:
 *
 * - `'ninguna'` — no está programado. El 99% de las comandas.
 * - `'programada'` — todavía no es hora. Se pinta bien marcada **y sin
 *   parpadear**: el parpadeo verde de «comanda nueva» existe para que
 *   alguien la tome ya, que es exactamente lo contrario de lo que hay que
 *   hacer con esta. *No se prepara antes de tiempo.*
 * - `'es_hora'` — ya llegó (o falta poco). A partir de aquí se comporta
 *   como cualquier comanda nueva, con su parpadeo. *No se olvida.*
 *
 * La comanda **nunca se esconde**, en ninguno de los tres. Una comanda que
 * aparece sola a las 8:25 es una comanda que nadie vio venir, y en un
 * cambio de turno se pierde — que es el problema que se venía resolviendo
 * con anotaciones en papel.
 */
export type EstadoProgramado = 'ninguna' | 'programada' | 'es_hora'

/** Cuánto antes de la hora deja de ser «para después» y pasa a ser «ya». */
export const AVISO_PROGRAMADA_MIN = 10

export function estadoProgramado(
  prepararA: string | null | undefined,
  ahora: number = Date.now(),
): EstadoProgramado {
  if (!prepararA) return 'ninguna'
  const t = new Date(prepararA).getTime()
  // Una fecha ilegible no debe esconder ni marcar nada: se trata como una
  // comanda normal, que es el camino que no pierde pedidos.
  if (Number.isNaN(t)) return 'ninguna'
  return t - ahora > AVISO_PROGRAMADA_MIN * 60000 ? 'programada' : 'es_hora'
}

/** "8:30 PM" en hora de Mérida, para pintarlo grande. */
export function horaDeEntrega(prepararA: string | null | undefined): string {
  if (!prepararA) return ''
  const d = new Date(prepararA)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Merida', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d).toUpperCase().replace(/\s+/g, ' ')
}
