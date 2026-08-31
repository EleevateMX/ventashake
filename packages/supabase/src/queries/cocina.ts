import type { PedidoCocina, CocinaItem, EstadoCocina } from '@shake/types'
import type { ShakeClient } from '../client'

export interface CocinaItemConProducto extends CocinaItem {
  productos: {
    nombre: string
    onzas: number | null
    /**
     * Se pide con `*` y `nombre_singular` va opcional a propósito: así la
     * pantalla no se cae si el código llega a producción antes que la
     * migración que crea esa columna.
     */
    categorias: { nombre: string; nombre_singular?: string | null } | null
  } | null
  /**
   * De qué línea del ticket cuelga esta. Es lo que dice que la creatina es
   * DE ESE shake y no del otro. Opcional por la misma razón de arriba: si
   * la consulta no lo trae, todo se pinta plano como antes.
   */
  orden_items?: { padre_item_id: string | null } | null
}

/** Un producto de la comanda con lo que se le agregó colgando. */
export interface ItemDeComanda<T> {
  item: T
  /** Extras de ESTE producto, ya ordenados como salen en la etiqueta. */
  extras: T[]
}

/**
 * Agrupa los renglones de una comanda: cada producto con SUS extras.
 *
 * En barra se veían planos —"1x Creatina", "1x Proteína", "1x #16 Vanilla
 * Bliss"— como si fueran tres cosas sueltas. Con un shake se adivina; con
 * dos, no hay forma de saber a cuál le va la creatina.
 *
 * Espejo exacto de `fn_items_comanda`, que es lo que ya arma la etiqueta
 * impresa. Incluida la regla que importa: si el padre NO está en esta
 * pantalla (un extra de alimentos colgando de una bebida), el extra sube a
 * renglón propio en vez de desaparecer. Un extra que no se ve es un extra
 * que no se prepara.
 */
export function agruparItemsComanda<T extends CocinaItemConProducto>(
  items: T[],
): ItemDeComanda<T>[] {
  const porOrdenItem = new Map<string, T>()
  for (const it of items) {
    if (it.orden_item_id) porOrdenItem.set(it.orden_item_id, it)
  }

  /**
   * El ancestro visible más alto. Se sube por la cadena y no un solo nivel
   * porque nada impide que un extra cuelgue de otro; sin esto, ese nieto
   * se caería de la pantalla.
   */
  function raizDe(it: T): T | null {
    let actual = it
    const vistos = new Set<string>()
    for (;;) {
      const padreId = actual.orden_items?.padre_item_id ?? null
      if (!padreId) return actual === it ? null : actual
      const padre = porOrdenItem.get(padreId)
      // El padre está en otra estación: este item se queda como raíz.
      if (!padre) return actual === it ? null : actual
      if (padre.id === actual.id || vistos.has(padre.id)) return actual
      vistos.add(actual.id)
      actual = padre
    }
  }

  const grupos: ItemDeComanda<T>[] = []
  const porRaiz = new Map<string, ItemDeComanda<T>>()
  const colocados = new Set<string>()

  const nuevoGrupo = (it: T) => {
    const grupo: ItemDeComanda<T> = { item: it, extras: [] }
    grupos.push(grupo)
    porRaiz.set(it.id, grupo)
    colocados.add(it.id)
  }

  for (const it of items) if (!raizDe(it)) nuevoGrupo(it)
  for (const it of items) {
    const raiz = raizDe(it)
    if (!raiz) continue
    const grupo = porRaiz.get(raiz.id)
    if (grupo) { grupo.extras.push(it); colocados.add(it.id) }
  }

  // Red de seguridad: lo que no encontró dónde colgarse se queda como
  // renglón propio. Un dato raro puede hacer que un extra no encuentre a su
  // padre; que salga solo es feo, que desaparezca de la pantalla es una
  // bebida que nadie prepara.
  for (const it of items) if (!colocados.has(it.id)) nuevoGrupo(it)

  for (const g of grupos) {
    g.extras.sort((a, b) =>
      (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? ''),
    )
  }
  return grupos
}

/**
 * Cómo se nombra un item en la pantalla de cocina.
 *
 * En barra se confundían de bebida: "Lemon Twist" es Hydration, "Lemon
 * Glow" es Collagen y "Lemon Lime" es Amino — con muchas en cola, el sabor
 * solo no alcanza. Cuando la categoría tiene nombre en singular se antepone
 * ("Hydration Drink - Lemon Twist"); si no lo tiene, el nombre va solo,
 * porque un shake no necesita que le digan "Shake -".
 *
 * Vive en el paquete y no en cada app: las dos pantallas de cocina son
 * copias literales una de la otra y duplicar esto garantiza que un día
 * digan cosas distintas.
 */
export function etiquetaItem(item: CocinaItemConProducto): string {
  const nombre = item.productos?.nombre
  if (!nombre) return '—'
  const familia = item.productos?.categorias?.nombre_singular?.trim()
  if (!familia) return nombre
  // Si el producto ya se llama como su familia, no se dice dos veces.
  if (nombre.toLowerCase().startsWith(familia.toLowerCase())) return nombre
  return `${familia} - ${nombre}`
}

export interface PedidoConItems extends PedidoCocina {
  cocina_items: CocinaItemConProducto[]
  ordenes: { folio: number; canal: string; nombre_cliente: string | null; para_llevar: boolean | null } | null
}

/** Pedidos activos de una estación ('alimentos' | 'bebidas'). */
export async function listarPedidosCocina(
  sb: ShakeClient,
  cocinaSlug: string,
): Promise<PedidoConItems[]> {
  const { data: cocina, error: cocinaError } = await sb
    .from('cocinas')
    .select('id')
    .eq('slug', cocinaSlug)
    .single()
  if (cocinaError) throw cocinaError

  const { data, error } = await sb
    .from('pedidos_cocina')
    .select('*, cocina_items(*, orden_items(padre_item_id), productos(nombre, onzas, categorias(*))), ordenes(folio, canal, nombre_cliente, para_llevar)')
    .eq('cocina_id', cocina.id)
    .in('estado', ['pendiente', 'en_preparacion', 'listo'])
    .order('created_at')
  if (error) throw error
  return data as PedidoConItems[]
}

/** Pedidos activos de TODAS las estaciones (cliente-display). */
export async function listarPedidosActivos(sb: ShakeClient): Promise<PedidoConItems[]> {
  const { data, error } = await sb
    .from('pedidos_cocina')
    .select('*, cocina_items(*, orden_items(padre_item_id), productos(nombre, onzas, categorias(*))), ordenes(folio, canal, nombre_cliente, para_llevar)')
    .in('estado', ['pendiente', 'en_preparacion', 'listo'])
    .order('created_at')
  if (error) throw error
  return data as PedidoConItems[]
}

export async function cambiarEstadoPedido(
  sb: ShakeClient,
  pedidoId: string,
  estado: EstadoCocina,
): Promise<void> {
  const { error } = await sb.from('pedidos_cocina').update({ estado }).eq('id', pedidoId)
  if (error) throw error
}

/**
 * Suscripción realtime a los pedidos de una estación.
 * Devuelve la función para desuscribirse.
 */
export function suscribirPedidosCocina(
  sb: ShakeClient,
  onCambio: () => void,
): () => void {
  // El canal en vivo puede morir en silencio (la red parpadea, el socket
  // caduca) y el navegador no avisa a nadie. Si pasa, aquí se vuelve a
  // suscribir solo: una pantalla de cocina congelada es una comanda que
  // nadie prepara mientras el cliente espera en barra.
  let canal: ReturnType<ShakeClient['channel']> | null = null
  let apagado = false
  let reintento: ReturnType<typeof setTimeout> | null = null

  const conectar = () => {
    if (apagado) return
    canal = sb
      .channel('pedidos-cocina')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_cocina' }, onCambio)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cocina_items' }, onCambio)
      .subscribe((estado) => {
        if (apagado) return
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          if (canal) void sb.removeChannel(canal)
          canal = null
          if (reintento) clearTimeout(reintento)
          reintento = setTimeout(conectar, 5000)
        }
      })
  }
  conectar()

  return () => {
    apagado = true
    if (reintento) clearTimeout(reintento)
    if (canal) void sb.removeChannel(canal)
  }
}
