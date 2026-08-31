import { describe, it, expect } from 'vitest'
import { agruparItemsComanda, type CocinaItemConProducto } from './cocina'

/** Un renglón de comanda mínimo, con la forma que devuelve la consulta. */
function item(
  id: string,
  nombre: string,
  padre: string | null = null,
): CocinaItemConProducto {
  return {
    id,
    // El id de la línea del ticket coincide con el del renglón: en la vida
    // real son distintos, pero emparejarlos hace las pruebas legibles.
    orden_item_id: id,
    pedido_id: 'p1',
    producto_id: `prod-${id}`,
    cantidad: 1,
    personalizacion: null,
    estado: 'pendiente',
    productos: { nombre, onzas: null, categorias: null },
    orden_items: { padre_item_id: padre },
  } as unknown as CocinaItemConProducto
}

const nombres = (l: CocinaItemConProducto[]) => l.map((i) => i.productos?.nombre)

describe('agruparItemsComanda', () => {
  it('cuelga los extras de su producto', () => {
    const g = agruparItemsComanda([
      item('c', 'Creatina', 'a'),
      item('p', 'Proteína OPTIMUM', 'a'),
      item('a', '#16 Vanilla Bliss'),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].item.productos?.nombre).toBe('#16 Vanilla Bliss')
    expect(nombres(g[0].extras)).toEqual(['Creatina', 'Proteína OPTIMUM'])
  })

  it('con dos shakes, cada uno se queda con lo suyo', () => {
    // Es el caso que motivó todo: plano, no hay forma de saber a cuál shake
    // le va la creatina.
    const g = agruparItemsComanda([
      item('a', '#16 Vanilla Bliss'),
      item('c1', 'Creatina', 'a'),
      item('b', '#1 Choco Killer'),
      item('c2', 'MCT Oil', 'b'),
    ])
    expect(g.map((x) => x.item.productos?.nombre)).toEqual([
      '#16 Vanilla Bliss', '#1 Choco Killer',
    ])
    expect(nombres(g[0].extras)).toEqual(['Creatina'])
    expect(nombres(g[1].extras)).toEqual(['MCT Oil'])
  })

  it('conserva el orden en que venían los productos', () => {
    const g = agruparItemsComanda([
      item('b', 'Segundo'), item('a', 'Primero'), item('x', 'Extra', 'a'),
    ])
    expect(g.map((x) => x.item.productos?.nombre)).toEqual(['Segundo', 'Primero'])
  })

  it('ordena los extras por nombre, igual que la etiqueta', () => {
    const g = agruparItemsComanda([
      item('a', 'Shake'),
      item('z', 'Zinc', 'a'),
      item('c', 'Creatina', 'a'),
      item('m', 'MCT Oil', 'a'),
    ])
    expect(nombres(g[0].extras)).toEqual(['Creatina', 'MCT Oil', 'Zinc'])
  })

  it('un extra cuyo padre está en OTRA estación sube a renglón propio', () => {
    // Sin esto desaparecería de la pantalla, y un extra que no se ve es un
    // extra que no se prepara.
    const g = agruparItemsComanda([item('x', 'Extra Guacamole', 'no-esta-aqui')])
    expect(g).toHaveLength(1)
    expect(g[0].item.productos?.nombre).toBe('Extra Guacamole')
    expect(g[0].extras).toEqual([])
  })

  it('un extra colgado de otro extra llega hasta el producto de arriba', () => {
    const g = agruparItemsComanda([
      item('a', 'Shake'),
      item('b', 'Doble scoop', 'a'),
      item('c', 'Nieto', 'b'),
    ])
    expect(g).toHaveLength(1)
    expect(nombres(g[0].extras)).toEqual(['Doble scoop', 'Nieto'])
  })

  it('sin el dato del padre, todo se pinta plano como antes', () => {
    const sinDato = [item('a', 'Shake'), item('b', 'Creatina')]
      .map((i) => ({ ...i, orden_items: undefined }))
    const g = agruparItemsComanda(sinDato as CocinaItemConProducto[])
    expect(g).toHaveLength(2)
  })

  it('ningun renglon se pierde, ni con una referencia circular', () => {
    // Con datos sanos esto no pasa. Pero si pasara, lo que NO puede ocurrir
    // es que la bebida desaparezca de la pantalla: nadie la prepararía.
    const g = agruparItemsComanda([item('a', 'Uno', 'b'), item('b', 'Dos', 'a')])
    const todos = g.flatMap((x) => [x.item, ...x.extras])
    expect(nombres(todos).sort()).toEqual(['Dos', 'Uno'])
  })

  it('un padre apuntando a si mismo tampoco pierde el renglon', () => {
    const g = agruparItemsComanda([item('a', 'Solo', 'a')])
    expect(g.flatMap((x) => [x.item, ...x.extras])).toHaveLength(1)
  })

  it('una comanda vacía no truena', () => {
    expect(agruparItemsComanda([])).toEqual([])
  })
})
