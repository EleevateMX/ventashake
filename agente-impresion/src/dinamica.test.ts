import { afterEach, describe, expect, it } from 'vitest'
import { caracteresPorLinea, generarTSPL, lineaFecha, vistaPrevia } from './tspl.js'
import { etiquetasDeTrabajo } from './etiquetas.js'
import { fijarFrasesParaPrueba } from './frases.js'
import type { TrabajoImpresion } from './types.js'

function trabajo(payload: TrabajoImpresion['payload']): TrabajoImpresion {
  return {
    id: 't1', orden_id: null, pedido_id: null, estacion_id: null, printer_id: null,
    tipo_documento: 'comanda', payload, estado: 'printing', intentos: 0, max_intentos: 1,
    numero_copia: 1, created_at: '2026-10-31T20:30:00Z',
  }
}

const conBoleto = (dinamica: TrabajoImpresion['payload']['dinamica']) => trabajo({
  folio: 9001, estacion: 'Bebidas', creado_en: '2026-10-31T20:30:00Z',
  items: [{ nombre: '#1 Chocokiller', cantidad: 2 }],
  dinamica,
})

afterEach(() => fijarFrasesParaPrueba(null))

describe('Trick or Shake (agente 1.6.0)', () => {
  it('el resultado va en la PRIMERA etiqueta del pedido, con su folio', () => {
    fijarFrasesParaPrueba([{ texto: 'Boo! Feliz Halloween', milo: false }], 'Halloween')
    const [primera, segunda] = etiquetasDeTrabajo(conBoleto({ texto: 'BIG TREAT! Ganaste taza', folio: 'R1-109', milo: true }))
    expect(primera.frase).toBe('BIG TREAT! Ganaste taza')
    expect(primera.milo).toBe(true)
    expect(primera.folioDinamica).toBe('R1-109')
    // La segunda etiqueta sigue con su frase de temporada y sin folio.
    expect(segunda.frase).toBe('Boo! Feliz Halloween')
    expect(segunda.folioDinamica).toBeUndefined()
  })

  it('el folio sale junto a la fecha y cabe en el renglón', () => {
    const [e] = etiquetasDeTrabajo(conBoleto({ texto: 'TRICK! Sigue intentando', folio: 'R1-047' }))
    const linea = lineaFecha(e, caracteresPorLinea('1'))
    expect(linea).toContain('R1-047')
    expect(linea.length).toBeLessThanOrEqual(caracteresPorLinea('1'))
    expect(vistaPrevia(e)).toContain('R1-047')
    expect(generarTSPL(e)).toContain('R1-047')
  })

  it('el texto del resultado se imprime completo, en dos renglones', () => {
    const [e] = etiquetasDeTrabajo(conBoleto({ texto: 'LITTLE TREAT Pide tu premio', folio: 'R2-003' }))
    const v = vistaPrevia(e)
    expect(v).toContain('LITTLE TREAT')
    expect(v).toContain('Pide tu premio')
  })

  it('sin dinámica, nada cambia: frase normal y fecha sola', () => {
    const [e] = etiquetasDeTrabajo(conBoleto(null))
    expect(e.folioDinamica).toBeUndefined()
    expect(lineaFecha(e, caracteresPorLinea('1'))).toBe(e.fecha)
  })

  it('una reimpresión trae el mismo payload: mismo resultado y mismo folio', () => {
    const d = { texto: 'TRICK! Sigue intentando', folio: 'R1-012' }
    const [a] = etiquetasDeTrabajo(conBoleto(d))
    const [b] = etiquetasDeTrabajo({ ...conBoleto(d), numero_copia: 2 })
    expect(b.frase).toBe(a.frase)
    expect(b.folioDinamica).toBe(a.folioDinamica)
  })
})

describe('Un boleto por bebida y frases por estación (agente 1.7.0)', () => {
  const tres = (dinamica: TrabajoImpresion['payload']['dinamica'], estacion = 'Bebidas') => trabajo({
    folio: 9002, estacion, creado_en: '2026-10-31T20:30:00Z',
    items: [{ nombre: '#1 Chocokiller', cantidad: 2 }, { nombre: 'Latte', cantidad: 1 }],
    dinamica,
  })

  it('cada etiqueta lleva SU boleto, en orden', () => {
    const boletos = [
      { texto: 'TRICK! Sigue intentando', folio: 'R1-101' },
      { texto: 'LITTLE TREAT! Pide tu premio', folio: 'R1-102' },
      { texto: 'TRICK! Sigue intentando', folio: 'R1-103' },
    ]
    const es = etiquetasDeTrabajo(tres({ ...boletos[0], boletos }))
    expect(es.map((e) => e.folioDinamica)).toEqual(['R1-101', 'R1-102', 'R1-103'])
    expect(es[1].frase).toBe('LITTLE TREAT! Pide tu premio')
  })

  it('con un boleto por compra (o una base vieja) solo la primera lo lleva', () => {
    fijarFrasesParaPrueba([{ texto: 'Hecho para ti', milo: false }])
    const es = etiquetasDeTrabajo(tres({ texto: 'TRICK! Sigue intentando', folio: 'R1-050' }))
    expect(es.map((e) => e.folioDinamica ?? null)).toEqual(['R1-050', null, null])
    expect(es[1].frase).toBe('Hecho para ti')
  })

  it('las frases salen de la lista de SU estación', () => {
    fijarFrasesParaPrueba([{ texto: 'Hecho para ti', milo: false }], null, {
      Bebidas: [{ texto: 'Dulce o shake', milo: true }],
      Alimentos: [{ texto: 'Buen provecho', milo: false }],
    })
    const [b] = etiquetasDeTrabajo(tres(null, 'Bebidas'))
    const [a] = etiquetasDeTrabajo(tres(null, 'Alimentos'))
    expect(b.frase).toBe('Dulce o shake')
    expect(b.milo).toBe(true)
    expect(a.frase).toBe('Buen provecho')
  })

  it('una lista vacía de esa estación es a propósito: sin frase, sin Milo', () => {
    fijarFrasesParaPrueba([{ texto: 'Hecho para ti', milo: false }], null, { Bebidas: [], Alimentos: [] })
    const [e] = etiquetasDeTrabajo(tres(null, 'Alimentos'))
    expect(e.frase).toBe('')
    expect(e.milo).toBe(false)
    expect(vistaPrevia(e)).not.toContain('Hecho para ti')
    expect(generarTSPL(e)).toContain('PRINT 1,1')
  })

  it('una estación que la base no conoce usa la lista general', () => {
    fijarFrasesParaPrueba([{ texto: 'Hecho para ti', milo: false }], null, { Bebidas: [] })
    const [e] = etiquetasDeTrabajo(tres(null, 'COCINA'))
    expect(e.frase).toBe('Hecho para ti')
  })
})
