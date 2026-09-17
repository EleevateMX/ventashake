import { describe, it, expect } from 'vitest'
import { observacionesDeProducto } from './observaciones'
import type { ObservacionConAlcance, ProductoParaObservaciones } from './observaciones'

const CAT_SHAKES = 'cat-shakes'
const CAT_CAFE = 'cat-cafe'
const CAT_ALIMENTOS = 'cat-alimentos'

const obs = (
  texto: string,
  cocina_slug: string,
  categorias: string[] = [],
  productos: string[] = [],
  orden = 10,
): ObservacionConAlcance => ({ texto, orden, cocina_slug, categorias, productos })

const shake: ProductoParaObservaciones = {
  id: 'p-shake', categoria_id: CAT_SHAKES, cocina_slug: 'bebidas',
}
const cafe: ProductoParaObservaciones = {
  id: 'p-cafe', categoria_id: CAT_CAFE, cocina_slug: 'bebidas',
}
const ensalada: ProductoParaObservaciones = {
  id: 'p-cesar', categoria_id: CAT_ALIMENTOS, cocina_slug: 'alimentos',
}

describe('observacionesDeProducto', () => {
  it('sin alcance sale en toda su estación: el respaldo que deja desplegar sin romper nada', () => {
    const todas = [obs('Sin hielo', 'bebidas'), obs('Sin tomate', 'alimentos')]
    expect(observacionesDeProducto(todas, shake)).toEqual(['Sin hielo'])
    expect(observacionesDeProducto(todas, cafe)).toEqual(['Sin hielo'])
    expect(observacionesDeProducto(todas, ensalada)).toEqual(['Sin tomate'])
  })

  it('acotada por categoría solo sale ahí: "Sin plátano" no aparece en un café', () => {
    const todas = [obs('Sin plátano', 'bebidas', [CAT_SHAKES])]
    expect(observacionesDeProducto(todas, shake)).toEqual(['Sin plátano'])
    expect(observacionesDeProducto(todas, cafe)).toEqual([])
  })

  it('acotada por producto solo sale en ese producto', () => {
    const todas = [obs('Cambio a césar', 'alimentos', [], ['p-cesar'])]
    expect(observacionesDeProducto(todas, ensalada)).toEqual(['Cambio a césar'])
    expect(observacionesDeProducto(
      todas, { id: 'p-wrap', categoria_id: CAT_ALIMENTOS, cocina_slug: 'alimentos' },
    )).toEqual([])
  })

  it('categoría Y producto se suman: basta con empatar uno de los dos', () => {
    const todas = [obs('Frappeado', 'bebidas', [CAT_SHAKES], ['p-cafe'])]
    expect(observacionesDeProducto(todas, shake)).toEqual(['Frappeado'])
    expect(observacionesDeProducto(todas, cafe)).toEqual(['Frappeado'])
    expect(observacionesDeProducto(
      todas, { id: 'p-te', categoria_id: 'cat-tes', cocina_slug: 'bebidas' },
    )).toEqual([])
  })

  it('el alcance explícito le gana a la estación: el caso de los combos', () => {
    // Un combo imprime en Bebidas (va a la barra) pero lleva queso y
    // verdura. Gerencia ató "Sin queso" —de Alimentos— a la categoría
    // Combos a mano, y eso tiene que salir. La primera versión filtraba
    // por estación ANTES de mirar el alcance y las tiraba todas: en el
    // kiosko seguían apareciendo solo las quince de bebidas.
    const combo: ProductoParaObservaciones = {
      id: 'p-combo', categoria_id: 'cat-combos', cocina_slug: 'bebidas',
    }
    const todas = [
      obs('Sin queso', 'alimentos', ['cat-combos']),
      obs('Sin zanahoria', 'alimentos', ['cat-combos']),
      obs('Sin hielo', 'bebidas'),
      // Una de alimentos SIN acotar no debe colarse al combo.
      obs('Sin aderezo', 'alimentos'),
    ]
    expect(observacionesDeProducto(todas, combo))
      .toEqual(['Sin hielo', 'Sin queso', 'Sin zanahoria'])
  })

  it('sin acotar, cada observación se queda en su estación', () => {
    const todas = [obs('Sin hielo', 'bebidas'), obs('Sin tomate', 'alimentos')]
    expect(observacionesDeProducto(todas, shake)).toEqual(['Sin hielo'])
    expect(observacionesDeProducto(todas, ensalada)).toEqual(['Sin tomate'])
  })

  it('acotar a un producto tambien cruza de estación', () => {
    // Mismo principio, por producto en vez de por categoría.
    const todas = [obs('Sin queso', 'alimentos', [], ['p-cafe'])]
    expect(observacionesDeProducto(todas, cafe)).toEqual(['Sin queso'])
  })

  it('un producto sin estación conocida ve todo lo que le aplique por alcance', () => {
    const todas = [obs('Sin hielo', 'bebidas'), obs('Sin tomate', 'alimentos')]
    const raro: ProductoParaObservaciones = { id: 'p-x', categoria_id: null, cocina_slug: null }
    expect(observacionesDeProducto(todas, raro)).toEqual(['Sin hielo', 'Sin tomate'])
  })

  it('respeta el orden de gerencia, y desempata alfabético en español', () => {
    const todas = [
      obs('Sin hielo', 'bebidas', [], [], 30),
      obs('Ácido', 'bebidas', [], [], 10),
      obs('Azúcar', 'bebidas', [], [], 10),
    ]
    expect(observacionesDeProducto(todas, shake)).toEqual(['Ácido', 'Azúcar', 'Sin hielo'])
  })
})
