// Edge Function: clip-checkout-crear
// El cliente (con su sesión) pide el enlace de pago de SU pedido sin pagar.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { crearCheckout } from '../_shared/checkout.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const responder = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !servicio) return responder({ ok: false, error: { mensaje: 'Falta configuración del servidor.' } }, 500)

  const comoCliente = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
  const { data: { user } } = await comoCliente.auth.getUser()
  if (!user) return responder({ ok: false, error: { mensaje: 'Entra a tu cuenta.' } }, 401)

  let body: { orden_id?: string }
  try { body = await req.json() } catch { return responder({ ok: false, error: { mensaje: 'JSON inválido' } }, 400) }
  if (!body.orden_id) return responder({ ok: false, error: { mensaje: 'Falta el pedido.' } }, 400)

  const sb = createClient(url, servicio, { auth: { persistSession: false } })
  const { data: cfg } = await sb.from('pedidos_app_config').select('activo').eq('id', 'default').maybeSingle()
  if (!cfg?.activo) return responder({ ok: false, error: { mensaje: 'Los pedidos por la app están apagados por ahora.' } }, 403)

  const { data: cliente } = await sb.from('clientes').select('id').eq('auth_user_id', user.id).maybeSingle()
  const { data: orden } = await sb.from('ordenes').select('id, folio, total, pagado, canal, cliente_id, estado_pago_orden, expira_en').eq('id', body.orden_id).maybeSingle()
  if (!orden || !cliente || orden.cliente_id !== cliente.id || orden.canal !== 'app') {
    return responder({ ok: false, error: { mensaje: 'Ese pedido no es tuyo.' } }, 403)
  }
  if (orden.pagado) return responder({ ok: true, pagado: true })
  if (orden.estado_pago_orden !== 'pending_payment' || new Date(orden.expira_en) < new Date()) {
    return responder({ ok: false, error: { mensaje: 'Ese pedido ya caducó. Vuelve a pedirlo.' } }, 410)
  }

  const { data: existente } = await sb.from('pedidos_app_checkout').select('url, estado').eq('orden_id', orden.id).maybeSingle()
  if (existente && existente.estado === 'pendiente') return responder({ ok: true, url: existente.url })

  try {
    const ck = await crearCheckout({ id: orden.id, folio: orden.folio, total: Number(orden.total) })
    await sb.from('pedidos_app_checkout').upsert({ orden_id: orden.id, checkout_id: ck.id, url: ck.url, estado: 'pendiente', respuesta: ck.raw })
    return responder({ ok: true, url: ck.url })
  } catch (e) {
    return responder({ ok: false, error: { mensaje: `No se pudo abrir el pago: ${(e as Error).message}` } }, 502)
  }
})
