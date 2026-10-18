import { describe, expect, it } from 'vitest'
import { anchoLogo, rgbaAUnBit, puntoNegro, bytesABase64, base64ABytes } from './logoTicket'

/** Imagen de prueba: una función que dice el color de cada punto. */
function imagen(ancho: number, alto: number, color: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(ancho * alto * 4)
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) d.set(color(x, y), (y * ancho + x) * 4)
  return d
}

describe('logo del ticket a 1 bit', () => {
  it('el ancho siempre queda en múltiplos de 8, de 8 a 576', () => {
    expect(anchoLogo(250)).toBe(248)
    expect(anchoLogo(253)).toBe(256)
    expect(anchoLogo(3)).toBe(8)
    expect(anchoLogo(2000)).toBe(576)
  })

  it('el raster mide exactamente ancho/8 × alto bytes (lo que revisa el servidor)', () => {
    const r = rgbaAUnBit(imagen(16, 5, () => [0, 0, 0, 255]), 16, 5)
    expect(r.length).toBe(2 * 5)
  })

  it('negro es 1 y el bit alto es el punto de la izquierda', () => {
    // Solo el primer punto de cada fila es negro.
    const r = rgbaAUnBit(imagen(8, 2, (x) => (x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255])), 8, 2)
    expect(Array.from(r)).toEqual([0x80, 0x80])
    const r2 = rgbaAUnBit(imagen(8, 1, (x) => (x === 7 ? [0, 0, 0, 255] : [255, 255, 255, 255])), 8, 1)
    expect(Array.from(r2)).toEqual([0x01])
  })

  it('lo transparente es papel, no un rectángulo negro', () => {
    const r = rgbaAUnBit(imagen(8, 1, () => [0, 0, 0, 0]), 8, 1)
    expect(Array.from(r)).toEqual([0])
  })

  it('el umbral decide los grises', () => {
    const gris = imagen(8, 1, () => [150, 150, 150, 255])
    expect(rgbaAUnBit(gris, 8, 1, 170)[0]).toBe(0xff)
    expect(rgbaAUnBit(gris, 8, 1, 120)[0]).toBe(0)
  })

  it('la vista previa lee lo mismo que se imprime, y el base64 va y vuelve', () => {
    const r = rgbaAUnBit(imagen(16, 3, (x, y) => ((x + y) % 3 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255])), 16, 3)
    const vuelta = base64ABytes(bytesABase64(r))
    expect(Array.from(vuelta)).toEqual(Array.from(r))
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) expect(puntoNegro(vuelta, 16, x, y)).toBe((x + y) % 3 === 0)
  })

  it('no se puede pedir un ancho que no sea múltiplo de 8', () => {
    expect(() => rgbaAUnBit(new Uint8ClampedArray(10 * 4), 10, 1)).toThrow()
  })
})
