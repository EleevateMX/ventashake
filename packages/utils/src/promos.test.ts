import { describe, expect, it } from 'vitest'
import { descuentoPromos, totalDescuentoPromos, type PromoVigente } from './promos'

const CHISPAS = 'a1'
const MACA = 'a2'
const SHAKE = 'b1'

/** El 2x25 real de la tienda: dos cookies de $15 por $25. */
const DOS_POR_25: PromoVigente = {
  id: 'p1', nombre: 'Cookies 2 x $25', tipo: 'n_x_precio',
  valor: 25, cantidad: 2, productos: [CHISPAS, MACA],
}

const cookie = (id: string, cantidad: number) => ({ producto_id: id, cantidad, precio: 15 })

describe('promos automáticas', () => {
  it('una sola cookie no arma paquete', () => {
    expect(totalDescuentoPromos([cookie(CHISPAS, 1)], [DOS_POR_25])).toBe(0)
  })

  it('dos iguales pagan 25', () => {
    expect(totalDescuentoPromos([cookie(CHISPAS, 2)], [DOS_POR_25])).toBe(5)
  })

  it('dos de sabores distintos también', () => {
    expect(totalDescuentoPromos([cookie(CHISPAS, 1), cookie(MACA, 1)], [DOS_POR_25])).toBe(5)
  })

  it('tres son un paquete y una suelta', () => {
    expect(totalDescuentoPromos([cookie(CHISPAS, 3)], [DOS_POR_25])).toBe(5)
  })

  it('cuatro son dos paquetes', () => {
    expect(totalDescuentoPromos([cookie(CHISPAS, 4)], [DOS_POR_25])).toBe(10)
  })

  it('no toca lo que está fuera del alcance', () => {
    const lineas = [{ producto_id: SHAKE, cantidad: 1, precio: 125 }, cookie(CHISPAS, 2)]
    expect(totalDescuentoPromos(lineas, [DOS_POR_25])).toBe(5)
  })

  it('las caras entran primero al paquete', () => {
    // Tres piezas de 20, 15 y 10: el paquete se arma con las dos caras.
    const lineas = [
      { producto_id: CHISPAS, cantidad: 1, precio: 20 },
      { producto_id: MACA, cantidad: 1, precio: 15 },
      { producto_id: CHISPAS, cantidad: 1, precio: 10 },
    ]
    expect(totalDescuentoPromos(lineas, [DOS_POR_25])).toBe(10)
  })

  it('nunca cobra de más si el paquete sale más caro que las piezas', () => {
    const caro: PromoVigente = { ...DOS_POR_25, valor: 40 }
    expect(totalDescuentoPromos([cookie(CHISPAS, 2)], [caro])).toBe(0)
  })

  it('una promo sin alcance no hace nada', () => {
    const sinAlcance: PromoVigente = { ...DOS_POR_25, productos: null }
    expect(totalDescuentoPromos([cookie(CHISPAS, 2)], [sinAlcance])).toBe(0)
  })

  it('el porcentaje solo pega a los productos alcanzados', () => {
    const veintePct: PromoVigente = {
      id: 'p2', nombre: '20% en cookies', tipo: 'descuento_pct',
      valor: 0.2, cantidad: null, productos: [CHISPAS],
    }
    const lineas = [{ producto_id: SHAKE, cantidad: 1, precio: 125 }, cookie(CHISPAS, 2)]
    expect(totalDescuentoPromos(lineas, [veintePct])).toBe(6)
  })

  it('dice qué promo entró, para poder nombrarla en pantalla', () => {
    const [a] = descuentoPromos([cookie(CHISPAS, 2)], [DOS_POR_25])
    expect(a.promo.nombre).toBe('Cookies 2 x $25')
    expect(a.descuento).toBe(5)
  })
})
