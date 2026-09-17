import { describe, it, expect } from 'vitest'
import { hoyEnMerida, horaEnMerida, hace } from './fechas'

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
