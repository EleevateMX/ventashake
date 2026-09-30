import { describe, it, expect } from 'vitest'
import { diasAntesEnMerida, hoyEnMerida, horaEnMerida, hace, periodoEnMerida } from './fechas'

describe('hoyEnMerida', () => {
  it('a las 18:30 locales sigue siendo el MISMO día, aunque en UTC ya sea mañana', () => {
    // 2026-09-18T00:30:00Z = 17 de septiembre, 18:30 en Mérida (UTC−6).
    // Era el bug: el Dashboard preguntaba por el 18 y la vista solo tenía
    // el 17, así que "Ventas de hoy" mostraba $0 desde las 6 de la tarde.
    const t = new Date('2026-09-18T00:30:00Z')
    expect(t.toISOString().slice(0, 10)).toBe('2026-09-18') // lo que hacía antes
    expect(hoyEnMerida(t)).toBe('2026-09-17')               // lo correcto
  })

  it('a las 23:59 locales todavía es el mismo día', () => {
    expect(hoyEnMerida(new Date('2026-09-18T05:59:00Z'))).toBe('2026-09-17')
  })

  it('a las 00:01 locales ya cambió', () => {
    expect(hoyEnMerida(new Date('2026-09-18T06:01:00Z'))).toBe('2026-09-18')
  })

  it('en la mañana coincide con UTC, que es por lo que el bug no se notaba', () => {
    const t = new Date('2026-09-17T15:00:00Z') // 9:00 en Mérida
    expect(hoyEnMerida(t)).toBe(t.toISOString().slice(0, 10))
  })
})

describe('horaEnMerida', () => {
  it('da la hora local de la tienda, no la del navegador', () => {
    expect(horaEnMerida(new Date('2026-09-18T00:30:00Z'))).toBe('18:30')
  })
})

describe('hace', () => {
  const ahora = new Date('2026-09-17T12:00:00Z')
  it('segundos', () => {
    expect(hace(new Date('2026-09-17T11:59:57Z'), ahora)).toBe('hace 3 s')
  })
  it('minutos', () => {
    expect(hace(new Date('2026-09-17T11:58:00Z'), ahora)).toBe('hace 2 min')
  })
  it('horas', () => {
    expect(hace(new Date('2026-09-17T10:00:00Z'), ahora)).toBe('hace 2 h')
  })
  it('nunca negativo: un reloj adelantado no debe decir "hace -4 s"', () => {
    expect(hace(new Date('2026-09-17T12:00:04Z'), ahora)).toBe('hace 0 s')
  })
})

describe('horaEnMerida con basura', () => {
  it('no lanza con una fecha invalida: esto corre al guardar una venta apartada', () => {
    // Un `guardadaEn` corrupto en localStorage no debe impedir que el
    // cajero aparte una cuenta.
    expect(() => horaEnMerida(new Date('no es fecha'))).not.toThrow()
    expect(horaEnMerida(new Date('no es fecha'))).toBe('')
  })
})

describe('diasAntesEnMerida', () => {
  it('resta días sobre el día de Mérida, no sobre el de UTC', () => {
    // 01:30 UTC del 18 es todavía el 17 en Mérida (UTC−6).
    const madrugada = new Date('2026-09-18T01:30:00Z')
    expect(diasAntesEnMerida(0, madrugada)).toBe('2026-09-17')
    expect(diasAntesEnMerida(7, madrugada)).toBe('2026-09-10')
  })

  it('cruza el cambio de mes sin inventar días', () => {
    expect(diasAntesEnMerida(1, new Date('2026-10-01T18:00:00Z'))).toBe('2026-09-30')
  })

  it('cruza el cambio de año', () => {
    expect(diasAntesEnMerida(1, new Date('2027-01-01T18:00:00Z'))).toBe('2026-12-31')
  })

  it('no se recorre un día por el anclaje de la hora', () => {
    // Si se anclara a medianoche UTC en vez de mediodía, esto daría el 29.
    expect(diasAntesEnMerida(30, new Date('2026-09-30T18:00:00Z'))).toBe('2026-08-31')
  })
})

describe('periodoEnMerida', () => {
  // Martes 30/09/2026 a las 20:00 de Mérida = 02:00Z del 1/10: el "hoy"
  // de UTC ya es octubre, el de la tienda sigue en septiembre.
  const noche = new Date('2026-10-01T02:00:00Z')

  it('la semana va de lunes a domingo, en el día de Mérida', () => {
    expect(periodoEnMerida('semana', 0, noche)).toMatchObject({ desde: '2026-09-28', hasta: '2026-10-04' })
    expect(periodoEnMerida('semana', 1, noche)).toMatchObject({ desde: '2026-09-21', hasta: '2026-09-27' })
  })

  it('un domingo pertenece a la semana que empezó el lunes anterior', () => {
    const domingo = new Date('2026-09-27T18:00:00Z')
    expect(periodoEnMerida('semana', 0, domingo)).toMatchObject({ desde: '2026-09-21', hasta: '2026-09-27' })
  })

  it('el mes es el de Mérida, y retrocede cruzando el año', () => {
    expect(periodoEnMerida('mes', 0, noche)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30', etiqueta: 'Septiembre 2026' })
    expect(periodoEnMerida('mes', 9, noche)).toMatchObject({ desde: '2025-12-01', hasta: '2025-12-31' })
    expect(periodoEnMerida('mes', 7, noche)).toMatchObject({ desde: '2026-02-01', hasta: '2026-02-28' })
  })

  it('el año completo', () => {
    expect(periodoEnMerida('anio', 1, noche)).toEqual({ desde: '2025-01-01', hasta: '2025-12-31', etiqueta: '2025' })
  })
})
