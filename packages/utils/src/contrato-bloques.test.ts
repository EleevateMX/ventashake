import { describe, it, expect } from 'vitest'
import { contratoABloques } from './contrato-bloques'

describe('contratoABloques — con marcas', () => {
  it('reconoce título, sección y párrafo', () => {
    expect(contratoABloques('# Contrato\n\n## Cláusulas\n\nEsto es un párrafo.')).toEqual([
      { tipo: 'titulo', texto: 'Contrato' },
      { tipo: 'seccion', texto: 'Cláusulas' },
      { tipo: 'parrafo', etiqueta: null, texto: 'Esto es un párrafo.' },
    ])
  })

  it('junta las líneas de un mismo párrafo', () => {
    // Un contrato pegado de un PDF viene con saltos cada 80 caracteres. Si
    // cada renglón fuera un párrafo, el documento saldría en tiras.
    const b = contratoABloques('Las partes acuerdan\nlo siguiente,\nsegún la ley.')
    expect(b).toEqual([
      { tipo: 'parrafo', etiqueta: null, texto: 'Las partes acuerdan lo siguiente, según la ley.' },
    ])
  })

  it('arma la lista y la cierra al llegar otra cosa', () => {
    const b = contratoABloques('- Uno\n- Dos\n\nYa no es lista.')
    expect(b[0]).toEqual({ tipo: 'lista', items: ['Uno', 'Dos'] })
    expect(b[1]).toEqual({ tipo: 'parrafo', etiqueta: null, texto: 'Ya no es lista.' })
  })

  it('lee las firmas con sus partes', () => {
    expect(contratoABloques('[[FIRMAS: Shakeaholic | Ana Pérez]]')).toEqual([
      { tipo: 'firmas', partes: ['Shakeaholic', 'Ana Pérez'] },
    ])
  })

  it('unas firmas sin partes siguen dando dos renglones para firmar', () => {
    expect(contratoABloques('[[FIRMAS]]')).toEqual([{ tipo: 'firmas', partes: ['', ''] }])
  })

  it('la raya separadora no se confunde con una viñeta', () => {
    expect(contratoABloques('---')).toEqual([{ tipo: 'separador' }])
  })
})

describe('contratoABloques — texto pelón del abogado', () => {
  it('una línea corta en mayúsculas sola es un encabezado', () => {
    const b = contratoABloques('DECLARACIONES\n\nEl patrón declara que...')
    expect(b[0]).toEqual({ tipo: 'seccion', texto: 'DECLARACIONES' })
  })

  it('saca la etiqueta de la cláusula para poder resaltarla', () => {
    const b = contratoABloques('PRIMERA.- El trabajador prestará sus servicios.')
    expect(b).toEqual([
      { tipo: 'parrafo', etiqueta: 'PRIMERA', texto: 'El trabajador prestará sus servicios.' },
    ])
  })

  it('reconoce también "CLÁUSULA SEGUNDA:"', () => {
    const b = contratoABloques('CLÁUSULA SEGUNDA: La jornada será de ocho horas.')
    expect((b[0] as { etiqueta: string }).etiqueta).toBe('CLÁUSULA SEGUNDA')
  })

  it('NO se come una palabra en mayúsculas que no es ordinal', () => {
    // "IMPORTANTE:" no es una cláusula, y tratarla como etiqueta borraría
    // la palabra del documento. Ante la duda, párrafo normal.
    const b = contratoABloques('IMPORTANTE: leer todo antes de firmar y guardar copia.')
    expect(b).toEqual([
      {
        tipo: 'parrafo',
        etiqueta: null,
        texto: 'IMPORTANTE: leer todo antes de firmar y guardar copia.',
      },
    ])
  })

  it('una línea en mayúsculas PEGADA a un párrafo no parte el párrafo', () => {
    const b = contratoABloques('El patrón, denominado\nSHAKEAHOLIC\npara efectos de este contrato.')
    expect(b).toHaveLength(1)
    expect((b[0] as { texto: string }).texto).toContain('SHAKEAHOLIC')
  })

  it('una línea larga en mayúsculas es párrafo, no título', () => {
    const larga = 'ESTE ES UN RENGLON MUY LARGO EN MAYUSCULAS QUE CLARAMENTE NO ES UN TITULO SINO TEXTO'
    expect(contratoABloques(larga)[0].tipo).toBe('parrafo')
  })

  it('un texto vacío no truena y no inventa bloques', () => {
    expect(contratoABloques('')).toEqual([])
    expect(contratoABloques('\n\n  \n')).toEqual([])
  })

  it('no pierde ninguna línea con contenido', () => {
    // La prueba que más importa: lo que entra tiene que salir. Un bloque
    // que se pierde en el maquetado es una cláusula que nadie firmó.
    const fuente = '# T\n\nDECLARACIONES\n\nPRIMERA.- Uno.\n\n- a\n- b\n\n---\n\nFin.'
    const salida = JSON.stringify(contratoABloques(fuente))
    for (const palabra of ['T', 'DECLARACIONES', 'Uno.', 'a', 'b', 'Fin.']) {
      expect(salida).toContain(palabra)
    }
  })
})
