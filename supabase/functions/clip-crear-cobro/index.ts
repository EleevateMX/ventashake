// Edge Function: clip-crear-cobro
//
// Recibe { orden_id, monto, idempotency_key, sucursal_id, descripcion? }
// desde el kiosko (vía ClipPaymentProvider.createPayment, nunca directo).
//
// Responsabilidad de ESTA función (y solo esta — nunca el frontend):
//   1. Tener acceso a CLIP_API_KEY / CLIP_WEBHOOK_SECRET (secrets del
//      proyecto, `supabase secrets set`), que el navegador jamás ve.
//   2. Recalcular el monto real de la orden desde la base (con
//      service_role) — el `monto` que manda el cliente es solo
//      informativo, NUNCA se confía en él para lo que se le cobra a Clip.
//   3. Si las credenciales no están configuradas: responder
//      `{ ok:false, error:{codigo:'not_configured', ...} }` — nunca
//      simular una aprobación ni un checkout falso.
//   4. (Cuando haya credenciales reales) crear el intento de cobro en
//      Clip, guardar `pagos.proveedor_payment_id`, dejar el pago en
//      `pending`/`processing` — la confirmación real llega por
//      `clip-webhook`, NUNCA se confirma la venta aquí mismo con la
//      respuesta HTTP del navegador.
//
// TODO (cuando existan credenciales + documentación oficial de Clip):
// reemplazar el bloque "// TODO: llamar a la API real de Clip" con la
// llamada real. No se inventan aquí endpoints/campos de Clip que no se
// han confirmado — ver docs/integracion-clip.md.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface Body {
  orden_id: string
  monto: number
  idempotency_key: string
  sucursal_id: string
  descripcion?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const CLIP_API_KEY = Deno.env.get('CLIP_API_KEY')
  const CLIP_WEBHOOK_SECRET = Deno.env.get('CLIP_WEBHOOK_SECRET')

  if (!CLIP_API_KEY || !CLIP_WEBHOOK_SECRET) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          codigo: 'not_configured',
          mensaje: 'Pago temporalmente no disponible. Usa "Pagar en caja".',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: { codigo: 'bad_request', mensaje: 'JSON inválido' } }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(supabaseUrl, serviceRoleKey)

  // El monto NUNCA se confía del body — se recalcula desde la orden real.
  const { data: orden, error: errOrden } = await sb
    .from('ordenes')
    .select('id, total, estado_pago_orden, sucursal_id')
    .eq('id', body.orden_id)
    .single()

  if (errOrden || !orden) {
    return new Response(JSON.stringify({ ok: false, error: { codigo: 'orden_no_encontrada', mensaje: 'La orden no existe' } }), {
      status: 404,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  if (!['pending_payment', 'payment_processing', 'payment_unknown'].includes(orden.estado_pago_orden)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { codigo: 'estado_invalido', mensaje: `La orden no admite cobro (estado=${orden.estado_pago_orden})` },
      }),
      { status: 409, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // TODO: llamar a la API real de Clip aquí, con CLIP_API_KEY, usando
  // orden.total (NO body.monto) y body.idempotency_key como clave de
  // idempotencia del lado de Clip también (si su API la soporta).
  //
  // const respuestaClip = await fetch('https://api.clip.mx/...', { ... })
  //
  // Por ahora, sin documentación oficial confirmada, esta función no
  // finge una respuesta de Clip — devuelve not_implemented explícito.
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        codigo: 'not_implemented',
        mensaje: 'Credenciales presentes pero la integración real con la API de Clip aún no está escrita. Ver docs/integracion-clip.md.',
      },
    }),
    { status: 501, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
