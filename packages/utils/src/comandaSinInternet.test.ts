import { describe, it, expect } from 'vitest'
import { comandasSinInternet, folioSinInternet, type ItemParaComanda } from './comandaSinInternet'

const datos = { ticket: 'S-03', creadoEn: '2026-10-08T03:15:00Z', cajero: 'Luna', cliente: ' Ana ', paraLlevar: true }

describe('comandasSinInternet', () => {
  it('un shake con su proteína va a barra con el extra colgando', () => {
    const items: ItemParaComanda[] = [
      { linea: 'a', nombre: '#1 Chocokiller', cantidad: 1, estacion: 'bebidas', personalizacion: 'Leche Entera' },
      { linea: 'b', padreLinea: 'a', nombre: 'Proteína ISO 100 - Churro', cantidad: 1, estacion: 'bebidas' },
    ]
    const c = comandasSinInternet(items, datos)
    expect(c).toHaveLength(1)
    expect(c[0].slug).toBe('bebidas')
    expect(c[0].payload.estacion).toBe('Bebidas')
    expect(c[0].payload.cliente).toBe('Ana')
    expect(c[0].payload.items).toEqual([
      { cantidad: 1, nombre: '#1 Chocokiller', personalizacion: 'Leche Entera', extras: [{ nombre: 'Proteína ISO 100 - Churro', cantidad: 1 }] },
    ])
  })

  it('un pedido mixto sale en las dos estaciones', () => {
    const c = comandasSinInternet([
      { linea: 'a', nombre: 'Latte', cantidad: 1, estacion: 'bebidas' },
      { linea: 'b', nombre: 'Wrap de pollo', cantidad: 2, estacion: 'alimentos' },
    ], datos)
    expect(c.map((x) => x.slug)).toEqual(['bebidas', 'alimentos'])
    expect(c[1].payload.items[0]).toMatchObject({ nombre: 'Wrap de pollo', cantidad: 2 })
  })

  it('el café del combo va a barra marcado COMBO y la galleta se queda con el combo', () => {
    const c = comandasSinInternet([
      { linea: 'a', nombre: "Milo's Chapata-Americano Combo", cantidad: 1, estacion: 'alimentos' },
      { linea: 'b', padreLinea: 'a', nombre: 'Americano Helado', cantidad: 1, estacion: 'bebidas', estacionVinculo: 'bebidas' },
      { linea: 'c', padreLinea: 'a', nombre: 'Galleta: Macadamia', cantidad: 1, estacion: 'bebidas' },
    ], datos)
    const cocina = c.find((x) => x.slug === 'alimentos')!
    const barra = c.find((x) => x.slug === 'bebidas')!
    expect(cocina.payload.items[0].extras).toEqual([{ nombre: 'Galleta: Macadamia', cantidad: 1 }])
    expect(barra.payload.items).toEqual([{ cantidad: 1, nombre: 'Americano Helado', personalizacion: 'COMBO', extras: [] }])
  })

  it('un extra sin vínculo sigue a su producto aunque su categoría sea de otra estación', () => {
    const c = comandasSinInternet([
      { linea: 'a', nombre: 'Wrap', cantidad: 1, estacion: 'alimentos' },
      { linea: 'b', padreLinea: 'a', nombre: 'Chipotle', cantidad: 1, estacion: 'bebidas' },
    ], datos)
    expect(c).toHaveLength(1)
    expect(c[0].slug).toBe('alimentos')
    expect(c[0].payload.items[0].extras).toEqual([{ nombre: 'Chipotle', cantidad: 1 }])
  })

  it('lo que no va a pantalla no gasta etiqueta', () => {
    const c = comandasSinInternet([
      { linea: 'a', nombre: 'Monster', cantidad: 1, estacion: 'bebidas', vaAPantalla: false },
    ], datos)
    expect(c).toEqual([])
  })

  it('un extra cuyo producto ya no está sube a renglón propio', () => {
    const c = comandasSinInternet([
      { linea: 'b', padreLinea: 'zzz', nombre: 'Creatina', cantidad: 1, estacion: 'bebidas' },
    ], datos)
    expect(c[0].payload.items[0].nombre).toBe('Creatina')
  })
})

describe('folioSinInternet', () => {
  it('dos dígitos con S delante', () => {
    expect(folioSinInternet(3)).toBe('S-03')
    expect(folioSinInternet(112)).toBe('S-112')
    expect(folioSinInternet(0)).toBe('S-01')
  })
})
