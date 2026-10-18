/**
 * El logo del ticket de caja (el Milo de arriba) en el formato que imprime
 * el agente de caja: raster ESC/POS `GS v 0` de 1 bit.
 *
 * - Cada fila ocupa `ancho / 8` bytes; el bit más alto es el punto de la
 *   izquierda; 1 = negro.
 * - `ancho` va en múltiplos de 8 y a lo más 576 (80 mm a 203 ppp). Si el
 *   raster no cuadra con sus medidas, la impresora lee bytes de más o de
 *   menos y saca basura a media hoja — por eso el servidor lo vuelve a
 *   revisar al guardar.
 *
 * Vive aquí y no en la pantalla para poder probarla sin navegador.
 */

export const LOGO_ANCHO_MAX = 576

/** Ancho válido: múltiplo de 8 entre 8 y 576. */
export function anchoLogo(ancho: number): number {
  const a = Math.round(ancho / 8) * 8
  return Math.min(LOGO_ANCHO_MAX, Math.max(8, a))
}

/**
 * Píxeles RGBA (como los da un canvas) → raster de 1 bit.
 * Lo transparente cuenta como papel (blanco): un PNG de Milo con fondo
 * transparente no debe salir como un rectángulo negro.
 */
export function rgbaAUnBit(rgba: ArrayLike<number>, ancho: number, alto: number, umbral = 170): Uint8Array {
  if (ancho % 8 !== 0) throw new Error('El ancho del logo va en múltiplos de 8.')
  const porFila = ancho / 8
  const sal = new Uint8Array(porFila * alto)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4
      const a = rgba[i + 3] / 255
      // Mezcla con papel blanco según la transparencia, luego luminancia.
      const r = rgba[i] * a + 255 * (1 - a)
      const g = rgba[i + 1] * a + 255 * (1 - a)
      const b = rgba[i + 2] * a + 255 * (1 - a)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      if (lum < umbral) sal[y * porFila + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return sal
}

/** ¿Este punto sale negro? (para pintar la vista previa desde el raster). */
export function puntoNegro(datos: Uint8Array, ancho: number, x: number, y: number): boolean {
  const porFila = ancho / 8
  return (datos[y * porFila + (x >> 3)] & (0x80 >> (x & 7))) !== 0
}

export function bytesABase64(datos: Uint8Array): string {
  let s = ''
  for (let i = 0; i < datos.length; i += 0x8000) {
    s += String.fromCharCode(...datos.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function base64ABytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
