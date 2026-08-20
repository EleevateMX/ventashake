import { describe, it, expect } from 'vitest'
import { nombreParaOrdenar } from './catalogo'

describe('nombreParaOrdenar', () => {
  it('quita el "Scoop" para que quepa la marca, el producto y el sabor', () => {
    expect(nombreParaOrdenar('Scoop BIRDMAN - H Balance (Pink Lemonade)'))
      .toBe('BIRDMAN - H Balance (Pink Lemonade)')
    expect(nombreParaOrdenar('Scoop GHOST - Ghost Legend PW (Welchs Grape)'))
      .toBe('GHOST - Ghost Legend PW (Welchs Grape)')
  })

  it('no toca lo que no es un scoop', () => {
    for (const n of ['#1 Choco Killer', 'Coca Cola Zero', 'Vaso con Hielo', 'Kombucha']) {
      expect(nombreParaOrdenar(n)).toBe(n)
    }
  })

  it('no confunde una palabra que empieza con "scoop"', () => {
    // Sin el \s+ del patron, "Scoops variados" quedaria como "s variados".
    expect(nombreParaOrdenar('Scoops variados')).toBe('Scoops variados')
  })

  it('nunca devuelve vacio: un producto sin nombre visible es una tarjeta muerta', () => {
    expect(nombreParaOrdenar('Scoop')).toBe('Scoop')
    expect(nombreParaOrdenar('Scoop   ')).toBe('Scoop   ')
  })

  it('el nombre de la base no cambia: la sincronizacion de costeos empata por ahi', () => {
    const enLaBase = 'Scoop BIRDMAN FALCON - Chocolate'
    nombreParaOrdenar(enLaBase)
    expect(enLaBase).toBe('Scoop BIRDMAN FALCON - Chocolate')
  })
})
