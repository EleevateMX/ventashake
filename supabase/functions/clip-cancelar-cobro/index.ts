// Edge Function: clip-cancelar-cobro
//
// Cancela un intento de pago en Clip antes de que se cobre (usado por
// ClipPaymentProvider.cancelPayment). Mismo principio que clip-crear-cobro:
// sin credenciales configuradas, responde not_configured explícito, nunca
// finge que canceló algo que nunca existió en Clip.
//
// TODO (cuando existan credenciales + documentación oficial de Clip):
// reemplazar el bloque "// TODO: llamar a la API real de Clip" con la
// llamada real. No se inventan aquí endpoints/campos de Clip que no se han
// confirmado — ver docs/integracion-clip.md.

import { corsHeaders } from '../_shared/cors.ts'

interface Body {
  proveedor_payment_id: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const CLIP_API_KEY = Deno.env.get('CLIP_API_KEY')
  if (!CLIP_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: { codigo: 'not_configured', mensaje: 'Clip no está configurado' } }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
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

  if (!body.proveedor_payment_id) {
    return new Response(JSON.stringify({ ok: false, error: { codigo: 'bad_request', mensaje: 'Falta proveedor_payment_id' } }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  // TODO: llamar a la API real de Clip aquí para cancelar
  // body.proveedor_payment_id. Sin documentación oficial confirmada, esta
  // función no finge una cancelación — devuelve not_implemented explícito.
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
