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
