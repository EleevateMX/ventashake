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
  const data = (body.data ?? body) as Record<string, unknown>
  const checkoutId = String(data.checkout_id ?? data.id ?? body.checkout_id ?? body.id ?? '')
  const referencia = String((data.metadata as Record<string, unknown> | undefined)?.me_reference_id ?? '')

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
