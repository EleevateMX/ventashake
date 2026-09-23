import type { VentaDiaria, ProductoVendido, Orden } from '@shake/types'
import type { ShakeClient } from '../client'

/** Ventas por día (vw_ventas_diarias), últimos N días. */
export async function ventasDiarias(
  sb: ShakeClient,
  diasAtras = 30,
  sucursalId?: string,
): Promise<VentaDiaria[]> {
  const desde = new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10)
  let q = sb.from('vw_ventas_diarias').select('*').gte('dia', desde).order('dia', { ascending: true })
  if (sucursalId) q = q.eq('sucursal_id', sucursalId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function productosMasVendidos(
  sb: ShakeClient,
  limite = 10,
): Promise<ProductoVendido[]> {
  const { data, error } = await sb.from('vw_productos_mas_vendidos').select('*').limit(limite)
  if (error) throw error
  return data
}

/** Órdenes pagadas recientes de una sucursal (para dashboard/admin). */
export async function ordenesRecientes(
  sb: ShakeClient,
  sucursalId: string,
  horas = 8,
): Promise<Orden[]> {
  const desde = new Date(Date.now() - horas * 3600000).toISOString()
  const { data, error } = await sb
    .from('ordenes')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .eq('pagado', true)
    .neq('estado', 'cancelada')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

/** Una fila del reporte de unidades vendidas. */
export interface ProductoEnPeriodo {
  producto_id: string
  producto: string
  categoria: string | null
  piezas: number
  importe: number
  tickets: number
  /** De esas piezas, cuántas venían colgadas de otro producto. */
  piezas_como_extra: number
}

/**
 * Cuántas piezas de cada producto se vendieron entre dos fechas.
 *
 * Las fechas son **días de Mérida**, no instantes UTC: el servidor agrupa
 * por `at time zone 'America/Merida'`, así que hay que mandarle el día que
 * ve el negocio (`hoyEnMerida()`), no el que calcula el navegador.
 */
export async function productosVendidos(
  sb: ShakeClient,
  desde: string,
  hasta: string,
  texto?: string,
): Promise<ProductoEnPeriodo[]> {
  type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  const { data, error } = await (sb.rpc as unknown as RpcFn)('fn_productos_vendidos', {
    p_desde: desde,
    p_hasta: hasta,
    p_texto: texto?.trim() || null,
  })
  if (error) throw error
  return ((data ?? []) as ProductoEnPeriodo[]).map((f) => ({
    ...f,
    piezas: Number(f.piezas),
    importe: Number(f.importe),
    piezas_como_extra: Number(f.piezas_como_extra),
  }))
}

// ------------------------- cancelar una venta -------------------------
//
// Cancelar NO recalcula el corte del dia original: ese turno se arqueo
// contra el efectivo que habia en el cajon esa noche, y reescribirlo hoy
// dejaria un arqueo que ya no cuadra contra nada. Lo que queda es el
// reverso, con su fecha y su motivo. Ver la migracion
// `cancelar_una_venta_de_cualquier_dia_con_bitacora.sql`.

type RpcRep = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpcRep = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as RpcRep)(fn, args)
  if (error) throw error
  return data as T
}

export interface VentaBuscada {
  id: string
  folio: number
  created_at: string
  total: number
  pagado: boolean
  estado: string
  metodo_pago: string | null
  nombre_cliente: string | null
  cobro: string | null
  cancelada: boolean
}

/** Busca ventas de CUALQUIER dia, por folio o por nombre. */
export async function buscarVentas(
  sb: ShakeClient,
  texto?: string,
  desde?: string,
  hasta?: string,
): Promise<VentaBuscada[]> {
  const filas = await rpcRep<VentaBuscada[]>(sb, 'fn_buscar_ventas', {
    p_texto: texto?.trim() || null,
    p_desde: desde || null,
    p_hasta: hasta || null,
    p_limite: 200,
  })
  return (filas ?? []).map((v) => ({ ...v, total: Number(v.total) }))
}

/** Cancela una venta. El motivo es obligatorio: lo exige el servidor. */
export const cancelarVenta = (sb: ShakeClient, ordenId: string, motivo: string) =>
  rpcRep<string>(sb, 'fn_cancelar_venta', { p_orden_id: ordenId, p_motivo: motivo })

export interface VentaCancelada {
  id: string
  orden_id: string
  folio: number | null
  fecha_venta: string
  total_cancelado: number
  estaba_pagada: boolean
  metodo_pago: string | null
  motivo: string
  quien: string | null
  cancelada_en: string
}

/** La bitacora. No se edita ni se borra: lo impone un trigger. */
export async function cancelaciones(sb: ShakeClient, dias = 90): Promise<VentaCancelada[]> {
  const filas = await rpcRep<VentaCancelada[]>(sb, 'fn_cancelaciones', { p_dias: dias })
  return (filas ?? []).map((v) => ({ ...v, total_cancelado: Number(v.total_cancelado) }))
}
