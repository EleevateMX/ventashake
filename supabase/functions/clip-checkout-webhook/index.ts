// Edge Function: clip-checkout-webhook (sin JWT: lo llama Clip)
//
// Un timbre, no una fuente: no viene firmado. Solo sirve para no esperar al
// sondeo de la app. Lo único que hace es PREGUNTARLE a Clip por ese checkout
// y aprobar si Clip dice que se cobró.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { confirmarSiPagado } from '../_shared/checkout.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok')
  const url = Deno.env.get('SUPABASE_URL'), servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !servicio) return Response.json({ ok: false }, { status: 500 })
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* sin cuerpo */ }
  // El aviso de Clip trae payment_request_id y me_reference_id (lo que
  // mandamos en metadata.external_reference, o sea el id de la orden).
  const data = (body.data ?? body) as Record<string, unknown>
  const checkoutId = String(data.payment_request_id ?? body.payment_request_id ?? '')
  const referencia = String(data.me_reference_id ?? body.me_reference_id ?? '')
  console.log('clip-checkout-webhook: aviso', { checkoutId, referencia, resource_status: data.resource_status ?? body.resource_status })

  const sb = createClient(url, servicio, { auth: { persistSession: false } })
  let ordenId = referencia
  if (!ordenId && checkoutId) {
    const { data: ck } = await sb.from('pedidos_app_checkout').select('orden_id').eq('checkout_id', checkoutId).maybeSingle()
    ordenId = ck?.orden_id ?? ''
  }
  if (!ordenId) return Response.json({ ok: true, ignorado: true })
  try {
    const r = await confirmarSiPagado(sb, ordenId)
    return Response.json({ ok: true, ...r })
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 200 })
  }
})
