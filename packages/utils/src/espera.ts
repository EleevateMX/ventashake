/**
 * Refrescar una venta apartada contra el catálogo vivo.
 *
 * Vive aquí, y no dentro del kiosko, por lo mismo que `extras.ts`: el POS
 * también aparta ventas, y dos copias de esta regla se separan en cuanto
 * alguien toca una. Lo que decide qué se cae, qué se recalcula y qué se
 * avisa tiene que ser una sola cosa.
 */

/** Lo mínimo que necesita una línea para poder refrescarse. */
export interface LineaRefrescable {
  linea: string
  producto_id: string
  nombre: string
  precio: number
  cantidad: number
  /** Si es un extra, la `linea` del producto al que acompaña. */
  padreLinea?: string | null
}

export interface ProductoVivo {
  id: string
  nombre: string
  precio: number
}

export interface VentaRefrescada<T extends LineaRefrescable> {
  items: T[]
  /** Productos que ya no están a la venta y se cayeron del carrito. */
  desaparecidos: string[]
  /** Los que cambiaron de precio: nombre, lo que decía, lo que cuesta hoy. */
  cambiosDePrecio: Array<{ nombre: string; antes: number; ahora: number }>
}

/**
 * Pone la venta apartada al día antes de retomarla.
 *
 * Hace falta porque **el servidor cobra el precio de hoy**: `fn_crear_orden`
 * recalcula todo desde `productos.precio` y no acepta precios del cliente.
 * Un total en pantalla que no es el que se va a cobrar es peor que no
 * tener la función — el cajero le diría al cliente un número y la terminal
 * pediría otro.
 *
 * Tres reglas, y las tres son por una razón concreta:
 *
 *  1. Un producto que ya no está a la venta **se cae**, en vez de viajar a
 *     una orden que el servidor va a rechazar.
 *  2. Un extra cuyo padre se cayó **se va con él**: un extra huérfano se
 *     seguiría cobrando sin producto que acompañar.
 *  3. Todo lo que se cae **se nombra**. Un producto que desaparece en
 *     silencio es un producto que nadie prepara y nadie cobra.
 */
export function refrescarContraCatalogo<T extends LineaRefrescable>(
  items: T[],
  catalogo: ProductoVivo[],
): VentaRefrescada<T> {
  const porId = new Map(catalogo.map((p) => [p.id, p]))
  const desaparecidos: string[] = []
  const cambiosDePrecio: VentaRefrescada<T>['cambiosDePrecio'] = []

  const vivos = items.filter((i) => {
    if (porId.has(i.producto_id)) return true
    desaparecidos.push(i.nombre)
    return false
  })

  // Regla 2. Se mira contra los PADRES que sobrevivieron, no contra todo
  // lo que quedó: si se comparara contra la lista entera, un extra cuyo
  // padre desapareció seguiría encontrando su `padreLinea` en otro extra
  // y se quedaría colgando de la nada.
  const padresVivos = new Set(vivos.filter((i) => !i.padreLinea).map((i) => i.linea))
  const conPadre = vivos.filter((i) => !i.padreLinea || padresVivos.has(i.padreLinea))
  for (const i of vivos) {
    if (i.padreLinea && !padresVivos.has(i.padreLinea)) desaparecidos.push(i.nombre)
  }

  const refrescados = conPadre.map((i) => {
    const p = porId.get(i.producto_id)!
    if (p.precio !== i.precio) {
      cambiosDePrecio.push({ nombre: p.nombre, antes: i.precio, ahora: p.precio })
    }
    return { ...i, nombre: p.nombre, precio: p.precio }
  })

  return { items: refrescados, desaparecidos, cambiosDePrecio }
}

/** Lo que se va a cobrar hoy por una venta ya refrescada. */
export function totalRefrescado(items: LineaRefrescable[]): number {
  return items.reduce((s, i) => s + i.precio * i.cantidad, 0)
}
