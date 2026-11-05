/**
 * Cuántas mancuernas gana una compra.
 *
 * Espejo de `fn_acumular_mancuernas`, que es la que de verdad las abona al
 * cobrar. Desde el 05/11/26 las reglas viven en la base (Admin → Rewards):
 * cuántos pesos dan una mancuerna, el tope por ticket, un interruptor, y
 * qué productos NO suman. El kiosko y la caja las leen con
 * `fn_rewards_reglas` y las pasan aquí; sin reglas cargadas se usan las de
 * siempre (1 por cada $14, tope 100), que son las que nacieron en la tabla.
 *
 * Ojo: NO es la tasa de canje (10 mancuernas = $1), que es otra cosa.
 */
export const PESOS_POR_MANCUERNA = 14
export const TOPE_MANCUERNAS_POR_ORDEN = 100

export interface ReglasMancuernas {
  activo: boolean
  pesos_por_mancuerna: number
  tope_por_orden: number
  /** Ids de producto que no suman (por producto o por su categoría). */
  no_acumulan: string[]
}

export const REGLAS_DE_SIEMPRE: ReglasMancuernas = {
  activo: true,
  pesos_por_mancuerna: PESOS_POR_MANCUERNA,
  tope_por_orden: TOPE_MANCUERNAS_POR_ORDEN,
  no_acumulan: [],
}

/** Lo mínimo de una línea del carrito para saber si suma. */
export interface LineaParaMancuernas {
  linea: string
  producto_id: string
  precio: number
  cantidad: number
  /** Si es un extra, la línea del producto al que acompaña. */
  padreLinea?: string | null
}

/**
 * Cuánto del carrito NO suma: los productos que gerencia sacó y los
 * extras colgados de ellos (la leche de un shake que no suma tampoco suma),
 * igual que el servidor.
 */
export function montoQueNoSuma(lineas: LineaParaMancuernas[], reglas: ReglasMancuernas): number {
  if (!reglas.no_acumulan.length) return 0
  const fuera = new Set(reglas.no_acumulan)
  const lineasFuera = new Set(lineas.filter((l) => fuera.has(l.producto_id)).map((l) => l.linea))
  return lineas
    .filter((l) => lineasFuera.has(l.linea) || (l.padreLinea != null && lineasFuera.has(l.padreLinea)))
    .reduce((s, l) => s + l.precio * l.cantidad, 0)
}

/**
 * Mancuernas de una compra de `total` pesos (ya con descuentos), de los
 * que `noSuma` pesos no cuentan.
 */
export function mancuernasPorCompra(
  total: number,
  reglas: ReglasMancuernas = REGLAS_DE_SIEMPRE,
  noSuma = 0,
): number {
  if (!reglas.activo) return 0
  const base = Math.max(0, total - noSuma)
  if (!(base > 0) || !(reglas.pesos_por_mancuerna > 0)) return 0
  return Math.min(reglas.tope_por_orden, Math.floor(base / reglas.pesos_por_mancuerna))
}
