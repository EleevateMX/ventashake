// Edge Function: clip-webhook
//
// Recibe la confirmación real de Clip. Este es el ÚNICO lugar (junto con
// fn_reconciliar_pagos) donde una venta de Clip se confirma — nunca la
// respuesta HTTP que ve el navegador del kiosko.
//
// Pasos (todos obligatorios, en este orden):
//   1. Leer el body CRUDO (sin parsear) — la validación de firma HMAC
//      necesita los bytes exactos, no un JSON re-serializado.
//   2. Validar la firma con CLIP_WEBHOOK_SECRET. Si no coincide: 401,
//      NO se procesa nada.
//   3. Deduplicar: si ya se procesó este evento (mismo
//      proveedor_payment_id + mismo estado ya aplicado), responder 200
//      sin volver a hacer nada — un webhook reenviado por Clip (pasa
//      seguido, es su comportamiento normal de reintento) nunca debe
//      duplicar una confirmación de venta.
//   4. Actualizar `pagos.estado_transaccion` según el evento.
//   5. Si el nuevo estado es 'authorized': llamar fn_confirmar_venta()
//      (RPC, con service_role — bypasea RLS, pero la función igual
//      exige que el pago esté 'authorized', así que no es un atajo
//      inseguro).
//   6. Responder 200 SIEMPRE que el webhook se haya podido procesar
//      (aunque el resultado interno sea "ya estaba", según el estándar
//      de reintentos de webhooks) — solo 401/400 para firma inválida o
//      payload corrupto.
//
// TODO (cuando exista documentación oficial de Clip): reemplazar
// `validarFirmaClip()` con el algoritmo real (HMAC-SHA256 es el patrón
// más común en pasarelas, pero se debe confirmar el nombre exacto del
// header y el esquema contra la documentación real antes de confiar en
// esto en producción).

import { createClient } from 'jsr:@supabase/supabase-js@2'

async function validarFirmaClip(rawBody: string, firmaRecibida: string | null, secret: string): Promise<boolean> {
  if (!firmaRecibida) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const firmaCalculada = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const firmaHex = Array.from(new Uint8Array(firmaCalculada))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  // Comparación en tiempo constante evita timing attacks.
  if (firmaHex.length !== firmaRecibida.length) return false
  let diff = 0
  for (let i = 0; i < firmaHex.length; i++) diff |= firmaHex.charCodeAt(i) ^ firmaRecibida.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  const CLIP_WEBHOOK_SECRET = Deno.env.get('CLIP_WEBHOOK_SECRET')
  if (!CLIP_WEBHOOK_SECRET) {
    console.error('clip-webhook: CLIP_WEBHOOK_SECRET no configurado — rechazando todo webhook')
    return new Response('not configured', { status: 503 })
  }

  const rawBody = await req.text()
  // TODO: confirmar el nombre exacto del header de firma en la
  // documentación real de Clip (aquí se asume 'x-clip-signature' como
  // convención genérica hasta confirmarlo).
  const firma = req.headers.get('x-clip-signature')

  const firmaValida = await validarFirmaClip(rawBody, firma, CLIP_WEBHOOK_SECRET)
  if (!firmaValida) {
    console.error('clip-webhook: firma inválida, request rechazado')
    return new Response('invalid signature', { status: 401 })
  }

  let evento: { evento_id?: string; proveedor_payment_id?: string; estado?: string }
  try {
    evento = JSON.parse(rawBody)
  } catch {
    return new Response('invalid json', { status: 400 })
  }

  if (!evento.proveedor_payment_id) {
    return new Response('missing proveedor_payment_id', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(supabaseUrl, serviceRoleKey)

  // Log de auditoría del evento crudo (sin secretos) — ver docs/reconciliacion-pagos.md.
  console.log('clip-webhook evento recibido', {
    evento_id: evento.evento_id,
    proveedor_payment_id: evento.proveedor_payment_id,
    estado: evento.estado,
  })

  const { data: pago, error: errPago } = await sb
    .from('pagos')
    .select('id, orden_id, estado_transaccion')
    .eq('proveedor_payment_id', evento.proveedor_payment_id)
    .maybeSingle()

  if (errPago || !pago) {
    console.error('clip-webhook: no se encontró pago para proveedor_payment_id', evento.proveedor_payment_id)
    // 200 igual: Clip no debe reintentar infinito por un pago que no
    // reconocemos (podría ser de otro ambiente/proyecto).
    return new Response('ok (payment not found, ignored)', { status: 200 })
  }

  // Dedupe: si ya está en el estado que manda el webhook, no hay nada que hacer.
  const estadoNuevo = evento.estado ?? 'unknown'
  if (pago.estado_transaccion === estadoNuevo) {
    return new Response('ok (duplicate, already applied)', { status: 200 })
  }

  if (estadoNuevo === 'authorized') {
    await sb.from('pagos').update({ estado_transaccion: 'authorized' }).eq('id', pago.id)
    const { error: errConfirmar } = await sb.rpc('fn_confirmar_venta', {
      p_orden_id: pago.orden_id,
      p_pago_id: pago.id,
    })
    if (errConfirmar) {
      console.error('clip-webhook: fn_confirmar_venta falló', errConfirmar.message)
      return new Response('error confirming sale', { status: 500 })
    }
  } else {
    await sb.from('pagos').update({ estado_transaccion: estadoNuevo }).eq('id', pago.id)
  }

  return new Response('ok', { status: 200 })
})
