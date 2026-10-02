// Edge Function: push-cola
//
// Vacía la cola de avisos (push_cola) mandando cada uno por APNs. La llama
// pg_cron cada minuto cuando hay algo pendiente, con la llave publicable:
// no recibe contenido ni devuelve datos de nadie, solo manda lo que la base
// ya decidió mandar. Si los secrets de APNs no están, no hace nada y lo
// dice.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { procesarCola } from '../_shared/push-cola.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  const url = Deno.env.get('SUPABASE_URL')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !servicio) return Response.json({ ok: false, error: 'not_configured' }, { status: 500 })
  if (!Deno.env.get('APNS_KEY_P8')) {
    return Response.json({ ok: false, error: 'sin_apns', mensaje: 'Faltan los secrets de APNs: corre apps/rewards-ios/push/subir-secrets.sh' }, { status: 503 })
  }
  const sb = createClient(url, servicio, { auth: { persistSession: false } })
  try {
    const r = await procesarCola(sb)
    return Response.json({ ok: true, ...r })
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
})
