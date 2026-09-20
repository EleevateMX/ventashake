import { describe, it, expect } from 'vitest'
import {
  claseExtra, esBase, esProteina, esGalleta, esDobleScoop,
  ordenarBases, baseDeCasa, opcionDeGrupo, grupoEsOpcional, extraDisponible, notaDeBase, baseCobrada,
  type OpcionExtra,
  dobleScoopDe,
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

describe('opcionDeGrupo', () => {
  it('la marcada, si la hay', () => {
    expect(opcionDeGrupo([op('Frío'), op('Caliente', { por_defecto: true })])?.nombre).toBe('Caliente')
  })

  it('sin marca y todas sin costo, la primera — el combo ya viene pagado', () => {
    expect(opcionDeGrupo([op('Frío'), op('Caliente')])?.nombre).toBe('Frío')
  })

  it('sin marca y alguna cuesta, NINGUNA: el kiosko no cobra lo que nadie eligió', () => {
    const preparados = [op('Preparado: Açaí Dream', { precio: 56 }), op('Preparado: Mr. Nutty', { precio: 56 })]
    expect(opcionDeGrupo(preparados)).toBeNull()
    expect(grupoEsOpcional(preparados)).toBe(true)
  })

  it('la estrella le gana al precio: si alguien decidió, se respeta', () => {
    const conMarca = [op('Chico', { precio: 0 }), op('Grande', { precio: 10, por_defecto: true })]
    expect(opcionDeGrupo(conMarca)?.nombre).toBe('Grande')
    expect(grupoEsOpcional(conMarca)).toBe(false)
  })

  it('un grupo gratis no se puede dejar vacío', () => {
    expect(grupoEsOpcional([op('Frío'), op('Caliente')])).toBe(false)
  })
})

describe('extraDisponible', () => {
  it('sin acotar, siempre — como nacieron todos', () => {
    expect(extraDisponible({}, [])).toBe(true)
    expect(extraDisponible({ requiere_grupo: null }, [])).toBe(true)
    expect(extraDisponible({ requiere_grupo: '  ' }, [])).toBe(true)
  })

  it('la galleta aparece solo cuando ya hay preparado', () => {
    const galleta = { requiere_grupo: 'Preparado' }
    expect(extraDisponible(galleta, [])).toBe(false)
    expect(extraDisponible(galleta, ['Preparado'])).toBe(true)
  })

  it('otro grupo elegido no la habilita', () => {
    expect(extraDisponible({ requiere_grupo: 'Preparado' }, ['Café', 'Muffin'])).toBe(false)
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

describe('dobleScoopDe', () => {
  const d = (nombre: string, precio: number, marca: string | null) => ({ nombre, precio, marca })

  it('empata por marca, no por nombre', () => {
    const dobles = [
      d('Doble scoop - BIRDMAN FALCON', 35, 'BIRDMAN FALCON'),
      d('Doble scoop - BIRDMAN FALCON PERFORMANCE', 39, 'BIRDMAN FALCON PERFORMANCE'),
    ]
    const elegida = d('Proteína BIRDMAN FALCON - Fresa', 0, 'BIRDMAN FALCON')
    expect(dobleScoopDe(dobles, elegida)?.precio).toBe(35)
  })

  it('con UN solo doble scoop lo usa: es el caso de proteína fija', () => {
    const dobles = [d('Doble Scoop de Proteína', 45, null)]
    expect(dobleScoopDe(dobles, d('Proteína ISO 100 - Churro', 0, null))?.precio).toBe(45)
    expect(dobleScoopDe(dobles, null)?.precio).toBe(45)
  })

  it('NO cobra el más barato cuando la marca no empata: el bug de El Clásico', () => {
    // La proteína llegó sin `marca` (Admin -> Extras no la escribía), y la
    // versión vieja agarraba "el primero sin marca" — GHOST, $39— aunque
    // el cliente hubiera elegido Sascha, que son $49.
    const dobles = [
      d('Doble scoop - GHOST', 39, null),
      d('Doble scoop - ISO 100', 45, 'ISO 100'),
      d('Doble scoop - SASCHA FITNESS', 49, null),
    ]
    const sinMarca = d('Proteína SASCHA FITNESS - Chocolate', 0, null)
    expect(dobleScoopDe(dobles, sinMarca)).toBeNull()
  })

  it('con la marca puesta sí encuentra el suyo aunque haya varios', () => {
    const dobles = [
      d('Doble scoop - GHOST', 39, 'GHOST'),
      d('Doble scoop - ISO 100', 45, 'ISO 100'),
      d('Doble scoop - SASCHA FITNESS', 49, 'SASCHA FITNESS'),
    ]
    expect(dobleScoopDe(dobles, d('Proteína ISO 100 - Churro', 0, 'ISO 100'))?.precio).toBe(45)
    expect(dobleScoopDe(dobles, d('Proteína SASCHA FITNESS - Vainilla', 0, 'SASCHA FITNESS'))?.precio).toBe(49)
  })

  it('sin dobles ofrecidos, no hay nada que elegir', () => {
    expect(dobleScoopDe([], d('Proteína OPTIMUM - Vainilla', 0, 'OPTIMUM'))).toBeNull()
  })
})
