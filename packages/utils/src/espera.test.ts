import { describe, it, expect } from 'vitest'
import { refrescarContraCatalogo, totalRefrescado, type LineaRefrescable } from './espera'

const shake = (over: Partial<LineaRefrescable> = {}): LineaRefrescable => ({
  linea: 'L1', producto_id: 'p-shake', nombre: 'Chocokiller', precio: 100, cantidad: 1, ...over,
})
const extra = (over: Partial<LineaRefrescable> = {}): LineaRefrescable => ({
  linea: 'L2', producto_id: 'p-creatina', nombre: 'Creatina', precio: 25, cantidad: 1,
  padreLinea: 'L1', ...over,
})

const CAT = [
  { id: 'p-shake', nombre: 'Chocokiller', precio: 100 },
  { id: 'p-creatina', nombre: 'Creatina', precio: 25 },
]

describe('refrescarContraCatalogo', () => {
  it('deja la venta igual cuando nada cambió', () => {
    const r = refrescarContraCatalogo([shake(), extra()], CAT)
    expect(r.items).toHaveLength(2)
    expect(r.desaparecidos).toEqual([])
    expect(r.cambiosDePrecio).toEqual([])
  })

  it('toma el precio de hoy, que es el que va a cobrar el servidor', () => {
    const r = refrescarContraCatalogo([shake()], [{ ...CAT[0], precio: 115 }])
    expect(r.items[0].precio).toBe(115)
    expect(r.cambiosDePrecio).toEqual([{ nombre: 'Chocokiller', antes: 100, ahora: 115 }])
  })

  it('adopta el nombre nuevo si el producto se renombró', () => {
    const r = refrescarContraCatalogo([shake()], [{ ...CAT[0], nombre: 'Choco Killer' }])
    expect(r.items[0].nombre).toBe('Choco Killer')
    // Renombrar no es cambiar de precio: no debe avisar de un cambio que
    // no hubo, o el aviso se vuelve ruido y se deja de leer.
    expect(r.cambiosDePrecio).toEqual([])
  })

  it('tira lo que ya no está a la venta, y lo nombra', () => {
    const r = refrescarContraCatalogo([shake()], [])
    expect(r.items).toEqual([])
    expect(r.desaparecidos).toEqual(['Chocokiller'])
  })

  it('se lleva al extra cuando su producto padre se cayó', () => {
    // Este es el caso que importa: la creatina SIGUE en el catálogo, pero
    // el shake del que colgaba no. Cobrarla sola sería cobrar un extra sin
    // producto que acompañar.
    const r = refrescarContraCatalogo([shake(), extra()], [CAT[1]])
    expect(r.items).toEqual([])
    expect(r.desaparecidos).toEqual(['Chocokiller', 'Creatina'])
  })

  it('no deja a un extra colgando de otro extra', () => {
    // Dos extras del mismo shake. Si el padre desaparece, los DOS se van:
    // comparar contra "lo que quedó" en vez de contra los padres vivos
    // dejaría al segundo creyendo que su padre sigue ahí.
    const otro = extra({ linea: 'L3', producto_id: 'p-creatina', nombre: 'Creatina 2' })
    const r = refrescarContraCatalogo([shake(), extra(), otro], [CAT[1]])
    expect(r.items).toEqual([])
    expect(r.desaparecidos).toHaveLength(3)
  })

  it('conserva al extra mientras su padre siga vivo', () => {
    const r = refrescarContraCatalogo([shake(), extra()], CAT)
    expect(r.items.map((i) => i.linea)).toEqual(['L1', 'L2'])
  })

  it('no inventa un padre para una línea suelta', () => {
    // Un extra cuyo padreLinea no existe en la venta (dato viejo o a
    // medias) no debe sobrevivir por accidente.
    const huerfano = extra({ padreLinea: 'no-existe' })
    const r = refrescarContraCatalogo([huerfano], CAT)
    expect(r.items).toEqual([])
    expect(r.desaparecidos).toEqual(['Creatina'])
  })

  it('respeta la cantidad al recalcular el total', () => {
    const r = refrescarContraCatalogo([shake({ cantidad: 3 }), extra({ cantidad: 3 })], CAT)
    expect(totalRefrescado(r.items)).toBe(375)
  })

  it('aguanta un carrito vacío sin romperse', () => {
    const r = refrescarContraCatalogo([], CAT)
    expect(r.items).toEqual([])
    expect(r.desaparecidos).toEqual([])
  })
})
