/**
 * Qué observaciones se le ofrecen a UN producto.
 *
 * Los chips ("Sin hielo", "Cambio a césar") nacieron por estación: los de
 * bebidas salían igual en un café que en un shake. Con quince por lado eso
 * ya es una lista que hay que leer, y "Sin plátano" sobre un americano no
 * es solo ruido: es una opción que alguien puede tocar por error y que
 * llega a barra como una instrucción imposible.
 *
 * Gerencia le fija alcance a cada observación desde Admin → Extras, por
 * **categoría** o por **producto**. Los dos, y no uno solo, porque las dos
 * formas existen de verdad: "Sin plátano" aplica a los ~250 shakes (una
 * categoría, un clic) y "Cambio a césar" a cuatro ensaladas. Si solo se
 * pudiera por producto, nadie marcaría 250 casillas y la función quedaría
 * escrita pero sin usar.
 *
 * **La regla de respaldo es la que permite desplegar esto con la tienda
 * abierta**: una observación sin alcance sale en toda su estación, igual
 * que siempre. El día del despliegue no cambia nada; se va acotando una
 * por una, y la que nadie toque se queda como estaba.
 */

/** Lo mínimo que hace falta de una observación para decidir dónde va. */
export interface ObservacionConAlcance {
  texto: string
  orden: number
  cocina_slug: string
  categorias: string[]
  productos: string[]
}

/** Lo mínimo que hace falta del producto. */
export interface ProductoParaObservaciones {
  id: string
  categoria_id: string | null
  /** La estación a la que va su comanda: 'bebidas' | 'alimentos'. */
  cocina_slug: string | null
}

export function observacionesDeProducto(
  todas: ObservacionConAlcance[],
  producto: ProductoParaObservaciones,
): string[] {
  return todas
    .filter((o) => {
      // Primero la estación: una observación de cocina no se ofrece en una
      // bebida por mucho alcance que tenga. El alcance afina dentro de su
      // estación, no salta de una a otra.
      if (producto.cocina_slug && o.cocina_slug !== producto.cocina_slug) return false

      const acotada = o.categorias.length > 0 || o.productos.length > 0
      if (!acotada) return true

      if (producto.categoria_id && o.categorias.includes(producto.categoria_id)) return true
      return o.productos.includes(producto.id)
    })
    .sort((a, b) => a.orden - b.orden || a.texto.localeCompare(b.texto, 'es'))
    .map((o) => o.texto)
}
