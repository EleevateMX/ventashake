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
