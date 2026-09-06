import { describe, it, expect } from 'vitest'
import {
  CONTEO_VACIO, sumaConteo, ponerPiezas, piezasDe, leerDesglose,
} from './efectivo'

describe('conteo de efectivo', () => {
  it('el billete de $20 y la moneda de $20 se cuentan aparte', () => {
    // Este es EL caso. Antes las dos filas escribían la misma casilla y
    // la segunda borraba a la primera: 15 billetes + 10 monedas daban
    // $200 en vez de $500.
    let c = CONTEO_VACIO
    c = ponerPiezas(c, 'billetes', 20, 15)
    c = ponerPiezas(c, 'monedas', 20, 10)
    expect(piezasDe(c, 'billetes', 20)).toBe(15)
    expect(piezasDe(c, 'monedas', 20)).toBe(10)
    expect(sumaConteo(c)).toBe(500)
  })

  it('contar monedas no borra los billetes de la misma cifra', () => {
    let c = ponerPiezas(CONTEO_VACIO, 'billetes', 20, 15)
    expect(sumaConteo(c)).toBe(300)
    c = ponerPiezas(c, 'monedas', 20, 1)
    expect(piezasDe(c, 'billetes', 20)).toBe(15)
    expect(sumaConteo(c)).toBe(320)
  })

  it('suma el ejemplo que pidió el cliente', () => {
    // 1000×0, 500×0, 200×2, 100×1, 50×1, 20×15 · monedas 20×10, 10×15
    let c = CONTEO_VACIO
    for (const [den, n] of [[1000, 0], [500, 0], [200, 2], [100, 1], [50, 1], [20, 15]]) {
      c = ponerPiezas(c, 'billetes', den, n)
    }
    c = ponerPiezas(c, 'monedas', 20, 10)
    c = ponerPiezas(c, 'monedas', 10, 15)
    expect(sumaConteo(c)).toBe(400 + 100 + 50 + 300 + 200 + 150)
    expect(sumaConteo(c)).toBe(1200)
  })

  it('no acepta piezas negativas', () => {
    const c = ponerPiezas(CONTEO_VACIO, 'billetes', 500, -3)
    expect(piezasDe(c, 'billetes', 500)).toBe(0)
    expect(sumaConteo(c)).toBe(0)
  })

  it('un conteo vacío suma cero y no revienta', () => {
    expect(sumaConteo(CONTEO_VACIO)).toBe(0)
    expect(sumaConteo(null)).toBe(0)
    expect(sumaConteo(undefined)).toBe(0)
  })
})

describe('leerDesglose', () => {
  it('lee la forma nueva tal cual, sin marcarla ambigua', () => {
    const d = leerDesglose({ billetes: { 200: 2, 20: 15 }, monedas: { 20: 10, 10: 5 } })!
    expect(d.total).toBe(400 + 300 + 200 + 50)
    expect(d.ambiguo).toBe(false)
  })

  it('lee la forma vieja y avisa de que el 20 no es de fiar', () => {
    // Un corte guardado entre el 2 y el 6 de septiembre.
    const d = leerDesglose({ '1': 53, '2': 32, '5': 32, '10': 42, '20': 4, '50': 15, '100': 2, '200': 6 })!
    expect(d.total).toBe(53 + 64 + 160 + 420 + 80 + 750 + 200 + 1200)
    expect(d.total).toBe(2927) // el fondo_inicial que quedó guardado ese día
    expect(d.ambiguo).toBe(true)
  })

  it('la forma vieja sin veintes no es ambigua: no hay nada que confundir', () => {
    const d = leerDesglose({ '10': 1, '500': 1, '1000': 3 })!
    expect(d.total).toBe(3510)
    expect(d.ambiguo).toBe(false)
  })

  it('un 20 en cero tampoco es ambiguo', () => {
    const d = leerDesglose({ '20': 0, '100': 1 })!
    expect(d.ambiguo).toBe(false)
  })

  it('reparte las denominaciones viejas por especie', () => {
    const d = leerDesglose({ '1000': 1, '50': 2, '5': 3, '1': 4 })!
    expect(d.billetes).toEqual({ 1000: 1, 50: 2 })
    expect(d.monedas).toEqual({ 5: 3, 1: 4 })
  })

  it('devuelve null cuando no hay desglose', () => {
    expect(leerDesglose(null)).toBeNull()
    expect(leerDesglose(undefined)).toBeNull()
    expect(leerDesglose('lo que sea')).toBeNull()
  })

  it('ignora basura sin tirar el resto del renglón', () => {
    const d = leerDesglose({ '200': 2, 'nota': 'algo', '-5': 9 })!
    expect(d.total).toBe(400)
  })
})
