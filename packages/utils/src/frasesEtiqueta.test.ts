import { describe, it, expect } from 'vitest'
import { limpiarFrase, renglonesFrase, problemaDeFrase } from './frasesEtiqueta'

describe('frases de la etiqueta', () => {
  it('quita acentos y la ñ, como la impresora los necesita', () => {
    expect(limpiarFrase('Día de muertos, año')).toBe('Dia de muertos, ano')
  })

  it('parte en renglones de 14 como el agente', () => {
    expect(renglonesFrase('Shake, train and repeat')).toEqual(['Shake, train', 'and repeat'])
    expect(renglonesFrase('Boo! Feliz Halloween')).toEqual(['Boo! Feliz', 'Halloween'])
  })

  it('dice por qué no cabe', () => {
    expect(problemaDeFrase('Boo! Feliz Halloween')).toBeNull()
    expect(problemaDeFrase('Feliz Halloween, campeon')).toMatch(/3 renglones/)
    expect(problemaDeFrase('Supercalifragilistico')).toMatch(/no cabe en un renglón/)
    expect(problemaDeFrase('Día')).toMatch(/acentos/)
    expect(problemaDeFrase('  ')).toMatch(/Escribe/)
  })

  it('las 21 de siempre caben (las mismas que siembra la base)', () => {
    for (const f of ['Buen dia!', 'Shake, train and repeat', 'Tu unico rival: ayer', 'Nacido para entrenar', 'Proteina y actitud']) {
      expect(problemaDeFrase(f), f).toBeNull()
    }
  })
})
