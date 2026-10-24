import { describe, expect, it } from 'vitest'
import { descuentoDeCupon, valorDeUnShake } from './cupones'

describe('descuentoDeCupon (espejo de fn_cupon_descuento)', () => {
  it('$20 sobre un shake de $125', () => {
    expect(descuentoDeCupon('monto', 20, 125)).toBe(20)
  })
  it('un monto nunca pasa de lo que vale el shake', () => {
    expect(descuentoDeCupon('monto', 20, 15)).toBe(15)
  })
  it('15 % de $125 = $18.75 (lo que dio el servidor en la prueba)', () => {
    expect(descuentoDeCupon('porcentaje', 15, 125)).toBe(18.75)
  })
  it('10 % se redondea a centavos', () => {
    expect(descuentoDeCupon('porcentaje', 10, 99.99)).toBe(10)
    expect(descuentoDeCupon('porcentaje', 15, 69)).toBe(10.35)
  })
  it('sin base no descuenta', () => {
    expect(descuentoDeCupon('porcentaje', 10, 0)).toBe(0)
    expect(descuentoDeCupon('monto', 20, -5)).toBe(0)
  })
})

describe('valorDeUnShake', () => {
  const items = [
    { linea: 'a', precio: 69, cantidad: 2, padreLinea: null },
    { linea: 'b', precio: 10, cantidad: 2, padreLinea: 'a' }, // doble scoop en los dos
    { linea: 'c', precio: 125, cantidad: 1, padreLinea: null },
  ]
  it('suma los extras que cuelgan del shake, por unidad', () => {
    expect(valorDeUnShake(items[0], items)).toBe(79)
  })
  it('sin extras es su precio', () => {
    expect(valorDeUnShake(items[2], items)).toBe(125)
  })
})
