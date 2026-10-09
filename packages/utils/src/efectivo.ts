/**
 * Contar el efectivo del cajón por denominación.
 *
 * Vive aquí y no dentro del kiosko porque son dos apps: el kiosko lo
 * **escribe** al abrir y cerrar caja, y Admin lo **lee** en Cortes. Dos
 * copias de la misma forma se separan en cuanto alguien toca una, y
 * entonces el desglose que se ve no es el que se guardó.
 *
 * ## El billete de $20 y la moneda de $20 no son lo mismo
 *
 * La primera versión indexaba el conteo por denominación —`{20: 15}`— y
 * en México el 20 existe **como billete y como moneda**. Las dos filas
 * escribían la misma casilla: al teclear las monedas se borraban los
 * billetes. El total quedaba corto y el desglose mentía.
 *
 * Por eso ahora se guarda separado por especie. Es la única denominación
 * que colisiona hoy, pero la forma no depende de eso: si mañana vuelve el
 * billete de $10 o sale una moneda de $50, ya cabe.
 */

/** Billetes en circulación, del más grande al más chico. */
export const BILLETES = [1000, 500, 200, 100, 50, 20] as const
/** Monedas en circulación. */
export const MONEDAS = [20, 10, 5, 2, 1] as const

export interface Conteo {
  billetes: Record<number, number>
  monedas: Record<number, number>
}

export const CONTEO_VACIO: Conteo = { billetes: {}, monedas: {} }

function sumaLado(lado: Record<number, number> | undefined): number {
  if (!lado) return 0
  return Object.entries(lado).reduce(
    (t, [den, n]) => t + Number(den) * (Number(n) || 0),
    0,
  )
}

export function sumaConteo(c: Conteo | null | undefined): number {
  if (!c) return 0
  return sumaLado(c.billetes) + sumaLado(c.monedas)
}

/** Cambia cuántas piezas hay de una denominación, sin tocar la otra especie. */
export function ponerPiezas(
  c: Conteo,
  especie: 'billetes' | 'monedas',
  den: number,
  piezas: number,
): Conteo {
  return { ...c, [especie]: { ...c[especie], [den]: Math.max(0, piezas) } }
}

export function piezasDe(c: Conteo, especie: 'billetes' | 'monedas', den: number): number {
  return Number(c[especie]?.[den] ?? 0)
}

/**
 * Un desglose ya guardado, listo para pintar.
 *
 * `ambiguo` marca los diez cortes que se guardaron entre el 2 y el 6 de
 * septiembre, cuando el conteo era plano: ahí el `20` puede ser billetes,
 * monedas o una mezcla, y **no hay forma de saberlo**. Se dice en vez de
 * repartirlo a ojo: un dato inventado con cara de dato real es peor que
 * un hueco declarado.
 */
export interface DesgloseLeido {
  billetes: Record<number, number>
  monedas: Record<number, number>
  total: number
  ambiguo: boolean
}

/**
 * Lee un desglose guardado, venga en la forma vieja (plana) o en la nueva.
 *
 * La vieja es `{"200": 2, "20": 4}`; la nueva,
 * `{"billetes": {...}, "monedas": {...}}`. Se aceptan las dos porque en la
 * base ya hay de las dos, y reescribir las viejas exigiría adivinar cómo
 * se repartía ese `20`.
 */
export function leerDesglose(raw: unknown): DesgloseLeido | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  if (o.billetes || o.monedas) {
    const billetes = (o.billetes ?? {}) as Record<number, number>
    const monedas = (o.monedas ?? {}) as Record<number, number>
    return { billetes, monedas, total: sumaLado(billetes) + sumaLado(monedas), ambiguo: false }
  }

  // Forma vieja: todo plano. Las denominaciones que solo existen como
  // billete van a billetes, las que solo existen como moneda a monedas, y
  // el 20 se queda en billetes porque hay que pintarlo en algún lado —
  // pero el `ambiguo` avisa de que ese renglón no es de fiar.
  const billetes: Record<number, number> = {}
  const monedas: Record<number, number> = {}
  let tieneVeintes = false
  for (const [k, v] of Object.entries(o)) {
    const den = Number(k)
    const piezas = Number(v) || 0
    if (!Number.isFinite(den) || den <= 0) continue
    if (den === 20) {
      if (piezas > 0) tieneVeintes = true
      billetes[den] = piezas
    } else if ((BILLETES as readonly number[]).includes(den)) {
      billetes[den] = piezas
    } else {
      monedas[den] = piezas
    }
  }
  return {
    billetes, monedas,
    total: sumaLado(billetes) + sumaLado(monedas),
    ambiguo: tieneVeintes,
  }
}

// ---------------------------------------------------------------------------
// El fondo fijo (09/10/26)
//
// Al cerrar un turno se retira todo lo vendido y se queda un fondo fijo
// ($3,000) para dar cambio. Hasta ahora la cuenta de «cuánto saco y cuánto
// dejo» se hacía de cabeza, y el fondo de cada mañana salía distinto. Aquí
// se calcula a partir de lo CONTADO, pieza por pieza: no se puede dejar un
// billete que no se contó. El servidor (`fn_cerrar_corte_con_fondo`) vuelve
// a revisarlo.

type Especie = 'billetes' | 'monedas'

/** Todas las piezas del conteo, de la denominación más grande a la más chica. */
function piezasOrdenadas(c: Conteo): { especie: Especie; den: number; hay: number }[] {
  const filas: { especie: Especie; den: number; hay: number }[] = []
  for (const especie of ['billetes', 'monedas'] as const) {
    for (const [k, v] of Object.entries(c[especie] ?? {})) {
      const den = Number(k)
      const hay = Math.max(0, Math.floor(Number(v) || 0))
      if (den > 0 && hay > 0) filas.push({ especie, den, hay })
    }
  }
  // El billete de $20 antes que la moneda de $20: al RETIRAR se prefiere
  // sacar billetes y dejar monedas, que son las que dan cambio.
  return filas.sort((a, b) => b.den - a.den || (a.especie === 'billetes' ? -1 : 1))
}

/** a − b, pieza por pieza (nunca negativo). */
export function restarConteo(a: Conteo, b: Conteo): Conteo {
  const r: Conteo = { billetes: {}, monedas: {} }
  for (const especie of ['billetes', 'monedas'] as const) {
    for (const [k, v] of Object.entries(a[especie] ?? {})) {
      const n = (Number(v) || 0) - piezasDe(b, especie, Number(k))
      if (n > 0) r[especie][Number(k)] = n
    }
  }
  return r
}

/** ¿Cada pieza del fondo salió de lo contado? */
export function fondoCabeEnConteo(fondo: Conteo, conteo: Conteo): boolean {
  for (const especie of ['billetes', 'monedas'] as const) {
    for (const [k, v] of Object.entries(fondo[especie] ?? {})) {
      const n = Number(v) || 0
      if (n < 0 || !Number.isInteger(n)) return false
      if (n > piezasDe(conteo, especie, Number(k))) return false
    }
  }
  return true
}

export interface FondoSugerido {
  /** Las piezas que se quedan en caja. */
  fondo: Conteo
  /** Lo que se saca (lo contado menos el fondo). */
  retiro: Conteo
  /** Lo que falta para llegar al fondo fijo: > 0 solo si lo contado no alcanza. */
  faltante: number
  /** false = con esas piezas no se puede formar el monto exacto. */
  exacto: boolean
}

/**
 * Qué billetes y monedas dejar de fondo.
 *
 * Se resuelve al revés: se elige qué se RETIRA, empezando por los billetes
 * más grandes, y el fondo es lo que queda. Así el cajón se queda con lo que
 * sirve para dar cambio —monedas y billetes chicos— y lo grande se va, que
 * es lo que uno haría a mano.
 *
 * Es una búsqueda exacta y no un «toma el más grande que quepa»: con un
 * billete de $50 y tres de $20, retirar $60 solo sale con los tres de $20, y
 * el atajo se quedaría en $50 sin poder completar. Si no hay forma de llegar
 * al monto exacto, lo dice (`exacto: false`) y deja el fondo lo más cerca
 * posible por ARRIBA — mejor un fondo de $3,010 que uno de $2,990 que obliga
 * a reponer.
 *
 * Si lo contado no alcanza para el fondo, todo se queda y `faltante` dice
 * cuánto hay que reponer.
 */
export function sugerirFondo(conteo: Conteo, fondoFijo: number): FondoSugerido {
  const total = sumaConteo(conteo)
  const fijo = Math.max(0, Math.round(fondoFijo))
  if (total <= fijo) {
    return {
      fondo: restarConteo(conteo, CONTEO_VACIO),
      retiro: { billetes: {}, monedas: {} },
      faltante: fijo - total,
      exacto: total === fijo,
    }
  }

  const filas = piezasOrdenadas(conteo)
  // Lo que se puede retirar como máximo con las piezas que quedan a partir
  // de la fila i: para podar las ramas que ya no llegan.
  const resto: number[] = new Array(filas.length + 1).fill(0)
  for (let i = filas.length - 1; i >= 0; i--) resto[i] = resto[i + 1] + filas[i].den * filas[i].hay

  // Busca un retiro EXACTO de `meta`, prefiriendo billetes grandes. Memo
  // por (fila, cuánto falta) para que un cajón con 300 monedas no explote.
  const imposible = new Set<string>()
  const tomar: number[] = new Array(filas.length).fill(0)
  function buscar(i: number, falta: number): boolean {
    if (falta === 0) return true
    if (i >= filas.length || falta > resto[i]) return false
    const clave = `${i}:${falta}`
    if (imposible.has(clave)) return false
    const f = filas[i]
    for (let n = Math.min(f.hay, Math.floor(falta / f.den)); n >= 0; n--) {
      tomar[i] = n
      if (buscar(i + 1, falta - n * f.den)) return true
    }
    tomar[i] = 0
    imposible.add(clave)
    return false
  }

  // El retiro ideal es total − fijo. Si no sale exacto, se retira un poco
  // menos (el fondo queda un poco arriba), peso por peso.
  const ideal = total - fijo
  for (let meta = ideal; meta >= 0; meta--) {
    tomar.fill(0)
    if (buscar(0, meta)) {
      const retiro: Conteo = { billetes: {}, monedas: {} }
      filas.forEach((f, i) => { if (tomar[i] > 0) retiro[f.especie][f.den] = tomar[i] })
      return { fondo: restarConteo(conteo, retiro), retiro, faltante: 0, exacto: meta === ideal }
    }
  }
  // Inalcanzable (meta 0 siempre sale), pero TypeScript no lo sabe.
  return { fondo: restarConteo(conteo, CONTEO_VACIO), retiro: { billetes: {}, monedas: {} }, faltante: 0, exacto: false }
}
