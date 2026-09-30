// Edge Function: clip-transacciones
//
// Baja de Clip las transacciones de UN dia (API de Transacciones,
// GET https://api-gw.payclip.com/payments), las guarda en
// `clip_transacciones` y las empata con los pagos integrados
// (fn_clip_conciliar_dia). Lo que no empata es de la terminal chica, que no
// esta integrada: asi se comprueba el "Tarjeta" que se registra a mano.
//
// Solo gerencia. Las credenciales de Clip nunca salen de aqui.
//
// La API limita cada consulta a 720 horas y pagina con
// `meta.pagination_token`. Un dia de Merida (UTC-6 todo el año) es de
// 06:00Z a 06:00Z del siguiente.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { ClipSinCredenciales, headersClip } from '../_shared/clip.ts'

const BASE = 'https://api-gw.payclip.com/payments'

type ItemClip = Record<string, unknown> & {
  receipt_no?: string
  created_at?: string
  status?: string
  payment_method?: string
  total?: string | number
  amount?: string | number
  card?: { last4?: string } | null
  merchant_invoice?: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })

  // ¿Quien pregunta? Con SU sesion se revisa que sea gerencia.
  const auth = req.headers.get('Authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: esJefe } = await comoUsuario.rpc('fn_es_jefe')
  if (esJefe !== true) return responder({ error: 'Solo gerencia.' }, 403)

  let dia: string
  try {
    dia = String((await req.json()).dia ?? '')
  } catch {
    return responder({ error: 'Falta el dia.' }, 400)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return responder({ error: 'Dia invalido (AAAA-MM-DD).' }, 400)

  const desde = new Date(`${dia}T06:00:00.000Z`)
  const hasta = new Date(desde.getTime() + 24 * 3600 * 1000)

  let headers: HeadersInit
  try {
    headers = { ...headersClip('authorization'), accept: 'application/vnd.com.payclip.v2+json' }
  } catch (e) {
    if (e instanceof ClipSinCredenciales) return responder({ error: 'Faltan credenciales de Clip.' }, 500)
    throw e
  }

  const items: ItemClip[] = []
  let token = ''
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const q = new URLSearchParams({ from: desde.toISOString(), to: hasta.toISOString(), limit: '100' })
    if (token) q.set('pagination_token', token)
    const r = await fetch(`${BASE}?${q}`, { headers })
    const texto = await r.text()
    if (!r.ok) {
      console.error('clip-transacciones:', r.status, texto.slice(0, 500))
      return responder({ error: `Clip contesto ${r.status}`, detalle: texto.slice(0, 300) }, 502)
    }
    const cuerpo = JSON.parse(texto) as { items?: ItemClip[]; meta?: { pagination_token?: string } }
    items.push(...(cuerpo.items ?? []))
    const sig = cuerpo.meta?.pagination_token ?? ''
    if (!sig || sig === token || (cuerpo.items ?? []).length === 0) break
    token = sig
  }

  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const filas = items
    .filter((i) => i.receipt_no && i.created_at)
    .map((i) => ({
      receipt_no: String(i.receipt_no),
      creado_en: String(i.created_at),
      dia,
      total: Number(i.total ?? i.amount ?? 0),
      status: i.status ?? null,
      metodo: i.payment_method ?? null,
      last4: i.card?.last4 ?? null,
      merchant_invoice: i.merchant_invoice ?? null,
      raw: i,
      bajada_en: new Date().toISOString(),
    }))

  if (filas.length > 0) {
    const { error } = await sb.from('clip_transacciones').upsert(filas, { onConflict: 'receipt_no' })
    if (error) return responder({ error: error.message }, 500)
  }
  const { error: e2 } = await sb.rpc('fn_clip_conciliar_dia', { p_dia: dia })
  if (e2) return responder({ error: e2.message }, 500)

  // Las llaves que trae una transaccion real: la documentacion no dice si
  // Clip manda el numero de serie de la terminal, y esto lo contesta.
  return responder({ dia, transacciones: filas.length, llaves: items[0] ? Object.keys(items[0]) : [] })
})
