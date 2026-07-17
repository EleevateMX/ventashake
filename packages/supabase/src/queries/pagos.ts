import type { Orden, ConfiguracionKiosko, ModoPagoKiosko, OrdenAuditoria } from '@shake/types'
import type { ShakeClient } from '../client'

export interface OrdenItemConProducto {
  id: string
  cantidad: number
  precio_unitario: number
  personalizacion: string | null
  productos: { nombre: string } | null
}

export interface OrdenConItems extends Orden {
  orden_items: OrdenItemConProducto[]
}

/** Órdenes de kiosko esperando cobro en caja, con sus items (para la lista de POS). */
export async function listarOrdenesPendientesCajaConItems(
  sb: ShakeClient,
  criterio?: string,
): Promise<OrdenConItems[]> {
  let query = sb
    .from('ordenes')
    .select('*, orden_items(id, cantidad, precio_unitario, personalizacion, productos(nombre))')
    .eq('estado_pago_orden', 'awaiting_counter_payment')
    .order('created_at', { ascending: true })
    .limit(50)

  if (criterio && criterio.trim()) {
    const c = criterio.trim().toUpperCase()
    const folio = Number(c)
    if (!Number.isNaN(folio)) {
      query = query.or(`folio.eq.${folio},codigo_corto.eq.${c}`)
    } else {
      query = query.eq('codigo_corto', c)
    }
  }

  const { data, error } = await query
  if (error) throw error
  return data as OrdenConItems[]
}

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que empleados.ts/ordenes.ts).
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

export interface NuevaOrdenItemCaja {
  producto_id: string
  cantidad: number
  personalizacion?: string | null
}

/**
 * Kiosko, modo "pagar en caja": crea la orden directo en
 * `awaiting_counter_payment`. NO cobra, NO descuenta inventario, NO
 * otorga mancuernas, NO genera pedidos de cocina ni comandas — eso solo
 * ocurre cuando el cajero la cobra desde POS (`cobrarOrden`).
 */
export async function crearOrdenKioskoCaja(
  sb: ShakeClient,
  datos: { sucursalId: string; almacenId: string; clienteId?: string | null; descuento?: number },
  items: NuevaOrdenItemCaja[],
): Promise<Orden> {
  return rpc<Orden>(sb, 'fn_crear_orden_kiosko_caja', {
    p_sucursal_id: datos.sucursalId,
    p_almacen_id: datos.almacenId,
    p_items: items.map((i) => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      personalizacion: i.personalizacion ?? null,
    })),
    p_cliente_id: datos.clienteId ?? null,
    p_descuento: datos.descuento ?? 0,
  })
}

/** POS: busca órdenes de kiosko esperando cobro en caja (folio o código corto). */
export async function buscarOrdenesPendientesCaja(
  sb: ShakeClient,
  criterio?: string,
): Promise<Orden[]> {
  let query = sb
    .from('ordenes')
    .select('*')
    .eq('estado_pago_orden', 'awaiting_counter_payment')
    .order('created_at', { ascending: true })
    .limit(50)

  if (criterio && criterio.trim()) {
    const c = criterio.trim().toUpperCase()
    const folio = Number(c)
    if (!Number.isNaN(folio)) {
      query = query.or(`folio.eq.${folio},codigo_corto.eq.${c}`)
    } else {
      query = query.eq('codigo_corto', c)
    }
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

/** Config de modo de pago del kiosko para una sucursal (fuente de verdad en BD). */
export async function obtenerConfiguracionKiosko(
  sb: ShakeClient,
  sucursalId: string,
): Promise<ConfiguracionKiosko | null> {
  const { data, error } = await sb
    .from('configuracion_kiosko')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listarConfiguracionesKiosko(sb: ShakeClient): Promise<ConfiguracionKiosko[]> {
  const { data, error } = await sb.from('configuracion_kiosko').select('*')
  if (error) throw error
  return data
}

/**
 * Actualiza el modo de pago del kiosko. Si la sucursal está marcada como
 * producción (`sucursales.es_produccion`, default true), la base
 * RECHAZA `modo_pago='demo'` sin importar quién lo pida — no es una
 * validación que se pueda saltar desde el cliente.
 */
export async function actualizarConfiguracionKiosko(
  sb: ShakeClient,
  sucursalId: string,
  modoPago: ModoPagoKiosko,
  opts: { expiraMinutos?: number; clipConfigurado?: boolean } = {},
): Promise<ConfiguracionKiosko> {
  return rpc<ConfiguracionKiosko>(sb, 'fn_actualizar_configuracion_kiosko', {
    p_sucursal_id: sucursalId,
    p_modo_pago: modoPago,
    p_expira_minutos: opts.expiraMinutos ?? null,
    p_clip_configurado: opts.clipConfigurado ?? null,
  })
}

export interface ResultadoReconciliacion {
  orden_id: string
  accion: string
  detalle: string
}

/** Ejecuta la reconciliación de pagos ahora mismo (además del cron de cada minuto). */
export async function reconciliarPagos(sb: ShakeClient): Promise<ResultadoReconciliacion[]> {
  return rpc<ResultadoReconciliacion[]>(sb, 'fn_reconciliar_pagos', {})
}

/** Expira ahora mismo las órdenes de kiosko vencidas (además del cron de cada minuto). */
export async function expirarOrdenesKiosko(sb: ShakeClient): Promise<number> {
  return rpc<number>(sb, 'fn_expirar_ordenes_kiosko', {})
}

export async function listarAuditoriaOrden(sb: ShakeClient, ordenId: string): Promise<OrdenAuditoria[]> {
  const { data, error } = await sb
    .from('ordenes_auditoria')
    .select('*')
    .eq('orden_id', ordenId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Suscripción realtime a una orden específica (kiosko: detecta si el cajero la cobra o expira). */
export function suscribirOrden(sb: ShakeClient, ordenId: string, onCambio: (orden: Orden) => void): () => void {
  const canal = sb
    .channel(`orden-${ordenId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'ordenes', filter: `id=eq.${ordenId}` },
      (payload) => onCambio(payload.new as Orden),
    )
    .subscribe()
  return () => {
    sb.removeChannel(canal)
  }
}

/** Suscripción realtime a órdenes esperando cobro en caja (POS). */
export function suscribirOrdenesPendientesCaja(sb: ShakeClient, onCambio: () => void): () => void {
  const canal = sb
    .channel('ordenes-pendientes-caja')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, onCambio)
    .subscribe()
  return () => {
    sb.removeChannel(canal)
  }
}
