/**
 * Proteína: el sistema guarda TODO en scoops (la unidad del insumo) y la
 * gente habla en botes (09/10/26).
 *
 * La bodega tiene botes cerrados y la barra scoops sueltos; abrir un bote
 * pasa sus scoops al kiosko. Guardar las dos cosas en la misma unidad es lo
 * que deja que «vino de bodega» reste allá lo mismo que suma aquí. Esto solo
 * traduce para enseñarlo: «59 scoops» con 27 por bote es «2 botes + 5 scoops».
 */

export interface BotesYScoops {
  botes: number
  scoops: number
  /** Para leer de un vistazo: «2 botes + 5 scoops», «−3 scoops». */
  texto: string
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/**
 * Parte una cantidad de scoops en botes completos y scoops sueltos.
 *
 * - Sin scoops por bote (null/0) no hay botes que contar: todo son scoops.
 * - Un negativo no se parte en botes: «−3 scoops» se entiende, «−1 bote +
 *   24 scoops» no. Y un negativo es un aviso, no un inventario.
 * - Los scoops sueltos se redondean a dos decimales (medio scoop existe).
 */
export function botesYScoops(scoops: number | null | undefined, porBote: number | null | undefined): BotesYScoops {
  const total = Number(scoops) || 0
  const pb = Number(porBote) || 0
  const r2 = (n: number) => Math.round(n * 100) / 100

  if (total < 0 || pb <= 0) {
    const s = r2(total)
    return { botes: 0, scoops: s, texto: plural(s, 'scoop', 'scoops') }
  }

  const botes = Math.floor((total + 1e-9) / pb)
  const sueltos = r2(total - botes * pb)
  let texto: string
  if (botes === 0) texto = plural(sueltos, 'scoop', 'scoops')
  else if (sueltos === 0) texto = plural(botes, 'bote', 'botes')
  else texto = `${plural(botes, 'bote', 'botes')} + ${plural(sueltos, 'scoop', 'scoops')}`
  return { botes, scoops: sueltos, texto }
}
