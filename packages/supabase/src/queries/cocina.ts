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

/** Una parte de la orden: lo que le toca a una estación. */
export interface ParteDeOrden {
  id: string
  estado: EstadoCocina
  cocinas: { slug: string; nombre?: string | null } | null
}

/** Lo que se ve de la otra estación en la tarjeta de ésta. */
export interface OtraParte {
  slug: string
  /** Como se dice en la tienda: «BARRA» y «COCINA», no el nombre técnico. */
  estacion: string
  estado: EstadoCocina
  lista: boolean
}

const NOMBRE_ESTACION: Record<string, string> = { bebidas: 'BARRA', alimentos: 'COCINA' }

/**
 * Las partes de la MISMA orden que se preparan en otra estación.
 *
 * Nació del combo (26/09): la chapata se prepara en cocina y el café en
 * barra, y cada pantalla ve solo lo suyo. Sin decir que existe la otra
 * parte, las dos comandas se leen como pedidos independientes: barra
 * entrega el café, el cliente se va, y la chapata se queda en la barra.
 * Vale igual para cualquier orden con alimento y bebida, no solo combos.
 *
 * La cancelada no cuenta: no hay nada que esperar de ella.
 */
export function otrasPartes(
  pedidoId: string,
  partes: ParteDeOrden[] | null | undefined,
): OtraParte[] {
  return (partes ?? [])
    .filter((p) => p.id !== pedidoId && p.estado !== 'cancelado' && p.cocinas?.slug)
    .map((p) => {
      const slug = p.cocinas!.slug
      return {
        slug,
        estacion: NOMBRE_ESTACION[slug] ?? (p.cocinas?.nombre ?? slug).toUpperCase(),
        estado: p.estado,
        lista: p.estado === 'listo' || p.estado === 'entregado',
      }
    })
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

/**
 * Si la tarjeta es (parte de) un combo: por la categoría del producto, o
 * porque el servidor marcó que el renglón se separó de su combo
 * (`cocina_items.combo_nombre`).
 */
export function esCombo(items: CocinaItemConProducto[]): boolean {
  return items.some(
    (i) => !!i.combo_nombre || /^combos?$/i.test(i.productos?.categorias?.nombre?.trim() ?? ''),
  )
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
  ordenes: {
    folio: number
    canal: string
    nombre_cliente: string | null
    para_llevar: boolean | null
    /** Hora a la que el cliente lo va a recoger. Null = se prepara ya. */
    preparar_a: string | null
    /**
     * Todas las partes de la orden, una por estación (incluida ésta). Es
     * de donde sale «la otra parte se prepara en COCINA · ✓ LISTA».
     * Opcional: si la consulta no lo trae, la tarjeta se pinta como antes.
     */
    pedidos_cocina?: ParteDeOrden[] | null
  } | null
}

/**
 * Lo que piden las pantallas de estación y la de folios. Uno solo para las
 * tres: si una lo pidiera distinto, dejaría de saber de la otra parte.
 */
const SELECT_PEDIDO =
  '*, cocina_items(*, orden_items(padre_item_id), productos(nombre, onzas, categorias(*))), ' +
  'ordenes(folio, canal, nombre_cliente, para_llevar, preparar_a, pedidos_cocina(id, estado, cocinas(slug, nombre)))'

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
    .select(SELECT_PEDIDO)
    .eq('cocina_id', cocina.id)
    .in('estado', ['pendiente', 'en_preparacion', 'listo'])
    .order('created_at')
  if (error) throw error
  // El tipo generado no sigue el embebido ordenes -> pedidos_cocina; la
  // forma real la describe PedidoConItems (y la prueba por HTTP del 26/09).
  return data as unknown as PedidoConItems[]
}

/** Pedidos activos de TODAS las estaciones (cliente-display). */
export async function listarPedidosActivos(sb: ShakeClient): Promise<PedidoConItems[]> {
  const { data, error } = await sb
    .from('pedidos_cocina')
    .select(SELECT_PEDIDO)
    .in('estado', ['pendiente', 'en_preparacion', 'listo'])
    .order('created_at')
  if (error) throw error
  return data as unknown as PedidoConItems[]
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
