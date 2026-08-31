import { describe, it, expect } from 'vitest'
import { repartirCobro, aCentavos } from './dividir'

describe('aCentavos', () => {
  it('no arrastra la basura del punto flotante', () => {
    expect(aCentavos(0.1 + 0.2)).toBe(0.3)
    expect(aCentavos(125 - 100.005)).toBe(25)
  })
})

describe('repartirCobro', () => {
  it('el caso de siempre: 100 en efectivo de una cuenta de 125', () => {
    expect(repartirCobro(125, '100')).toEqual({ primera: 100, segunda: 25, error: null })
  })

  it('reparte centavos sin dejar residuo', () => {
    const r = repartirCobro(130.5, '65.25')
    expect(r.primera + r.segunda).toBe(130.5)
    expect(r.error).toBeNull()
  })

  it('sin escribir nada, pide el monto en vez de cobrar cero', () => {
    expect(repartirCobro(125, '').error).toBe('Escribe cuánto paga con la primera forma.')
    expect(repartirCobro(125, '0').error).toBe('Escribe cuánto paga con la primera forma.')
    expect(repartirCobro(125, '-5').error).toBe('Escribe cuánto paga con la primera forma.')
  })

  it('si la primera ya cubre todo, no es un pago dividido', () => {
    expect(repartirCobro(125, '125').error).toBe('Eso ya cubre el total: no hace falta dividir.')
    expect(repartirCobro(125, '200').error).toBe('Eso ya cubre el total: no hace falta dividir.')
  })

  it('una orden en cero no se divide', () => {
    expect(repartirCobro(0, '10').error).toBe('Esta orden no tiene nada que cobrar.')
  })

  it('aguanta lo que teclea alguien a medias', () => {
    expect(repartirCobro(125, '1').error).toBeNull()
    expect(repartirCobro(125, '.').error).toBe('Escribe cuánto paga con la primera forma.')
    expect(repartirCobro(125, 'abc').error).toBe('Escribe cuánto paga con la primera forma.')
  })
})
