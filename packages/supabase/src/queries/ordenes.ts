import type {
  Orden,
  OrdenInsert,
  Pago,
  PagoInsert,
  MetodoPago,
} from '@shake/types'
import type { ShakeClient } from '../client'

export interface NuevaOrdenItem {
  producto_id: string
  cantidad: number
  /**
   * @deprecated ya no se envía a la base: el precio real se recalcula en
   * el servidor desde `productos.precio` (fn_crear_orden). Se conserva el
   * campo en la interfaz solo por compatibilidad de las apps que ya lo
   * llenan al armar el carrito; se ignora silenciosamente.
   */
  precio_unitario?: number
  personalizacion?: string | null
}

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que empleados.ts).
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/**
 * Crea la orden con sus items en estado pendiente (sin pagar), en una sola
 * transacción atómica del lado del servidor (RPC `fn_crear_orden`). El
 * precio de cada línea y el total se RECALCULAN en la base desde
 * `productos.precio` — el cliente ya no puede mandar un precio ni un total
 * manipulado (ver docs/auditoria-produccion.md, hallazgos C1/C2/A1).
 */
export async function crearOrden(
  sb: ShakeClient,
  orden: OrdenInsert,
  items: NuevaOrdenItem[],
): Promise<Orden> {
  return rpc<Orden>(sb, 'fn_crear_orden', {
    p_sucursal_id: orden.sucursal_id ?? null,
    p_almacen_id: orden.almacen_id ?? null,
    p_canal: orden.canal,
    p_items: items.map((i) => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      personalizacion: i.personalizacion ?? null,
    })),
    p_corte_id: orden.corte_id ?? null,
    p_empleado_id: orden.empleado_id ?? null,
    p_cliente_id: orden.cliente_id ?? null,
    p_descuento: orden.descuento ?? 0,
    p_es_demo: orden.es_demo ?? false,
  })
}

/**
 * Registra un pago en estado `pendiente` (inofensivo: no dispara nada).
 * Aprobar un pago (estado='aprobado') SOLO puede hacerse vía `cobrarOrden`
 * (RPC `fn_cobrar_orden`, que valida el monto contra el total real de la
 * orden); la base rechaza cualquier INSERT directo con estado='aprobado'.
 */
export async function registrarPago(sb: ShakeClient, pago: PagoInsert): Promise<Pago> {
  const { data, error } = await sb.from('pagos').insert({ ...pago, estado: 'pendiente' }).select().single()
  if (error) throw error
  return data
}

/**
 * Atajo del flujo de caja: pago inmediato aprobado (efectivo/manual), vía
 * la RPC `fn_cobrar_orden` — idempotente (un reintento o doble clic nunca
 * crea un segundo pago aprobado) y valida que `monto` coincida con el
 * total real de la orden calculado por el servidor.
 *
 * `opts.idempotencyKey`: opcional, UUID generado por el cliente por
 * intento de cobro. Si el mismo intento se reenvía (timeout de red, doble
 * tap), se devuelve el pago ya creado en vez de duplicarlo.
 */
export async function cobrarOrden(
  sb: ShakeClient,
  ordenId: string,
  metodo: MetodoPago,
  monto: number,
  opts: { referencia?: string; autorizadoPor?: string; idempotencyKey?: string } = {},
): Promise<Pago> {
  return rpc<Pago>(sb, 'fn_cobrar_orden', {
    p_orden_id: ordenId,
    p_metodo: metodo,
    p_monto: monto,
    p_referencia: opts.referencia ?? null,
    p_autorizado_por: opts.autorizadoPor ?? null,
    p_idempotency_key: opts.idempotencyKey ?? null,
  })
}

export async function cancelarOrden(sb: ShakeClient, ordenId: string): Promise<void> {
  const { error } = await sb.from('ordenes').update({ estado: 'cancelada' }).eq('id', ordenId)
  if (error) throw error
}
