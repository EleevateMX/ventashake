/**
 * Las promos automáticas, calculadas en el navegador.
 *
 * **El dinero no se decide aquí.** El total autoritativo lo recalcula
 * `fn_descuento_promos` en el servidor al crear la orden, igual que los
 * precios. Esto existe para que el cajero vea el número correcto ANTES de
 * pedir el dinero — si la calculadora de cambio dijera $30 y la orden se
 * cobrara en $25, el cajón cerraría descuadrado todos los días.
 *
 * Es la misma regla que el SQL, a propósito, y por eso las dos están
 * probadas contra los mismos casos.
 */

export type TipoPromo = 'n_x_precio' | 'descuento_pct'

export interface PromoVigente {
  id: string
  nombre: string
  tipo: string
  /** n_x_precio: lo que cuesta el paquete. descuento_pct: fracción 0-1. */
  valor: number
  /** La N de "N x precio". */
  cantidad: number | null
  /** A qué productos alcanza. */
  productos: string[] | null
}

export interface LineaParaPromo {
  producto_id: string
  cantidad: number
  /** Precio UNITARIO ya resuelto (el de la línea, no el de catálogo). */
  precio: number
}

export interface PromoAplicada {
  promo: PromoVigente
  descuento: number
}

/**
 * Cuánto descuenta cada promo sobre estas líneas.
 *
 * `n_x_precio`: las unidades alcanzadas se ordenan de MÁS CARA a más
 * barata y se agrupan de N en N. Cada grupo COMPLETO paga `valor`; uno
 * incompleto no descuenta — tres cookies en un 2x25 son un paquete y una
 * suelta. Las caras entran primero, que es lo que esperaría cualquiera que
 * lea "2 x 25" en un pizarrón.
 *
 * `descuento_pct`: sobre lo que suman los productos alcanzados, no sobre
 * el ticket entero: un 20% en shakes no debe tocar la comida.
 *
 * Nunca devuelve negativo: un "2 x 40" sobre cookies de $15 descuenta 0,
 * no cobra de más.
 */
export function descuentoPromos(
  lineas: LineaParaPromo[],
  promos: PromoVigente[],
): PromoAplicada[] {
  const unidades: { producto_id: string; precio: number }[] = []
  for (const l of lineas) {
    const n = Math.max(0, Math.floor(l.cantidad || 0))
    for (let i = 0; i < n; i++) {
      unidades.push({ producto_id: l.producto_id, precio: Math.max(0, l.precio || 0) })
    }
  }

  const aplicadas: PromoAplicada[] = []
  for (const promo of promos) {
    const alcance = promo.productos
    if (!alcance || alcance.length === 0) continue

    const precios = unidades
      .filter((u) => alcance.includes(u.producto_id))
      .map((u) => u.precio)
      .sort((a, b) => b - a)
    if (precios.length === 0) continue

    let descuento = 0
    if (promo.tipo === 'n_x_precio') {
      const n = promo.cantidad ?? 0
      if (n < 2) continue
      for (let i = 0; i + n <= precios.length; i += n) {
        const suma = precios.slice(i, i + n).reduce((s, p) => s + p, 0)
        descuento += Math.max(0, suma - promo.valor)
      }
    } else if (promo.tipo === 'descuento_pct') {
      const pct = Math.min(1, Math.max(0, promo.valor))
      const suma = precios.reduce((s, p) => s + p, 0)
      descuento = Math.round(suma * pct * 100) / 100
    } else {
      continue
    }

    if (descuento > 0) aplicadas.push({ promo, descuento })
  }
  return aplicadas
}

/** Lo que bajan todas las promos juntas. */
export function totalDescuentoPromos(
  lineas: LineaParaPromo[],
  promos: PromoVigente[],
): number {
  return descuentoPromos(lineas, promos).reduce((s, a) => s + a.descuento, 0)
}
