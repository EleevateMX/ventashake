// Clip Checkout (pago en línea con tarjeta, en una página de Clip) para los
// pedidos por la app.
//
// Regla de la casa: la verdad se PREGUNTA. Ni la app ni el webhook aprueban
// nada: cualquiera de los dos solo dispara `confirmarSiPagado`, que le
// pregunta a Clip el estado del checkout y, solo si Clip dice que se cobró,
// aprueba la orden con fn_cobrar_orden (idempotente por checkout).
//
// ⚠ Antes de prender «pedidos por la app» en Admin hay que hacer UN pago
// real de prueba y confirmar en `pedidos_app_checkout.respuesta` cómo se
// llama el estado pagado en la respuesta de Clip. Hoy se aceptan los nombres
// documentados; si Clip usa otro, el pago queda «pendiente» y NUNCA se
// aprueba a ciegas: ese es el lado seguro.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { headersClip } from './clip.ts'

export const CHECKOUT_BASE = 'https://api.payclip.com/v2/checkout'

// Lo que documenta Clip: el link «se liquidó» = CHECKOUT_COMPLETED; en el
// webhook llega como resource_status COMPLETED.
const ESTADOS_PAGADO = new Set(['CHECKOUT_COMPLETED', 'COMPLETED'])

export function checkoutPagado(respuesta: Record<string, unknown>): boolean {
  const s = String(respuesta?.status ?? respuesta?.resource_status ?? '').toUpperCase()
  return ESTADOS_PAGADO.has(s)
}

export async function crearCheckout(orden: { id: string; folio: number; total: number }): Promise<{ id: string; url: string; raw: unknown }> {
  const resp = await fetch(CHECKOUT_BASE, {
    method: 'POST',
    headers: headersClip('authorization'),
    body: JSON.stringify({
      amount: Number(orden.total),
      currency: 'MXN',
      purchase_description: `Shakeaholic · pedido #${orden.folio}`,
      redirection_url: {
        success: 'https://rewards.shakeaholic.mx/pago-app?r=ok',
        error: 'https://rewards.shakeaholic.mx/pago-app?r=error',
        default: 'https://rewards.shakeaholic.mx/pago-app',
      },
      webhook_url: 'https://api.shakeaholic.mx/functions/v1/clip-checkout-webhook',
      metadata: { external_reference: orden.id },
    }),
  })
  const texto = await resp.text()
  let raw: Record<string, unknown> = {}
  try { raw = JSON.parse(texto) } catch { raw = { texto } }
  if (!resp.ok) {
    // Al registro completo: el motivo de Clip es lo único que permite
    // arreglar una integración a ciegas.
    console.error('clip-checkout-crear: Clip contestó', resp.status, texto.slice(0, 1000))
    throw new Error(`Clip contestó ${resp.status}: ${texto.slice(0, 300)}`)
  }
  const id = String(raw?.payment_request_id ?? raw?.id ?? '')
  const url = String(raw?.payment_request_url ?? raw?.url ?? '')
  if (!id || !url) throw new Error(`Clip no devolvió el enlace de pago: ${JSON.stringify(raw).slice(0, 200)}`)
  return { id, url, raw }
}

export async function consultarCheckout(id: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`${CHECKOUT_BASE}/${encodeURIComponent(id)}`, { headers: headersClip('authorization') })
  const raw = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(`Clip contestó ${resp.status} al consultar el checkout`)
  return raw as Record<string, unknown>
}

/** UUID v5-ish determinista a partir del checkout: la idempotencia de fn_cobrar_orden. */
async function idempotencia(checkoutId: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`clip-checkout:${checkoutId}`))
  const b = Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-5${b.slice(13, 16)}-a${b.slice(17, 20)}-${b.slice(20, 32)}`
}

/**
 * Pregunta a Clip y, si se cobró, aprueba la orden. Devuelve el estado:
 * 'pagado' | 'pendiente' | 'fallido'.
 */
export async function confirmarSiPagado(sb: SupabaseClient, ordenId: string): Promise<{ estado: string; detalle?: string }> {
  const { data: ck } = await sb.from('pedidos_app_checkout').select('checkout_id, estado').eq('orden_id', ordenId).maybeSingle()
  if (!ck) return { estado: 'pendiente', detalle: 'sin checkout' }
  if (ck.estado === 'pagado') return { estado: 'pagado' }

  const raw = await consultarCheckout(ck.checkout_id)
  await sb.from('pedidos_app_checkout').update({ respuesta: raw, actualizado_en: new Date().toISOString() }).eq('orden_id', ordenId)
  if (!checkoutPagado(raw)) {
    const s = String(raw?.status ?? '')
    const fallo = /CANCEL|EXPIRED|FAIL|DECLIN/i.test(s)
    if (fallo) await sb.from('pedidos_app_checkout').update({ estado: 'fallido' }).eq('orden_id', ordenId)
    return { estado: fallo ? 'fallido' : 'pendiente', detalle: s }
  }

  const { data: orden } = await sb.from('ordenes').select('id, total, pagado').eq('id', ordenId).single()
  if (!orden) return { estado: 'pendiente', detalle: 'sin orden' }
  if (!orden.pagado) {
    const { error } = await sb.rpc('fn_cobrar_orden', {
      p_orden_id: ordenId,
      p_metodo: 'clip',
      p_monto: orden.total,
      p_referencia: `checkout:${ck.checkout_id}`,
      p_autorizado_por: null,
      p_idempotency_key: await idempotencia(ck.checkout_id),
    })
    if (error) throw error
  }
  await sb.from('pedidos_app_checkout').update({ estado: 'pagado', actualizado_en: new Date().toISOString() }).eq('orden_id', ordenId)
  return { estado: 'pagado' }
}
