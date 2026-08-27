import { describe, it, expect } from 'vitest'
import { urgenciaComanda, UMBRAL_MINUTOS } from './comandas'

const AHORA = new Date('2026-08-26T12:00:00Z').getTime()
const haceMinutos = (m: number) => new Date(AHORA - m * 60000).toISOString()

describe('urgenciaComanda', () => {
  it('una comanda sin activar siempre está "nueva", por vieja que sea', () => {
    expect(urgenciaComanda('pendiente', haceMinutos(0), AHORA, 3)).toBe('nueva')
    expect(urgenciaComanda('pendiente', haceMinutos(40), AHORA, 3)).toBe('nueva')
  })

  it('el reloj del rojo corre desde que se activó, no desde que llegó', () => {
    // Recién activada: a tiempo aunque el pedido sea de hace rato.
    expect(urgenciaComanda('en_preparacion', haceMinutos(0), AHORA, 3)).toBe('a_tiempo')
    expect(urgenciaComanda('en_preparacion', haceMinutos(2.9), AHORA, 3)).toBe('a_tiempo')
  })

  it('se pone tarde justo al cumplirse el umbral', () => {
    expect(urgenciaComanda('en_preparacion', haceMinutos(3), AHORA, 3)).toBe('tarde')
    expect(urgenciaComanda('en_preparacion', haceMinutos(10), AHORA, 3)).toBe('tarde')
  })

  it('cada estación tiene su propio minutero', () => {
    const cuatro = haceMinutos(4)
    expect(urgenciaComanda('en_preparacion', cuatro, AHORA, UMBRAL_MINUTOS.bebidas)).toBe('tarde')
    expect(urgenciaComanda('en_preparacion', cuatro, AHORA, UMBRAL_MINUTOS.alimentos)).toBe('a_tiempo')
  })

  it('lo que ya está listo o entregado no urge', () => {
    expect(urgenciaComanda('listo', haceMinutos(60), AHORA, 3)).toBe('a_tiempo')
    expect(urgenciaComanda('entregado', haceMinutos(60), AHORA, 3)).toBe('a_tiempo')
  })

  it('un dato roto no pinta la pantalla de rojo', () => {
    expect(urgenciaComanda('en_preparacion', null, AHORA, 3)).toBe('a_tiempo')
    expect(urgenciaComanda('en_preparacion', 'no es fecha', AHORA, 3)).toBe('a_tiempo')
  })
})
