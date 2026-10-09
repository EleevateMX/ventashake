import { describe, expect, it } from 'vitest'
import { botesYScoops } from './proteina'

describe('botesYScoops', () => {
  it('parte en botes completos y scoops sueltos', () => {
    expect(botesYScoops(59, 27)).toEqual({ botes: 2, scoops: 5, texto: '2 botes + 5 scoops' })
  })

  it('un bote exacto no dice «+ 0 scoops»', () => {
    expect(botesYScoops(27, 27).texto).toBe('1 bote')
    expect(botesYScoops(54, 27).texto).toBe('2 botes')
  })

  it('menos de un bote son solo scoops', () => {
    expect(botesYScoops(1, 27).texto).toBe('1 scoop')
    expect(botesYScoops(0, 27).texto).toBe('0 scoops')
  })

  it('sin scoops por bote no inventa botes', () => {
    expect(botesYScoops(40, null)).toEqual({ botes: 0, scoops: 40, texto: '40 scoops' })
    expect(botesYScoops(40, 0).botes).toBe(0)
  })

  it('un negativo se queda en scoops', () => {
    expect(botesYScoops(-3, 27)).toEqual({ botes: 0, scoops: -3, texto: '-3 scoops' })
  })

  it('aguanta medios scoops y números que llegan como texto', () => {
    expect(botesYScoops(27.5, 27).texto).toBe('1 bote + 0.5 scoops')
    expect(botesYScoops('30' as unknown as number, '29' as unknown as number).texto).toBe('1 bote + 1 scoop')
  })
})
