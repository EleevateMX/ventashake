// Edge Function: push-enviar
//
// Una campaña desde Admin → Avisos: título y texto, a todos los teléfonos o
// a un cliente. Solo gerencia (fn_es_jefe con la sesión de quien llama).
// Encola una fila por cliente y vacía la cola en el momento, para que Admin
// vea «entregados» al instante en vez de esperar al cron.
//
// Body: { titulo, cuerpo, destino: 'todos' | 'cliente', cliente_id? }
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { procesarCola } from '../_shared/push-cola.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !servicio) return responder({ ok: false, error: { mensaje: 'Falta configuración del servidor.' } }, 500)

  const auth = req.headers.get('Authorization') ?? ''
  const comoQuienLlama = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: { user } } = await comoQuienLlama.auth.getUser()
  const { data: esJefe } = await comoQuienLlama.rpc('fn_es_jefe')
  if (!user || esJefe !== true) {
    return responder({ ok: false, error: { mensaje: 'Solo gerencia puede mandar avisos.' } }, 403)
  }
  if (!Deno.env.get('APNS_KEY_P8')) {
    return responder({ ok: false, error: { mensaje: 'Faltan los secrets de APNs: corre apps/rewards-ios/push/subir-secrets.sh' } }, 503)
  }

  let body: { titulo?: string; cuerpo?: string; destino?: string; cliente_id?: string }
  try { body = await req.json() } catch { return responder({ ok: false, error: { mensaje: 'JSON inválido' } }, 400) }
  const titulo = String(body.titulo ?? '').trim().slice(0, 60)
  const cuerpo = String(body.cuerpo ?? '').trim().slice(0, 180)
  const destino = body.destino === 'cliente' ? 'cliente' : 'todos'
  if (!titulo || !cuerpo) return responder({ ok: false, error: { mensaje: 'Escribe título y texto.' } }, 400)
  if (destino === 'cliente' && !body.cliente_id) return responder({ ok: false, error: { mensaje: 'Elige el cliente.' } }, 400)

  const sb = createClient(url, servicio, { auth: { persistSession: false } })
  const { data: empleado } = await sb.from('empleados').select('id').eq('auth_user_id', user.id).maybeSingle()

  // Destinatarios: una fila por cuenta con teléfono activo.
  let consulta = sb.from('push_dispositivos').select('auth_user_id, cliente_id').eq('activo', true)
  if (destino === 'cliente') consulta = consulta.eq('cliente_id', body.cliente_id!)
  const { data: dispositivos, error: errorDisp } = await consulta
  if (errorDisp) return responder({ ok: false, error: { mensaje: errorDisp.message } }, 500)
  const cuentas = new Map<string, string | null>()
  for (const d of dispositivos ?? []) cuentas.set(d.auth_user_id, d.cliente_id)

  const { data: envio, error: errorEnvio } = await sb.from('push_envios').insert({
    titulo, cuerpo, destino, cliente_id: destino === 'cliente' ? body.cliente_id : null,
    destinatarios: cuentas.size, empleado_id: empleado?.id ?? null,
  }).select('id').single()
  if (errorEnvio) return responder({ ok: false, error: { mensaje: errorEnvio.message } }, 500)

  if (cuentas.size > 0) {
    const filas = [...cuentas.entries()].map(([auth_user_id, cliente_id]) => ({
      auth_user_id, cliente_id, titulo, cuerpo, envio_id: envio.id, datos: { tipo: 'campana', envio_id: envio.id },
    }))
    const { error: errorCola } = await sb.from('push_cola').insert(filas)
    if (errorCola) return responder({ ok: false, error: { mensaje: errorCola.message } }, 500)
  }

  let entregados = 0
  try {
    const r = await procesarCola(sb)
    const { data: delEnvio } = await sb.from('push_cola').select('entregados').eq('envio_id', envio.id)
    entregados = (delEnvio ?? []).reduce((s, f) => s + (f.entregados ?? 0), 0)
    await sb.from('push_envios').update({ entregados }).eq('id', envio.id)
    return responder({ ok: true, destinatarios: cuentas.size, entregados, procesados: r.procesados })
  } catch (e) {
    return responder({ ok: false, error: { mensaje: `Encolado, pero no se pudo mandar ahora: ${(e as Error).message}` } }, 500)
  }
})
