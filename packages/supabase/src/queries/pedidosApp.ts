import type { ShakeClient } from '../client'

/**
 * Pedidos por la app: se paga primero (Clip, en la app) y se pasa a
 * recoger. Nace apagado; gerencia lo prende en Admin → Rewards. Las
 * órdenes son las de siempre (canal 'app'): cocina y la TV de folios las
 * ven igual que una venta de la barra.
 */

type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

export interface ConfigPedidosApp {
  activo: boolean
  whatsapp: boolean
  hora_inicio: string
  hora_fin: string
  minutos_preparacion: number
  mensaje_cerrado: string | null
  abierto_ahora: boolean
}

export type EstadoPedidoApp = 'por_pagar' | 'recibido' | 'preparando' | 'listo' | 'entregado' | 'caducado' | 'cancelado'

export interface PedidoApp {
  id: string
  folio: number
  total: number
  pagado: boolean
  estado: EstadoPedidoApp
  nombre: string | null
  telefono?: string | null
  hora: string
  preparar_a: string | null
  expira_en: string | null
  nota: string | null
  items: string | null
}

export const ETIQUETA_PEDIDO_APP: Record<EstadoPedidoApp, string> = {
  por_pagar: 'Sin pagar',
  recibido: 'Pagado · por preparar',
  preparando: 'Preparando',
  listo: 'Listo · esperando al cliente',
  entregado: 'Entregado',
  caducado: 'Caducó sin pagar',
  cancelado: 'Cancelado',
}

export async function configPedidosApp(sb: ShakeClient): Promise<ConfigPedidosApp> {
  return rpc<ConfigPedidosApp>(sb, 'fn_pedidos_app_config')
}

export async function guardarConfigPedidosApp(sb: ShakeClient, cambios: Partial<ConfigPedidosApp>): Promise<ConfigPedidosApp> {
  return rpc<ConfigPedidosApp>(sb, 'fn_pedidos_app_config_guardar', { p: cambios })
}

export async function pedidosAppEnVivo(sb: ShakeClient): Promise<PedidoAppCaja[]> {
  return (await rpc<PedidoAppCaja[] | null>(sb, 'fn_pedidos_app_en_vivo')) ?? []
}

export async function marcarPedidoAppEntregado(sb: ShakeClient, ordenId: string): Promise<void> {
  await rpc<unknown>(sb, 'fn_pedido_app_entregado', { p_orden_id: ordenId })
}

/**
 * Pedidos de la app vistos desde la caja (17/11/26).
 *
 * Lo de mostrador (barras, latas, snacks) no va a pantalla ni imprime
 * etiqueta, así que un pedido que solo trae eso no le avisaba a nadie. La
 * caja los ve todos con su detalle completo y los entrega con un botón; la
 * entrega queda en `pedidos_app_entregas` y Admin → En vivo se entera solo.
 */
export interface RenglonPedidoApp {
  cantidad: number
  nombre: string
  personalizacion: string | null
  /** «Bebidas», «Alimentos» o «Mostrador». */
  destino: string
  /** true = no tiene comanda: lo toma quien entrega. */
  mostrador: boolean
  extras: { cantidad: number; nombre: string }[]
}

export interface PedidoAppCaja extends PedidoApp {
  renglones: RenglonPedidoApp[]
  /** Cómo va cada parte que sí tiene comanda. */
  partes: { estacion: string; estado: 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado' }[]
  /** Todo lo de barra/cocina está listo (o no hay nada que preparar). */
  puede_entregar: boolean
  entregado_en: string | null
}

export async function pedidosAppParaCaja(sb: ShakeClient): Promise<PedidoAppCaja[]> {
  return (await rpc<PedidoAppCaja[] | null>(sb, 'fn_kiosko_pedidos_app')) ?? []
}

export async function entregarPedidoAppEnCaja(
  sb: ShakeClient, ordenId: string, empleadoId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  return rpc<{ ok: boolean; error?: string }>(sb, 'fn_kiosko_pedido_app_entregar', {
    p_orden_id: ordenId, p_empleado_id: empleadoId,
  })
}
