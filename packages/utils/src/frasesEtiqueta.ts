/**
 * Las frases del pie de la etiqueta, del lado de Admin (09/10/26).
 *
 * La etiqueta tiene lugar para DOS renglones de 14 letras en la fuente de
 * la frase, y la impresora va en cp850: nada de acentos ni «ñ». Estas son
 * las mismas reglas que `partir` del agente (agente-impresion/src/tspl.ts)
 * y que `fn_frase_cabe` en la base, que es la que manda: aquí solo sirven
 * para enseñar la vista previa y avisar ANTES de guardar.
 */

export const RENGLON_FRASE = 14
export const RENGLONES_FRASE = 2

/** Quita acentos y lo que la impresora no tiene. «Día» → «Dia». */
export function limpiarFrase(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ñÑ]/g, (c) => (c === 'ñ' ? 'n' : 'N'))
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parte la frase en renglones como lo hará la impresora. */
export function renglonesFrase(texto: string, ancho = RENGLON_FRASE): string[] {
  const renglones: string[] = []
  let actual = ''
  for (const palabra of texto.trim().split(/\s+/).filter(Boolean)) {
    if (!actual) actual = palabra
    else if (actual.length + 1 + palabra.length <= ancho) actual += ` ${palabra}`
    else { renglones.push(actual); actual = palabra }
  }
  if (actual) renglones.push(actual)
  return renglones
}

/** null si cabe; si no, por qué no (para decírselo a quien la escribe). */
export function problemaDeFrase(texto: string): string | null {
  const t = texto.trim()
  if (!t) return 'Escribe la frase.'
  if (/[^\x20-\x7e]/.test(t)) return 'Trae acentos o símbolos que la impresora no tiene.'
  const larga = t.split(/\s+/).find((p) => p.length > RENGLON_FRASE)
  if (larga) return `«${larga}» no cabe en un renglón (máximo ${RENGLON_FRASE} letras).`
  const n = renglonesFrase(t).length
  if (n > RENGLONES_FRASE) return `Ocupa ${n} renglones; caben ${RENGLONES_FRASE} de ${RENGLON_FRASE} letras.`
  return null
}
