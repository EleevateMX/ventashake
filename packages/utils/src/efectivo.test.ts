import { describe, it, expect } from 'vitest'
import {
  CONTEO_VACIO, sumaConteo, ponerPiezas, piezasDe, leerDesglose,
  sugerirFondo, fondoCabeEnConteo, restarConteo, type Conteo,
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

describe('el fondo fijo', () => {
  const conteo = (b: Record<number, number>, m: Record<number, number> = {}): Conteo => ({ billetes: b, monedas: m })

  it('el ejemplo de gerencia: se cuentan $5,534 y se quedan $3,000 exactos', () => {
    const c = conteo({ 1000: 2, 500: 2, 200: 3, 100: 11, 50: 10, 20: 4 }, { 10: 13, 5: 21, 2: 9, 1: 1 })
    expect(sumaConteo(c)).toBe(5534)
    const s = sugerirFondo(c, 3000)
    expect(sumaConteo(s.fondo)).toBe(3000)
    expect(sumaConteo(s.retiro)).toBe(2534)
    expect(s.exacto).toBe(true)
    expect(s.faltante).toBe(0)
    expect(fondoCabeEnConteo(s.fondo, c)).toBe(true)
  })

  it('se retiran los billetes grandes y se quedan las monedas (dan cambio)', () => {
    const c = conteo({ 1000: 2, 500: 2, 100: 10 }, { 10: 20, 5: 20 })
    const s = sugerirFondo(c, 3000)
    expect(sumaConteo(s.fondo)).toBe(3000)
    // Todas las monedas se quedan en el cajón.
    expect(piezasDe(s.fondo, 'monedas', 10)).toBe(20)
    expect(piezasDe(s.fondo, 'monedas', 5)).toBe(20)
    // $4,300 contados: se retiran $1,300 = un billete de $1,000 y tres de $100.
    expect(piezasDe(s.retiro, 'billetes', 1000)).toBe(1)
    expect(piezasDe(s.retiro, 'billetes', 100)).toBe(3)
  })

  it('busca la combinación exacta aunque el atajo no llegue', () => {
    // Retirar $60 con un billete de $50 y tres de $20: el atajo toma el
    // de 50 y se atora; la respuesta buena son los tres de 20.
    const c = conteo({ 50: 1, 20: 3 }, { 1: 0 })
    const s = sugerirFondo(c, 50)
    expect(sumaConteo(s.retiro)).toBe(60)
    expect(piezasDe(s.retiro, 'billetes', 20)).toBe(3)
    expect(s.exacto).toBe(true)
  })

  it('sin forma de llegar exacto, el fondo queda un poco ARRIBA y lo dice', () => {
    const c = conteo({ 1000: 3, 500: 1 })
    const s = sugerirFondo(c, 3200)
    expect(s.exacto).toBe(false)
    expect(sumaConteo(s.fondo)).toBe(3500)
    expect(s.faltante).toBe(0)
  })

  it('si lo contado no alcanza, todo se queda y dice cuánto reponer', () => {
    const c = conteo({ 1000: 2, 500: 1 }, { 10: 5 })
    const s = sugerirFondo(c, 3000)
    expect(sumaConteo(s.fondo)).toBe(2550)
    expect(sumaConteo(s.retiro)).toBe(0)
    expect(s.faltante).toBe(450)
  })

  it('no se puede dejar un billete que no se contó', () => {
    const c = conteo({ 500: 2 })
    expect(fondoCabeEnConteo(conteo({ 500: 2 }), c)).toBe(true)
    expect(fondoCabeEnConteo(conteo({ 500: 3 }), c)).toBe(false)
    expect(fondoCabeEnConteo(conteo({ 1000: 1 }), c)).toBe(false)
    // El billete de $20 no es la moneda de $20.
    expect(fondoCabeEnConteo(conteo({}, { 20: 1 }), conteo({ 20: 1 }))).toBe(false)
  })

  it('restar deja lo que sobra pieza por pieza', () => {
    const r = restarConteo(conteo({ 1000: 2, 500: 2 }, { 10: 3 }), conteo({ 1000: 1 }, { 10: 3 }))
    expect(r).toEqual({ billetes: { 1000: 1, 500: 2 }, monedas: {} })
  })

  it('un cajón grande no tarda (300 monedas)', () => {
    const c = conteo({ 1000: 4, 500: 7, 200: 9, 100: 13, 50: 17, 20: 23 }, { 10: 61, 5: 83, 2: 97, 1: 59 })
    const t0 = Date.now()
    const s = sugerirFondo(c, 3000)
    expect(Date.now() - t0).toBeLessThan(500)
    expect(sumaConteo(s.fondo)).toBe(3000)
  })
})
