import { describe, it, expect } from 'vitest'
import {
  claseExtra, esBase, esProteina, esGalleta, esDobleScoop,
  ordenarBases, baseDeCasa, opcionDeCasa, notaDeBase, baseCobrada,
  type OpcionExtra,
} from './extras'

const op = (nombre: string, extra: Partial<OpcionExtra> = {}): OpcionExtra => ({
  extra_id: nombre, nombre, precio: 0, grupo: null, ...extra,
})

describe('clasificar', () => {
  it('reconoce las bases', () => {
    for (const n of ['Leche Entera', 'Leche de Coco', 'Agua', 'Agua Mineral - Topo Chico', 'Sin leche'])
      expect(esBase(n)).toBe(true)
    expect(esBase('Aguacate extra')).toBe(false)
  })

  it('reconoce proteínas, galletas y doble scoop', () => {
    expect(esProteina('Proteína OPTIMUM - Chocolate')).toBe(true)
    expect(esProteina('Proteina CBUM - Churro')).toBe(true)
    expect(esGalleta('2 Galletas L&L Cremes (Mixto)')).toBe(true)
    expect(esDobleScoop('Doble scoop - CBUM')).toBe(true)
  })

  it('el nombre manda sobre el grupo', () => {
    // Algunas proteínas traen grupo 'proteina' escrito y otras no; sin esta
    // regla la misma proteína caería en dos clases según el producto.
    expect(claseExtra('Proteína ISO 100 - Vainilla', 'proteina')).toBe('proteina')
    expect(claseExtra('Proteína ISO 100 - Vainilla', null)).toBe('proteina')
    expect(claseExtra('Leche Entera', 'Café')).toBe('base')
  })

  it('agrupa por el grupo cuando el nombre no dice nada', () => {
    expect(claseExtra('Americano Caliente', 'Café')).toBe('g:Café')
    expect(claseExtra('Americano Caliente', '  Café  ')).toBe('g:Café')
  })

  it('deja sin clase lo que no tiene "de casa"', () => {
    expect(claseExtra('Extra Guacamole', null)).toBeNull()
    expect(claseExtra('Extra Guacamole', '')).toBeNull()
    // Que no lleve galleta es una respuesta válida: no hay default.
    expect(claseExtra('2 Galletas L&L Cremes (Mixto)', 'galletas')).toBeNull()
  })
})

describe('ordenarBases', () => {
  it('pone el agua y la entera antes que las vegetales', () => {
    const orden = ordenarBases([
      op('Leche de Almendras'), op('Leche Deslactosada'), op('Agua'),
      op('Leche Entera'), op('Sin leche'),
    ]).map((b) => b.nombre)
    expect(orden).toEqual([
      'Agua', 'Leche Entera', 'Leche Deslactosada', 'Leche de Almendras', 'Sin leche',
    ])
  })

  it('una leche nueva se va al final sin romper el resto', () => {
    const orden = ordenarBases([op('Leche de Pistache'), op('Leche Entera')]).map((b) => b.nombre)
    expect(orden).toEqual(['Leche Entera', 'Leche de Pistache'])
  })
})

describe('baseDeCasa', () => {
  const leches = [op('Leche Entera'), op('Leche Deslactosada'), op('Leche de Avena')]

  it('respeta lo marcado en Admin por encima de todo', () => {
    const conMarca = [op('Leche Entera'), op('Leche Deslactosada', { por_defecto: true })]
    expect(baseDeCasa(conMarca)?.nombre).toBe('Leche Deslactosada')
  })

  it('sin marca, se comporta como antes: la entera', () => {
    expect(baseDeCasa(leches)?.nombre).toBe('Leche Entera')
  })

  it('sin entera, la deslactosada — pero no la light', () => {
    expect(baseDeCasa([op('Leche Deslactosada Light'), op('Leche Deslactosada')])?.nombre)
      .toBe('Leche Deslactosada')
  })

  it('"Sin leche" gana cuando el producto la ofrece', () => {
    expect(baseDeCasa([op('Leche Entera'), op('Sin leche')])?.nombre).toBe('Sin leche')
  })

  it('pero la marca de Admin le gana también a "Sin leche"', () => {
    expect(baseDeCasa([op('Sin leche'), op('Leche Entera', { por_defecto: true })])?.nombre)
      .toBe('Leche Entera')
  })

  it('sin bases no inventa ninguna', () => {
    expect(baseDeCasa([])).toBeNull()
  })
})

describe('opcionDeCasa', () => {
  it('la marcada, si la hay', () => {
    expect(opcionDeCasa([op('Frío'), op('Caliente', { por_defecto: true })])?.nombre).toBe('Caliente')
  })
  it('si no, la primera — la misma que se ve marcada en pantalla', () => {
    expect(opcionDeCasa([op('Frío'), op('Caliente')])?.nombre).toBe('Frío')
  })
})

describe('notaDeBase', () => {
  it('escribe la base aunque sea la de casa', () => {
    expect(notaDeBase(op('Leche Deslactosada'))).toBe('Leche Deslactosada')
  })
  it('"Sin leche" no deja nota', () => {
    expect(notaDeBase(op('Sin leche'))).toBeNull()
  })
  it('una base con precio no va de nota: va cobrada', () => {
    const cara = op('Agua Mineral - Topo Chico', { precio: 10 })
    expect(notaDeBase(cara)).toBeNull()
    expect(baseCobrada(cara)?.nombre).toBe('Agua Mineral - Topo Chico')
  })
  it('una base gratis no se cobra', () => {
    expect(baseCobrada(op('Leche Entera'))).toBeNull()
  })
  it('sin base, no hay nota', () => {
    expect(notaDeBase(null)).toBeNull()
  })
})
