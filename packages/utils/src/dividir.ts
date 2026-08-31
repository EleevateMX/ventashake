/**
 * Repartir un cobro en dos formas de pago.
 *
 * El cajero teclea UN número —lo que el cliente da en la primera forma— y
 * el resto se calcula. Pedirle los dos montos sería pedirle que haga la
 * resta con gente esperando, y una resta mal hecha aquí no es un número
 * feo: es una orden que el servidor rechaza con la fila detenida.
 *
 * El servidor vuelve a validar que las partes sumen el total
 * (`fn_cobrar_orden_dividido`). Esto es para que el cajero lo sepa ANTES
 * de tocar cobrar, no para reemplazar esa validación.
 */

/** Redondeo a centavos. `0.1 + 0.2` no da `0.3`, y el total de una orden sí. */
export function aCentavos(n: number): number {
  return Math.round(n * 100) / 100
}

export interface RepartoCobro {
  /** Lo que se cobra en la primera forma de pago. */
  primera: number
  /** El resto. Nunca negativo cuando `error` es null. */
  segunda: number
  /** Qué decirle al cajero, o null si el reparto es válido. */
  error: string | null
}

/**
 * `total` es el de la orden; `montoPrimera` lo que tecleó el cajero (puede
 * venir vacío o a medio escribir, de ahí el string).
 */
export function repartirCobro(total: number, montoPrimera: string | number): RepartoCobro {
  const t = aCentavos(total)
  const bruto = typeof montoPrimera === 'number' ? montoPrimera : parseFloat(montoPrimera)
  const primera = Number.isFinite(bruto) ? aCentavos(bruto) : 0
  const segunda = aCentavos(t - primera)

  if (t <= 0) {
    return { primera: 0, segunda: 0, error: 'Esta orden no tiene nada que cobrar.' }
  }
  if (!Number.isFinite(bruto) || primera <= 0) {
    return { primera, segunda, error: 'Escribe cuánto paga con la primera forma.' }
  }
  if (primera >= t) {
    return { primera, segunda, error: 'Eso ya cubre el total: no hace falta dividir.' }
  }
  return { primera, segunda, error: null }
}
