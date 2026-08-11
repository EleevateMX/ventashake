import type { EtiquetaComanda } from './tspl.js'
import type { ItemComanda, PayloadComanda, TrabajoImpresion } from './types.js'

/**
 * Convierte UN trabajo de la cola en las etiquetas que hay que imprimir.
 *
 * La regla central: **una etiqueta por unidad, no por línea de pedido**. Si
 * alguien pide dos shakes iguales salen dos etiquetas, porque en barra cada
 * etiqueta se pega a un vaso. El contador "n de N" abarca todo el trabajo, así
 * que quien prepara sabe cuántas piezas van en total y si le falta alguna.
 */

/** `dd/MM HH:mm` — lo que cabe en el pie de la etiqueta. */
export function formatearFecha(iso: string | undefined, ahora: Date = new Date()): string {
  const d = iso ? new Date(iso) : ahora
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${mi}`
}

/**
 * Reparte una `personalizacion` de texto libre en los campos de la etiqueta.
 *
 * Hoy la base guarda todo junto en una sola columna de texto: el kiosko
 * escribe ahí el tipo de leche, y caja puede escribir lo que sea. Esto lo
 * separa por lo que dice cada fragmento, sin inventar nada — lo que no
 * reconoce cae en `notas`, que también se imprime. Nunca se pierde texto.
 *
 * Cuando el trabajo ya trae los campos por separado (ver `ItemComanda`), esta
 * función ni se llama: manda lo estructurado.
 */
export function repartirPersonalizacion(texto: string | null | undefined): {
  tamano: string | null
  proteina: string | null
  leche: string | null
  extras: string[]
  notas: string | null
} {
  const salida = {
    tamano: null as string | null,
    proteina: null as string | null,
    leche: null as string | null,
    extras: [] as string[],
    notas: null as string | null,
  }
  if (!texto?.trim()) return salida

  const sueltos: string[] = []
  for (const bruto of texto.split(/[,;·\n|]+/)) {
    const f = bruto.trim()
    if (!f) continue

    if (/^\d+\s*oz\b/i.test(f)) { salida.tamano ??= f; continue }
    if (/^leche\b/i.test(f)) { salida.leche ??= f.replace(/^leche\s*/i, '').trim() || f; continue }
    if (/^prote[ií]na\b/i.test(f)) { salida.proteina ??= f.replace(/^prote[ií]na\s*/i, '').trim() || f; continue }
    // Una petición se reconoce por cómo empieza: quitar, agregar o moderar.
    if (/^(sin|con|extra|mas|más|poco|poca|menos)\b/i.test(f)) { salida.extras.push(f); continue }
    sueltos.push(f)
  }

  if (sueltos.length > 0) salida.notas = sueltos.join(' ')
  return salida
}

/** Campos estructurados si vienen; si no, lo que se pueda deducir del texto. */
function camposDe(item: ItemComanda): Pick<EtiquetaComanda, 'tamano' | 'proteina' | 'leche' | 'extras' | 'notas'> {
  const yaVieneSeparado =
    item.tamano != null || item.proteina != null || item.leche != null ||
    item.extras != null || item.notas != null

  if (yaVieneSeparado) {
    return {
      tamano: item.tamano ?? null,
      proteina: item.proteina ?? null,
      leche: item.leche ?? null,
      extras: item.extras ?? [],
      notas: item.notas ?? null,
    }
  }
  return repartirPersonalizacion(item.personalizacion)
}

/**
 * Las etiquetas de un trabajo, ya numeradas.
 *
 * @param numeroDeCopia >1 marca la etiqueta como reimpresión, para que en
 *        barra nadie prepare dos veces lo mismo.
 */
export function etiquetasDeTrabajo(trabajo: TrabajoImpresion, numeroDeCopia = 1): EtiquetaComanda[] {
  const p: PayloadComanda = trabajo.payload
  const items = p.items ?? []
  const fecha = formatearFecha(p.creado_en)
  const ticket = String(p.folio ?? p.ticket ?? '—')
  const destino = p.estacion ?? 'COCINA'

  // Sin cliente identificado el folio hace de nombre: algo grande y legible
  // tiene que ir ahí o la etiqueta no sirve para repartir.
  const nombre = p.cliente?.trim() || p.nombre?.trim() || `#${ticket}`

  const total = items.reduce((s, i) => s + Math.max(1, i.cantidad || 1), 0)

  const etiquetas: EtiquetaComanda[] = []
  let n = 0
  for (const item of items) {
    const campos = camposDe(item)
    for (let u = 0; u < Math.max(1, item.cantidad || 1); u++) {
      n++
      etiquetas.push({
        destino,
        ticket,
        item: n,
        deTotal: total,
        nombre,
        producto: item.nombre ?? '(producto sin nombre)',
        fecha,
        copia: Math.max(numeroDeCopia, trabajo.numero_copia ?? 1),
        ...campos,
      })
    }
  }

  return etiquetas
}
