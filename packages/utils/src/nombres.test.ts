import { describe, it, expect } from 'vitest'
import { sugerirNombres, mezclarConSemilla, claveNombre } from './nombres'

const LISTA = ['Ana Sofía', 'Andrea', 'Adrián', 'Sol', 'Marisol', 'Ana', 'Sofía Ruiz']

describe('sugerirNombres', () => {
  it('sin nada escrito devuelve la lista como viene (por frecuencia)', () => {
    expect(sugerirNombres(LISTA, '', 3)).toEqual(['Ana Sofía', 'Andrea', 'Adrián'])
  })

  it('ignora acentos', () => {
    expect(sugerirNombres(LISTA, 'adri')).toContain('Adrián')
  })

  it('encuentra por el principio de CUALQUIER palabra', () => {
    // Este es el caso que faltaba: el cajero teclea el segundo nombre y la
    // versión vieja no encontraba nada, así que lo daba de alta otra vez.
    expect(sugerirNombres(LISTA, 'sofia')).toContain('Ana Sofía')
  })

  it('primero lo que empieza igual, después lo que lo contiene', () => {
    const r = sugerirNombres(LISTA, 'sol')
    expect(r.indexOf('Sol')).toBeLessThan(r.indexOf('Marisol'))
  })

  it('no sugiere exactamente lo ya escrito', () => {
    expect(sugerirNombres(LISTA, 'Ana')).not.toContain('Ana')
    expect(sugerirNombres(LISTA, 'Ana')).toContain('Ana Sofía')
  })

  it('respeta el máximo', () => {
    expect(sugerirNombres(LISTA, 'a', 2)).toHaveLength(2)
  })

  it('una lista vacía no truena', () => {
    expect(sugerirNombres([], 'ana')).toEqual([])
  })

  it('encuentra a alguien que está en el fondo de una lista larga', () => {
    // La razón de todo esto: con 660 nombres y un tope de 30, quien no
    // estaba entre los más frecuentes no existía para la barra.
    const larga = [...Array(659).keys()].map((i) => `Cliente ${i}`).concat('Zenaida')
    expect(sugerirNombres(larga, 'zena')).toEqual(['Zenaida'])
  })
})

describe('mezclarConSemilla', () => {
  it('no repite lo que ya se aprendió, aunque cambie el acento', () => {
    expect(mezclarConSemilla(['Adrián'], ['Adrian', 'Beto'])).toEqual(['Adrián', 'Beto'])
  })

  it('los aprendidos van primero', () => {
    expect(mezclarConSemilla(['Zoe'], ['Ana'])).toEqual(['Zoe', 'Ana'])
  })
})

describe('claveNombre', () => {
  it('quita acentos, mayúsculas y espacios de sobra', () => {
    expect(claveNombre('  ÁNGELA  ')).toBe('angela')
  })
})
