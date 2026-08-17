// API de PinPad de Clip — el puente real con la terminal física.
//
// Documentación (portal de desarrolladores de Clip, sección PinPad):
//   POST   {BASE}/payment                  — crea la intención de pago EN la terminal
//   GET    {BASE}/payment/{id}             — consulta una intención
//   DELETE {BASE}/payment/{id}             — cancela una intención por id
//   DELETE {BASE}/payment/serial-number/{sn} — cancela lo activo en una terminal
//
// Compatible exclusivamente con: Clip Total 3, Ultra, PinPad y Stand 2
// (la Stand 2 de la sucursal es la que cobra). El dispositivo debe tener
// instalada la app PinPad (se pide a sdk@payclip.com con el número de
// serie). Solo existe ambiente de producción: no hay sandbox.
//
// La verdad sobre un pago SIEMPRE se obtiene con GET autenticado a Clip:
// el webhook de PinPad no trae firma, así que se trata como un timbre
// ("algo pasó, ve a verificar"), nunca como la confirmación en sí.

import { headersClip } from './clip.ts'

export const PINPAD_BASE = 'https://api.payclip.io/f2f/pinpad/v1'

/** Lo mínimo que estas funciones usan del cliente de Supabase. */
interface Sb {
  from(tabla: string): {
    update(valores: Record<string, unknown>): { eq(col: string, v: string): Promise<{ error: { message: string } | null }> }
  }
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: { message: string } | null }>
}

/** Estados de Clip → estado_transaccion_pago nuestro. */
export function mapearEstadoClip(estadoClip: string | undefined | null): string {
  const s = (estadoClip ?? '').toLowerCase()
  const mapa: Record<string, string> = {
    approved: 'authorized',
    authorized: 'authorized',
    pending: 'pending',
    processing: 'processing',
    rejected: 'declined',
    declined: 'declined',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    expired: 'expired',
    refunded: 'refunded_full',
  }
  return mapa[s] ?? 'unknown'
}

/**
 * Extrae el estado de la respuesta de GET /payment sin apostar a un solo
 * campo: la referencia pública documenta `status` para pagos, pero la
 * respuesta del pinpad puede envolverlo. El payload crudo se guarda
 * completo en pagos.clip_payload para diagnóstico.
 */
export function estadoDeRespuestaClip(resp: unknown): string {
  const r = resp as Record<string, unknown> | null
  const pago = (r?.payment ?? null) as Record<string, unknown> | null
  const crudo = r?.status ?? pago?.status ?? r?.payment_status ?? r?.state
  return mapearEstadoClip(typeof crudo === 'string' ? crudo : undefined)
}

/** GET del intento de pago en Clip. Devuelve el JSON crudo o null si 404. */
export async function obtenerPagoClip(pinpadRequestId: string): Promise<unknown | null> {
  const resp = await fetch(`${PINPAD_BASE}/payment/${encodeURIComponent(pinpadRequestId)}`, {
    method: 'GET',
    headers: headersClip('authorization'),
  })
  if (resp.status === 404) return null
  if (!resp.ok) {
    throw new Error(`Clip GET /payment respondió ${resp.status}: ${await resp.text()}`)
  }
  return await resp.json()
}

/**
 * Sincroniza UN pago contra la verdad de Clip y, si quedó autorizado,
 * confirma la venta (fn_confirmar_venta es idempotente: reintentos y
 * webhooks duplicados no confirman dos veces).
 *
 * Devuelve el estado_transaccion final del pago.
 */
export async function sincronizarPagoClip(
  sb: Sb,
  pago: { id: string; orden_id: string; proveedor_payment_id: string | null; estado_transaccion: string },
): Promise<string> {
  if (!pago.proveedor_payment_id) return pago.estado_transaccion

  // Estados finales: ya no hay nada que preguntar.
  if (['authorized', 'declined', 'cancelled', 'expired', 'refunded_full'].includes(pago.estado_transaccion)) {
    return pago.estado_transaccion
  }

  const respuesta = await obtenerPagoClip(pago.proveedor_payment_id)
  if (respuesta === null) return pago.estado_transaccion

  const estado = estadoDeRespuestaClip(respuesta)
  if (estado === 'unknown' || estado === pago.estado_transaccion) {
    // Guardar el payload igual: es la evidencia para diagnóstico.
    await sb.from('pagos').update({ clip_payload: respuesta }).eq('id', pago.id)
    return pago.estado_transaccion
  }

  const estadoPago =
    estado === 'authorized' ? 'aprobado'
    : estado === 'declined' ? 'rechazado'
    : estado === 'cancelled' || estado === 'expired' ? 'cancelado'
    : 'pendiente'

  await sb
    .from('pagos')
    .update({ estado_transaccion: estado, estado: estadoPago, clip_payload: respuesta })
    .eq('id', pago.id)

  if (estado === 'authorized') {
    const { error } = await sb.rpc('fn_confirmar_venta', {
      p_orden_id: pago.orden_id,
      p_pago_id: pago.id,
    })
    if (error) {
      console.error('sincronizarPagoClip: fn_confirmar_venta falló', error.message)
      throw new Error(`No se pudo confirmar la venta: ${error.message}`)
    }
  }

  return estado
}
