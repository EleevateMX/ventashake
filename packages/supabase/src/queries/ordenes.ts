import type {
  Orden,
  OrdenInsert,
  OrdenItemInsert,
  Pago,
  PagoInsert,
  MetodoPago,
} from '@shake/types'
import type { ShakeClient } from '../client'

export interface NuevaOrdenItem {
  producto_id: string
  cantidad: number
  precio_unitario: number
  personalizacion?: string | null
}

/**
 * Crea la orden con sus items en estado pendiente (sin pagar).
 * Si `orden.descuento` viene (p. ej. por cupón), el total registrado es
 * neto (subtotal − descuento), que es lo que se cobra y sobre lo que se
 * acumulan mancuernas.
 */
export async function crearOrden(
  sb: ShakeClient,
  orden: OrdenInsert,
  items: NuevaOrdenItem[],
): Promise<Orden> {
  const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0)
  const descuento = orden.descuento ?? 0
  const total = Math.max(0, subtotal - descuento)
  const { data: nueva, error } = await sb
    .from('ordenes')
    .insert({ ...orden, total })
    .select()
    .single()
  if (error) throw error

  const filas: OrdenItemInsert[] = items.map((i) => ({ ...i, orden_id: nueva.id }))
  const { error: itemsError } = await sb.from('orden_items').insert(filas)
  if (itemsError) throw itemsError
  return nueva
}

/**
 * Registra un pago. Al pasar estado 'aprobado', el trigger de la base
 * marca la orden como pagada, descuenta inventario por receta y genera
 * los pedidos de cocina — todo en una sola transacción del lado servidor.
 */
export async function registrarPago(sb: ShakeClient, pago: PagoInsert): Promise<Pago> {
  const { data, error } = await sb.from('pagos').insert(pago).select().single()
  if (error) throw error
  return data
}

/** Atajo del flujo de caja: pago inmediato aprobado (efectivo/manual). */
export async function cobrarOrden(
  sb: ShakeClient,
  ordenId: string,
  metodo: MetodoPago,
  monto: number,
  opts: { referencia?: string; autorizadoPor?: string } = {},
): Promise<Pago> {
  return registrarPago(sb, {
    orden_id: ordenId,
    metodo,
    monto,
    estado: 'aprobado',
    referencia: opts.referencia ?? null,
    autorizado_por: opts.autorizadoPor ?? null,
  })
}

export async function cancelarOrden(sb: ShakeClient, ordenId: string): Promise<void> {
  const { error } = await sb.from('ordenes').update({ estado: 'cancelada' }).eq('id', ordenId)
  if (error) throw error
}
