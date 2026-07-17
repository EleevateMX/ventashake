// Edge Function: clip-estado-cobro
//
// Consulta el estado real de un intento de pago en Clip (usado por
// ClipPaymentProvider.getPaymentStatus, y por la reconciliación cuando
// haya credenciales). Mismo principio que clip-crear-cobro: sin
// credenciales configuradas, responde 'unknown' explícito, nunca inventa
// un estado.

import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const CLIP_API_KEY = Deno.env.get('CLIP_API_KEY')
  if (!CLIP_API_KEY) {
    return new Response(JSON.stringify({ estado: 'unknown', motivo: 'not_configured' }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  // TODO: llamar a la API real de Clip para consultar el estado del
  // proveedor_payment_id recibido en el body. Ver docs/integracion-clip.md.
  return new Response(JSON.stringify({ estado: 'unknown', motivo: 'not_implemented' }), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
})
