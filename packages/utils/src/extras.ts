/**
 * Cómo se clasifican y cómo se eligen solas las opciones de un producto.
 *
 * Vivía dentro del kiosko, y por eso el POS no lo tenía: un shake cobrado en
 * caja salía a barra sin decir con qué leche. De 522 shakes en diez días, 47
 * (9%) llegaron así. Barra tenía que preguntar, o adivinar.
 *
 * Espejo en el servidor: `fn_clase_extra(nombre, grupo)`. Las dos tienen que
 * partir igual, porque una marca la opción por defecto desde Admin y la otra
 * la lee al armar el pedido.
 */

/** Lo mínimo que hace falta de un extra para clasificarlo y elegirlo. */
export interface OpcionExtra {
  extra_id: string
  nombre: string
  precio: number
  grupo?: string | null
  /** Marcado en Admin como "la de casa" para ESE producto. */
  por_defecto?: boolean
}

/**
 * La base SUSTITUYE la líquida de la receta, así que se elige una sola.
 * Incluye el agua: en El Clásico "¿con qué lo preparamos?" admite agua, y
 * viaja igual que una leche — pegada al shake, no como línea aparte.
 */
export const esBase = (nombre: string) => /^(leche\b|agua\b|sin leche)/i.test(nombre.trim())

/**
 * Proteína a elegir: solo la traen los shakes que se arman a gusto (El
 * Clásico), cuya receta no incluye proteína — la pone el cliente.
 */
export const esProteina = (nombre: string) => /^prote[ií]na/i.test(nombre.trim())

/**
 * Las galletas son una promoción: +$5 por 2 piezas, una vez por shake. No
 * tienen "de casa" — que no lleve ninguna es una respuesta válida.
 */
export const esGalleta = (nombre: string) => /galleta/i.test(nombre.trim())

/** El extra que pide doble scoop; vive junto a la proteína, no entre los adicionales. */
export const esDobleScoop = (nombre: string) => /doble\s+scoop/i.test(nombre.trim())

/**
 * "Sin leche" es la base natural de un americano o un cold brew. Si fuera una
 * base cualquiera, cada café saldría a barra con "+ENTERA" y le pondrían
 * leche a un café solo.
 */
export const esSinLeche = (nombre: string) => /^sin leche/i.test(nombre.trim())

/**
 * A qué clase pertenece un extra dentro de su producto. Dos extras de la
 * misma clase compiten: elegir uno descarta al otro, y solo uno puede ser
 * el de casa.
 *
 * El nombre manda sobre el grupo porque bases y proteínas tienen sección
 * propia en pantalla; algunas proteínas además traen `grupo = 'proteina'`
 * escrito, y si el grupo ganara, la misma proteína caería en dos clases
 * distintas según el producto. `null` = adicional suelto, con cantidad.
 */
export function claseExtra(nombre: string, grupo?: string | null): string | null {
  if (esBase(nombre)) return 'base'
  if (esProteina(nombre)) return 'proteina'
  if (esGalleta(nombre)) return null
  const g = (grupo ?? '').trim()
  return g ? `g:${g}` : null
}

/**
 * Orden en que la sucursal quiere ver las bases (pedido del 20/08/26).
 *
 * Alfabético no servía: dejaba "Leche de almendras" antes que la
 * deslactosada, que es la que más se pide. El agua va al inicio donde ya
 * estaba, y "Sin leche" al final —solo la traen los cafés, donde es el
 * estado natural y no hay que ir a buscarla.
 *
 * Lo que no esté aquí se va al final en alfabético: una leche nueva dada de
 * alta en Admin aparece sola, sin tocar código.
 */
const ORDEN_BASES = [
  'agua',
  'agua mineral',
  'leche entera',
  'leche deslactosada',
  'leche deslactosada light',
  'leche de almendras',
  'leche de avena',
  'leche de coco',
  'sin leche',
]

export function ordenarBases<T extends { nombre: string }>(bases: T[]): T[] {
  const pos = (n: string) => {
    const i = ORDEN_BASES.indexOf(n.trim().toLowerCase())
    return i === -1 ? 99 : i
  }
  return [...bases].sort((a, b) => pos(a.nombre) - pos(b.nombre) || a.nombre.localeCompare(b.nombre))
}

/**
 * Respaldo cuando nadie marcó la de casa en Admin. Es la regla que vivía
 * escrita en el kiosko y se conserva para que el día que se despliegue esto,
 * antes de que gerencia toque nada, salga exactamente lo mismo que ayer.
 *
 * "Deslactosada" no sirve por regex simple: también le pega a "deslactosada
 * light", así que el respaldo la excluye.
 */
const LECHE_DE_CASA = /entera/i
const LECHE_RESPALDO = (n: string) => /deslactosada/i.test(n) && !/light/i.test(n)

/**
 * La base con la que sale el producto si el cliente no toca nada.
 *
 * Manda lo marcado en Admin. Sin marca, "Sin leche" gana a todo (si el
 * producto la ofrece es porque va sin), y si no, la regla de siempre.
 */
export function baseDeCasa<T extends OpcionExtra>(bases: T[]): T | null {
  return (
    bases.find((b) => b.por_defecto) ??
    bases.find((b) => esSinLeche(b.nombre)) ??
    bases.find((b) => LECHE_DE_CASA.test(b.nombre)) ??
    bases.find((b) => LECHE_RESPALDO(b.nombre)) ??
    bases[0] ??
    null
  )
}

/** La marca de Admin manda; si no hay, la primera de la lista. */
export function opcionDeCasa<T extends OpcionExtra>(opciones: T[]): T | null {
  return opciones.find((o) => o.por_defecto) ?? opciones[0] ?? null
}

/**
 * Qué se escribe de la base en la comanda.
 *
 * Siempre, aunque sea la de casa: barra pidió verla en TODAS las comandas y
 * no solo cuando el cliente la cambia — con 47 shakes de cada 522 saliendo
 * mudos, la ausencia de nota no distinguía "la de siempre" de "se les
 * olvidó preguntar".
 *
 * Dos excepciones con motivo:
 *   · "Sin leche" no deja nota — es el estado natural del americano y
 *     escribirlo en cada etiqueta sería ruido.
 *   · Una base CON precio (agua mineral +$10) no va como nota sino como
 *     línea hija cobrada: la nota no cobra, y regalar los $10 en silencio
 *     es el tipo de fuga que nadie detecta hasta el corte.
 */
export function notaDeBase(base: OpcionExtra | null | undefined): string | null {
  if (!base) return null
  if (base.precio > 0) return null
  if (esSinLeche(base.nombre)) return null
  return base.nombre
}

/** La base que además hay que cobrar como línea propia (agua mineral, etc.). */
export function baseCobrada<T extends OpcionExtra>(base: T | null | undefined): T | null {
  return base && base.precio > 0 ? base : null
}
