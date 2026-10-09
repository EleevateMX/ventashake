// Genera agente-impresion/src/milo.ts: Milo como mapa de bits de 1 bit para
// la orden BITMAP de TSPL, ya ROTADO igual que el texto de la etiqueta.
//
// Se corre a mano solo si cambia el dibujo (necesita Chromium/Playwright):
//   node scripts/generar-milo-tspl.mjs
//
// Por qué rotado: el texto de la etiqueta va con TEXT ... 90, o sea que la
// "cabeza" de cada letra apunta a +X y se lee hacia +Y. Para que Milo salga
// parado junto a la frase, su arriba también tiene que apuntar a +X.
//
// En TSPL cada byte son 8 puntos a lo largo de X y un bit en 0 IMPRIME
// (negro); en 1 deja blanco. Si el papel sale con Milo en negativo, es este
// bit: se invierte `NEGRO` y se vuelve a generar.
/* global Image, document, Buffer */
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEN = path.join(RAIZ, 'apps/kiosko/public/milo-transparent.png')
const DESTINO = path.join(RAIZ, 'agente-impresion/src/milo.ts')
/** Lo más que puede medir Milo en la etiqueta, en puntos (8 = 1 mm). */
const MAX_X = 88 // a lo largo de la etiqueta (su "alto" una vez rotado)
const MAX_Y = 88 // a lo ancho de la etiqueta
const NEGRO = 0
/** Más oscuro que esto (0-255) es contorno; el relleno de Milo es claro. */
const UMBRAL = Number(process.env.UMBRAL || 200)
/** Qué parte de un bloque tiene que ser contorno para pintar ese punto. */
const CUBRE = Number(process.env.CUBRE || 0.25)

;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch())
  const p = await b.newPage()
  const datos = 'data:image/png;base64,' + fs.readFileSync(ORIGEN).toString('base64')
  const r = await p.evaluate(async ({ datos, MAX_X, MAX_Y, UMBRAL, CUBRE }) => {
    const img = new Image()
    img.src = datos
    await img.decode()
    // Se lee a resolución completa y luego se reduce por bloques: reducir la
    // imagen primero borra las líneas finas del contorno (sale una mancha).
    const W = img.width, H = img.height
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, W, H).data
    // Tinta = el contorno: la parte opaca más oscura que el relleno claro.
    const tintaGrande = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) {
      const a = px[i * 4 + 3]
      const lum = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
      tintaGrande[i] = a > 100 && lum < UMBRAL ? 1 : 0
    }
    // Milo parado: su alto va a X, su ancho a Y.
    const escala = Math.min(MAX_X / H, MAX_Y / W)
    const alto = Math.round(H * escala)
    const ancho = Math.round(W * escala)
    const tinta = []
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const x0 = Math.floor(x / escala), x1 = Math.max(x0 + 1, Math.floor((x + 1) / escala))
        const y0 = Math.floor(y / escala), y1 = Math.max(y0 + 1, Math.floor((y + 1) / escala))
        let n = 0, t = 0
        for (let yy = y0; yy < y1 && yy < H; yy++) for (let xx = x0; xx < x1 && xx < W; xx++) { n++; t += tintaGrande[yy * W + xx] }
        tinta.push(n && t / n >= CUBRE ? 1 : 0)
      }
    }
    return { ancho, alto, tinta }
  }, { datos, MAX_X, MAX_Y, UMBRAL, CUBRE })
  await b.close()

  // Renglones del BITMAP = a lo largo de Y (una por columna de la imagen);
  // bits de cada renglón = a lo largo de X (de abajo hacia arriba de Milo).
  const anchoBytes = Math.ceil(r.alto / 8)
  const filas = r.ancho
  const bytes = Buffer.alloc(anchoBytes * filas, NEGRO === 0 ? 0xff : 0x00)
  for (let col = 0; col < r.ancho; col++) {
    for (let fila = 0; fila < r.alto; fila++) {
      if (!r.tinta[fila * r.ancho + col]) continue
      const bitX = r.alto - 1 - fila // la cabeza de Milo hacia +X
      const i = col * anchoBytes + (bitX >> 3)
      const mascara = 0x80 >> (bitX & 7)
      bytes[i] = NEGRO === 0 ? bytes[i] & ~mascara : bytes[i] | mascara
    }
  }
  const salida = `// GENERADO por scripts/generar-milo-tspl.mjs — no se edita a mano.
//
// Milo para la orden BITMAP de TSPL, ya rotado como el texto de la
// etiqueta (su cabeza hacia +X). ${anchoBytes} bytes por renglón (${anchoBytes * 8} puntos
// a lo largo de la etiqueta), ${filas} renglones (a lo ancho). Bit en 0 = negro.
export const MILO = {
  /** Bytes por renglón: el largo de Milo sobre el eje X, en múltiplos de 8 puntos. */
  anchoBytes: ${anchoBytes},
  /** Renglones: lo que ocupa sobre el eje Y, en puntos. */
  alto: ${filas},
  /** Puntos que ocupa a lo largo de la etiqueta (eje X). */
  largoX: ${anchoBytes * 8},
  datos: '${bytes.toString('base64')}',
} as const
`
  fs.writeFileSync(DESTINO, salida)
  // Vista en la consola para revisar que salió Milo y no una mancha.
  for (let fila = 0; fila < r.alto; fila += 2) {
    let s = ''
    for (let col = 0; col < r.ancho; col += 1) s += r.tinta[fila * r.ancho + col] ? '#' : ' '
    console.log(s)
  }
  console.log(`Escrito ${path.relative(RAIZ, DESTINO)}: ${r.ancho}x${r.alto} -> ${anchoBytes} bytes x ${filas}`)
})().catch((e) => { console.error(e); process.exit(1) })
