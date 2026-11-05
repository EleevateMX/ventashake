import { describe, expect, it } from 'vitest'
import { mancuernasPorCompra } from './mancuernas'

describe('mancuernasPorCompra', () => {
  it('1 por cada $14, hacia abajo', () => {
    expect(mancuernasPorCompra(13.99)).toBe(0)
    expect(mancuernasPorCompra(14)).toBe(1)
    expect(mancuernasPorCompra(125)).toBe(8)
    expect(mancuernasPorCompra(204)).toBe(14)
  })
  it('tope de 100 por orden', () => {
    expect(mancuernasPorCompra(5000)).toBe(100)
  })
  it('nada con total vacío o negativo', () => {
    expect(mancuernasPorCompra(0)).toBe(0)
    expect(mancuernasPorCompra(-50)).toBe(0)
    expect(mancuernasPorCompra(Number.NaN)).toBe(0)
  })
})

import { montoQueNoSuma, REGLAS_DE_SIEMPRE, type ReglasMancuernas } from './mancuernas'

describe('reglas de Admin → Rewards', () => {
  // El mismo caso que se probó cobrando en producción (05/11/26):
  // shake $125 + leche $10 colgada + bebida $49.
  const lineas = [
    { linea: 'a', producto_id: 'shake', precio: 125, cantidad: 1 },
    { linea: 'b', producto_id: 'leche', precio: 10, cantidad: 1, padreLinea: 'a' },
    { linea: 'c', producto_id: 'agua', precio: 49, cantidad: 1 },
  ]
  const con = (r: Partial<ReglasMancuernas>) => ({ ...REGLAS_DE_SIEMPRE, ...r })

  it('sin nada fuera, suma todo', () => {
    expect(montoQueNoSuma(lineas, REGLAS_DE_SIEMPRE)).toBe(0)
    expect(mancuernasPorCompra(184)).toBe(13)
  })
  it('el extra sigue a su producto', () => {
    const r = con({ no_acumulan: ['shake'] })
    expect(montoQueNoSuma(lineas, r)).toBe(135)
    expect(mancuernasPorCompra(184, r, montoQueNoSuma(lineas, r))).toBe(3)
  })
  it('todo fuera da cero', () => {
    const r = con({ no_acumulan: ['shake', 'agua'] })
    expect(mancuernasPorCompra(184, r, montoQueNoSuma(lineas, r))).toBe(0)
  })
  it('otra tasa y otro tope', () => {
    expect(mancuernasPorCompra(135, con({ pesos_por_mancuerna: 10, tope_por_orden: 5 }))).toBe(5)
  })
  it('apagado no suma', () => {
    expect(mancuernasPorCompra(500, con({ activo: false }))).toBe(0)
  })
  it('el descuento se come primero lo que sí suma', () => {
    const r = con({ no_acumulan: ['agua'] })
    // 184 de lista, 30 de descuento: 154 cobrados, 49 no suman → 105 → 7
    expect(mancuernasPorCompra(154, r, montoQueNoSuma(lineas, r))).toBe(7)
  })
})
