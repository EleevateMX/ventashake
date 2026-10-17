/**
 * Cuántas mancuernas gana una compra (17/10/26).
 *
 * Espejo de `fn_acumular_mancuernas`, que es la que de verdad las abona al
 * cobrar: 1 por cada $14 de compra, tope de 100 por orden. Antes eran $10,
 * y las pantallas lo tenían escrito a mano en tres lugares: al cambiar el
 * servidor, el kiosko y la caja siguieron prometiendo de más. Por eso vive
 * aquí, una sola vez.
 *
 * Ojo: NO es la tasa de canje (10 mancuernas = $1), que es otra cosa y no
 * cambió.
 */
export const PESOS_POR_MANCUERNA = 14
export const TOPE_MANCUERNAS_POR_ORDEN = 100

export function mancuernasPorCompra(total: number): number {
  if (!(total > 0)) return 0
  return Math.min(TOPE_MANCUERNAS_POR_ORDEN, Math.floor(total / PESOS_POR_MANCUERNA))
}
