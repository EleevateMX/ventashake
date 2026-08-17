// Edge Function: clip-cancelar-cobro
//
// Cancela un intento de pago activo en la terminal (DELETE /payment/{id}
// de la API de PinPad). Lo usa el kiosko cuando la cajera aborta el cobro
// o cuando el sondeo se rinde. Cancelar algo ya cobrado no procede: en
// ese caso el estado real (approved) llegará por webhook/sondeo igual.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { headersClip, ClipSinCredenciales } from '../_shared/clip.ts'
import { PINPAD_BASE } from '../_shared/pinpad.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })

  let body: { proveedor_payment_id?: string }
  try {
    body = await req.json()
  } catch {
    return responder({ ok: false, error: { codigo: 'bad_request', mensaje: 'JSON inválido' } }, 400)
  }
  if (!body.proveedor_payment_id) {
    return responder({ ok: false, error: { codigo: 'bad_request', mensaje: 'Falta proveedor_payment_id' } }, 400)
  }

  let cabeceras: HeadersInit
  try {
    cabeceras = headersClip('authorization')
  } catch (e) {
    if (e instanceof ClipSinCredenciales) {
      return responder({ ok: false, error: { codigo: 'not_configured', mensaje: 'Clip no está configurado' } })
    }
    throw e
  }

  const resp = await fetch(`${PINPAD_BASE}/payment/${encodeURIComponent(body.proveedor_payment_id)}`, {
    method: 'DELETE',
    headers: cabeceras,
  }).catch(() => null)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (resp?.ok) {
    await sb
      .from('pagos')
      .update({ estado_transaccion: 'cancelled', estado: 'cancelado' })
      .eq('proveedor_payment_id', body.proveedor_payment_id)
      .in('estado_transaccion', ['created', 'pending', 'processing'])
    return responder({ ok: true })
  }

  console.error('clip-cancelar-cobro: Clip respondió', resp?.status, await resp?.text().catch(() => ''))
  return responder({
    ok: false,
    error: { codigo: 'no_cancelado', mensaje: 'Clip no aceptó la cancelación (puede que el pago ya se haya procesado).' },
  })
})
