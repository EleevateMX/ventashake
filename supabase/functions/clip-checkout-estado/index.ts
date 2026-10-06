// Edge Function: clip-checkout-estado
// La app pregunta «¿ya se pagó?»: se le pregunta a Clip y, si sí, se aprueba.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { confirmarSiPagado } from '../_shared/checkout.ts'

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
  const { data: cliente } = await sb.from('clientes').select('id').eq('auth_user_id', user.id).maybeSingle()
  const { data: orden } = await sb.from('ordenes').select('id, cliente_id, pagado').eq('id', body.orden_id).maybeSingle()
  if (!orden || !cliente || orden.cliente_id !== cliente.id) return responder({ ok: false, error: { mensaje: 'Ese pedido no es tuyo.' } }, 403)
  if (orden.pagado) return responder({ ok: true, estado: 'pagado' })

  try {
    const r = await confirmarSiPagado(sb, orden.id)
    return responder({ ok: true, ...r })
  } catch (e) {
    return responder({ ok: false, error: { mensaje: (e as Error).message } }, 502)
  }
})
