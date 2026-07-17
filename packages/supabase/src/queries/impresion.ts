import type { Impresora, ImpresoraInsert, ImpresoraUpdate, TrabajoImpresion, Cocina } from '@shake/types'
import type { ShakeClient } from '../client'

export interface ImpresoraConEstacion extends Impresora {
  cocinas: { nombre: string; slug: string } | null
}

/** Impresoras configuradas (todas — Admin decide cuáles mostrar activas/inactivas). */
export async function listarImpresoras(sb: ShakeClient): Promise<ImpresoraConEstacion[]> {
  const { data, error } = await sb
    .from('impresoras')
    .select('*, cocinas(nombre, slug)')
    .order('nombre')
  if (error) throw error
  return data as ImpresoraConEstacion[]
}

export async function crearImpresora(sb: ShakeClient, datos: ImpresoraInsert): Promise<Impresora> {
  const { data, error } = await sb.from('impresoras').insert(datos).select().single()
  if (error) throw error
  return data
}

export async function actualizarImpresora(
  sb: ShakeClient,
  id: string,
  cambios: ImpresoraUpdate,
): Promise<void> {
  const { error } = await sb.from('impresoras').update(cambios).eq('id', id)
  if (error) throw error
}

/** Estaciones disponibles para asignar impresora (mismo catálogo que Cocina/Barra). */
export async function listarCocinasParaImpresoras(sb: ShakeClient): Promise<Cocina[]> {
  const { data, error } = await sb.from('cocinas').select('*').order('nombre')
  if (error) throw error
  return data
}

/**
 * Estado de conexión derivado de `ultima_conexion`: el agente manda latido
 * cada ~30s (ver agente-impresion/.env.example); si no se ve hace más de
 * 2 minutos, se considera desconectada.
 */
export function impresoraConectada(imp: Impresora, ahoraMs: number = Date.now()): boolean {
  if (!imp.ultima_conexion) return false
  return ahoraMs - new Date(imp.ultima_conexion).getTime() < 2 * 60 * 1000
}

/** Trabajos de impresión de UN pedido de cocina (para el indicador en KDS). */
export async function trabajosDePedido(sb: ShakeClient, pedidoId: string): Promise<TrabajoImpresion[]> {
  const { data, error } = await sb
    .from('trabajos_impresion')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at')
  if (error) throw error
  return data
}

/**
 * Trabajos de impresión de varios pedidos a la vez (para pintar el
 * indicador de estado en toda la grilla del KDS sin hacer N consultas).
 */
export async function trabajosDeVariosPedidos(
  sb: ShakeClient,
  pedidoIds: string[],
): Promise<Record<string, TrabajoImpresion>> {
  if (pedidoIds.length === 0) return {}
  const { data, error } = await sb
    .from('trabajos_impresion')
    .select('*')
    .in('pedido_id', pedidoIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  // El primero por pedido (created_at desc) es el más reciente — refleja
  // reimpresiones si las hubo.
  const porPedido: Record<string, TrabajoImpresion> = {}
  for (const t of data) {
    if (t.pedido_id && !porPedido[t.pedido_id]) porPedido[t.pedido_id] = t
  }
  return porPedido
}

export interface FiltroTrabajosImpresion {
  estado?: TrabajoImpresion['estado'][]
  printerId?: string
  limite?: number
}

/** Cola de impresión completa (Admin), con filtros opcionales. */
export async function listarTrabajosImpresion(
  sb: ShakeClient,
  filtro: FiltroTrabajosImpresion = {},
): Promise<TrabajoImpresion[]> {
  let query = sb.from('trabajos_impresion').select('*').order('created_at', { ascending: false })
  if (filtro.estado && filtro.estado.length > 0) query = query.in('estado', filtro.estado)
  if (filtro.printerId) query = query.eq('printer_id', filtro.printerId)
  query = query.limit(filtro.limite ?? 100)
  const { data, error } = await query
  if (error) throw error
  return data
}

/** Reimprime un trabajo (crea una copia auditada, no reencola el original). */
export async function reimprimirTrabajo(
  sb: ShakeClient,
  trabajoId: string,
  opts: { empleadoId?: string; motivo?: string; printerId?: string } = {},
): Promise<TrabajoImpresion> {
  const { data, error } = await sb.rpc('fn_imprimir_reimprimir', {
    p_trabajo_id: trabajoId,
    p_empleado_id: opts.empleadoId,
    p_motivo: opts.motivo,
    p_printer_id: opts.printerId,
  })
  if (error) throw error
  return data
}

/** Suscripción realtime a la cola de impresión (para Admin/KDS). Devuelve el "desuscribirse". */
export function suscribirTrabajosImpresion(sb: ShakeClient, onCambio: () => void): () => void {
  const canal = sb
    .channel('trabajos-impresion')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos_impresion' }, onCambio)
    .subscribe()
  return () => {
    sb.removeChannel(canal)
  }
}
