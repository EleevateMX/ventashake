import type { PedidoCocina, CocinaItem, EstadoCocina } from '@shake/types'
import type { ShakeClient } from '../client'

export interface PedidoConItems extends PedidoCocina {
  cocina_items: CocinaItem[]
  ordenes: { folio: number; canal: string } | null
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
    .select('*, cocina_items(*), ordenes(folio, canal)')
    .eq('cocina_id', cocina.id)
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
  const canal = sb
    .channel('pedidos-cocina')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_cocina' }, onCambio)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cocina_items' }, onCambio)
    .subscribe()
  return () => {
    sb.removeChannel(canal)
  }
}
