import { describe, it, expect } from 'vitest'
import { urgenciaComanda, UMBRAL_MINUTOS, vasoDeItem, estadoProgramado, horaDeEntrega } from './comandas'

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

describe('vasoDeItem', () => {
  const oz = (n: number | null) => ({ productos: { onzas: n } })

  it('sin extras, es el vaso del producto', () => {
    expect(vasoDeItem(oz(16), [])).toBe(16)
  })

  it('un extra puede SUBIR el vaso', () => {
    // El Clásico (16 oz) con un Preparado (20 oz) es un signature: va en el
    // vaso grande. La pantalla decía 16 y el shake no cabía.
    expect(vasoDeItem(oz(16), [oz(20)])).toBe(20)
  })

  it('un extra NO puede bajar el vaso', () => {
    expect(vasoDeItem(oz(20), [oz(12)])).toBe(20)
  })

  it('ignora los extras sin tamaño, que son casi todos', () => {
    expect(vasoDeItem(oz(16), [oz(null), oz(null)])).toBe(16)
  })

  it('si nadie tiene tamaño, no inventa uno', () => {
    // Mejor no decir nada que mandar a barra por un vaso equivocado.
    expect(vasoDeItem(oz(null), [oz(null)])).toBeNull()
  })

  it('un producto sin tamaño hereda el del extra', () => {
    expect(vasoDeItem(oz(null), [oz(20)])).toBe(20)
  })
})

describe('estadoProgramado', () => {
  const ahora = new Date('2026-09-23T02:00:00Z').getTime()
  const enMin = (m: number) => new Date(ahora + m * 60000).toISOString()

  it('sin hora, es una comanda normal', () => {
    expect(estadoProgramado(null, ahora)).toBe('ninguna')
    expect(estadoProgramado(undefined, ahora)).toBe('ninguna')
  })

  it('falta mucho: programada, para que NO se prepare todavía', () => {
    expect(estadoProgramado(enMin(45), ahora)).toBe('programada')
  })

  it('ya casi es hora: se comporta como comanda nueva', () => {
    expect(estadoProgramado(enMin(5), ahora)).toBe('es_hora')
  })

  it('la hora ya pasó: sigue siendo "es_hora", no desaparece', () => {
    // Que se le haya pasado la hora es justo cuando MÁS tiene que verse.
    expect(estadoProgramado(enMin(-30), ahora)).toBe('es_hora')
  })

  it('una fecha ilegible se trata como comanda normal', () => {
    // El camino que no pierde pedidos: ante un dato roto, se prepara.
    expect(estadoProgramado('no es una fecha', ahora)).toBe('ninguna')
  })
})

describe('horaDeEntrega', () => {
  it('la escribe como la diría el cliente, en hora de Mérida', () => {
    // 02:30 UTC son las 20:30 del día anterior en Mérida (UTC−6).
    expect(horaDeEntrega('2026-09-24T02:30:00Z')).toBe('8:30 P.M.')
  })

  it('sin hora no inventa texto', () => {
    expect(horaDeEntrega(null)).toBe('')
    expect(horaDeEntrega('cualquier cosa')).toBe('')
  })
})
