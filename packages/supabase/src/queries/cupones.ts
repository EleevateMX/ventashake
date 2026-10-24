import type { ShakeClient } from '../client'

/**
 * Cupones de descuento con PIN (24/10/26, `cupones_con_pin.sql`).
 *
 * Dos pasos, como se piden en la caja:
 *   1. `autorizarCupon`: el PIN de quien puede (la misma lista que las
 *      cortesías) se revisa al elegir el cupón y deja una autorización que
 *      vive 20 minutos.
 *   2. `aplicarCupon`: ya creada la orden y ANTES de cobrar, la consume. El
 *      servidor calcula el descuento sobre lo que vale ese shake y baja el
 *      total. La pantalla nunca manda un precio ni un descuento.
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpc = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as Rpc)(fn, args)
  if (error) throw error
  return data as T
}

export interface CuponVigente {
  id: string
  nombre: string
  tipo: 'monto' | 'porcentaje'
  valor: number
  familia: string
  /** Los productos (base, no extras) a los que aplica. */
  productos: string[]
}

export async function cuponesVigentes(sb: ShakeClient): Promise<CuponVigente[]> {
  const r = (await rpc<CuponVigente[] | null>(sb, 'fn_cupones_vigentes')) ?? []
  return r.map((c) => ({ ...c, valor: Number(c.valor) }))
}

export interface CuponAutorizado {
  autorizacion_id: string
  autorizo: string
  cupon_id: string
  nombre: string
  tipo: 'monto' | 'porcentaje'
  valor: number
}

/** Revisa el PIN. Un PIN que no puede autorizar se contesta como error. */
export async function autorizarCupon(
  sb: ShakeClient,
  pin: string,
  cuponId: string,
  productoId: string,
): Promise<CuponAutorizado> {
  const r = await rpc<(CuponAutorizado & { ok?: boolean; error?: string })>(sb, 'fn_cupon_autorizar', {
    p_pin: pin, p_cupon_id: cuponId, p_producto_id: productoId,
  })
  if (r.ok === false) throw new Error(r.error ?? 'El PIN no autorizó el cupón.')
  return { ...r, valor: Number(r.valor) }
}

export interface CuponAplicado {
  descuento: number
  base: number
  nombre: string
  total_a_pagar: number
}

export async function aplicarCupon(sb: ShakeClient, ordenId: string, autorizacionId: string): Promise<CuponAplicado> {
  const r = await rpc<CuponAplicado>(sb, 'fn_cupon_aplicar', {
    p_orden_id: ordenId, p_autorizacion_id: autorizacionId,
  })
  return { ...r, descuento: Number(r.descuento), base: Number(r.base), total_a_pagar: Number(r.total_a_pagar) }
}

// ── Admin (gerencia) ─────────────────────────────────────────────────────

export interface CuponDado {
  creado_en: string
  folio: number
  cupon: string
  producto: string
  /** Lo que valía el shake con sus extras. */
  base: number
  descuento: number
  /** Lo que pagó el cliente por toda la venta. */
  pago: number
  autorizo: string
  cajero: string | null
}

export async function cuponesAplicados(sb: ShakeClient, desde: string, hasta: string): Promise<CuponDado[]> {
  const f = (await rpc<CuponDado[] | null>(sb, 'fn_cupones_aplicados', { p_desde: desde, p_hasta: hasta })) ?? []
  return f.map((c) => ({ ...c, base: Number(c.base), descuento: Number(c.descuento), pago: Number(c.pago) }))
}

export interface CuponTipo {
  id: string
  nombre: string
  tipo: 'monto' | 'porcentaje'
  valor: number
  familia: string
  activo: boolean
  orden: number
}

export async function cuponesTiposAdmin(sb: ShakeClient): Promise<CuponTipo[]> {
  const f = (await rpc<CuponTipo[] | null>(sb, 'fn_cupones_tipos_admin')) ?? []
  return f.map((c) => ({ ...c, valor: Number(c.valor) }))
}

export async function guardarCuponTipo(
  sb: ShakeClient,
  c: Partial<Pick<CuponTipo, 'id' | 'nombre' | 'tipo' | 'valor' | 'familia' | 'activo'>>,
): Promise<CuponTipo> {
  return rpc<CuponTipo>(sb, 'fn_cupon_tipo_guardar', { p: c })
}
