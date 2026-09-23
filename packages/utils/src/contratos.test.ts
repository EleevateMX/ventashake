import { describe, it, expect } from 'vitest'
import { llenarContrato, listaDeDias, tratamiento, type DatosDeContrato } from './contratos'

const BASE: DatosDeContrato = {
  genero: 'f',
  nombre: 'Ana Pérez',
  puesto: 'Cajera',
  salarioDiario: 350.5,
  fechaIngreso: '2026-01-15',
  tipoContrato: 'INDETERMINADO',
  jornada: 'De lunes a viernes, 8 horas',
  diasDescanso: [0, 6],
  empresa: 'Shakeaholic',
  lugar: 'Mérida, Yucatán',
  hoy: new Date('2026-09-23T18:00:00Z'),
}

describe('tratamiento', () => {
  it('concuerda en masculino y femenino', () => {
    expect(tratamiento('m')).toEqual({ articulo: 'EL', sustantivo: 'TRABAJADOR' })
    expect(tratamiento('f')).toEqual({ articulo: 'LA', sustantivo: 'TRABAJADORA' })
  })

  it('el neutro no usa diagonal: se firma, no se tacha', () => {
    // "trabajador/a" obliga a tachar una de las dos con pluma en un
    // documento que alguien va a firmar.
    const t = tratamiento('x')
    expect(`${t.articulo} ${t.sustantivo}`).toBe('LA PERSONA TRABAJADORA')
    expect(`${t.articulo} ${t.sustantivo}`).not.toContain('/')
  })
})

describe('listaDeDias', () => {
  it('los escribe como los diría una persona', () => {
    expect(listaDeDias([0])).toBe('domingo')
    expect(listaDeDias([0, 1])).toBe('domingo y lunes')
    expect(listaDeDias([0, 1, 2])).toBe('domingo, lunes y martes')
  })

  it('los ordena y no repite', () => {
    expect(listaDeDias([6, 0, 6])).toBe('domingo y sábado')
  })

  it('sin días no inventa: lo deja a las partes', () => {
    expect(listaDeDias([])).toBe('los que acuerden las partes')
    expect(listaDeDias(null)).toBe('los que acuerden las partes')
  })

  it('ignora un número que no es un día', () => {
    expect(listaDeDias([9, 1])).toBe('lunes')
  })
})

describe('llenarContrato', () => {
  it('sustituye las variables y concuerda en género', () => {
    const { texto, faltantes } = llenarContrato(
      '{{EL_LA}} {{TRABAJADOR}}, {{NOMBRE}}, como {{PUESTO}} por $ {{SALARIO_DIARIO}} diarios.',
      BASE,
    )
    expect(texto).toBe('LA TRABAJADORA, Ana Pérez, como Cajera por $ 350.50 diarios.')
    expect(faltantes).toEqual([])
  })

  it('la fecha no se recorre un día por el huso de Mérida', () => {
    // `new Date('2026-01-15')` se lee como medianoche UTC, que en Mérida
    // (UTC−6) es el 14 a las 18:00. Sin fijar el mediodía, el contrato
    // diría que entró un día antes.
    const { texto } = llenarContrato('Inicia el {{FECHA_INGRESO}}.', BASE)
    expect(texto).toContain('15 de enero de 2026')
  })

  it('escribe los días de descanso en palabras', () => {
    const { texto } = llenarContrato('Descansa {{DIAS_DESCANSO}}.', BASE)
    expect(texto).toBe('Descansa domingo y sábado.')
  })

  it('una variable sin llenar SE REPORTA y se queda a la vista', () => {
    // Borrarla dejaria una linea en blanco donde iba el salario, y eso se
    // firma sin que nadie lo note. Que se vea es el punto.
    const { texto, faltantes } = llenarContrato(
      'Salario: $ {{SALARIO_DIARIO}} · Puesto: {{PUESTO}}',
      { ...BASE, salarioDiario: null, puesto: null },
    )
    expect(faltantes).toEqual(['SALARIO_DIARIO', 'PUESTO'])
    expect(texto).toContain('{{SALARIO_DIARIO}}')
  })

  it('no repite una variable en la lista de faltantes aunque salga dos veces', () => {
    const { faltantes } = llenarContrato('{{PUESTO}} y {{PUESTO}}', { ...BASE, puesto: '' })
    expect(faltantes).toEqual(['PUESTO'])
  })

  it('tolera espacios dentro de las llaves', () => {
    const { texto } = llenarContrato('{{ NOMBRE }}', BASE)
    expect(texto).toBe('Ana Pérez')
  })

  it('una variable que no existe se reporta en vez de desaparecer', () => {
    const { texto, faltantes } = llenarContrato('{{INVENTADA}}', BASE)
    expect(faltantes).toEqual(['INVENTADA'])
    expect(texto).toBe('{{INVENTADA}}')
  })
})
