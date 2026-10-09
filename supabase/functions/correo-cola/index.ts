// Edge Function: correo-cola
//
// Vacía la cola de correos de cortes (correos_cola). La llama pg_cron cada
// minuto cuando hay algo pendiente, con la llave publicable: no recibe
// contenido ni devuelve datos de nadie, solo manda lo que la base ya
// decidió mandar, a los correos que gerencia registró en Admin → Cortes.
//
// El comprobante es el MISMO HTML que Admin enseña e imprime
// (_shared/comprobanteCorte.ts, copia de packages/utils; una prueba revisa
// que sean iguales).
//
// Secrets: RESEND_API_KEY (la llave del servicio de correo) y
// CORREO_REMITENTE (p. ej. «Shakeaholic <cortes@shakeaholic.mx>», de un
// dominio verificado en Resend). Sin la llave no manda nada: deja dicho en
// la cola por qué y vuelve a intentar en una hora, para no despertarse
// cada minuto a fallar igual.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { comprobanteCorteHtml, folioDeCorte, type DatosComprobanteCorte } from '../_shared/comprobanteCorte.ts'

const MAX_INTENTOS = 6

function pesos(n: number | null | undefined): string {
  return `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function asunto(tipo: string, c: DatosComprobanteCorte): string {
  const folio = folioDeCorte(c.folio)
  if (tipo === 'entrega_con_diferencia') {
    const d = Number(c.recibido_diferencia ?? 0)
    return `⚠ Entrega con diferencia · ${folio} · ${c.recibe ?? '¿?'} recibió ${d < 0 ? 'de menos' : 'de más'} ${pesos(Math.abs(d))}`
  }
  const dif = Number(c.diferencia ?? 0)
  const partes = [`Corte ${folio}`, c.entrega ?? '—']
  if (c.retiro != null) partes.push(`retiro ${pesos(c.retiro)}`)
  if (dif !== 0) partes.push(`${dif < 0 ? 'faltan' : 'sobran'} ${pesos(Math.abs(dif))}`)
  return (tipo === 'reenvio' ? 'Reenvío · ' : '') + partes.join(' · ')
}

async function procesar(sb: SupabaseClient, llave: string, remitente: string) {
  const { data: correos, error: e1 } = await sb.from('correos_cortes').select('correo').eq('activo', true)
  if (e1) throw e1
  const para = (correos ?? []).map((c) => c.correo as string)

  const { data: cola, error: e2 } = await sb
    .from('correos_cola')
    .select('id, tipo, corte_id, intentos')
    .is('enviado_en', null)
    .lt('intentos', MAX_INTENTOS)
    .lte('proximo_intento', new Date().toISOString())
    .order('creado_en')
    .limit(10)
  if (e2) throw e2

  let enviados = 0
  let fallidos = 0
  for (const q of cola ?? []) {
    const fallar = async (mensaje: string) => {
      fallidos++
      const intentos = (q.intentos as number) + 1
      await sb.from('correos_cola').update({
        intentos,
        error: mensaje.slice(0, 500),
        proximo_intento: new Date(Date.now() + 5 * 60_000 * intentos).toISOString(),
      }).eq('id', q.id)
    }
    if (para.length === 0) { await fallar('No hay correos registrados en Admin → Cortes.'); continue }

    const { data: comp, error: e3 } = await sb.rpc('fn_corte_comprobante', { p_corte_id: q.corte_id })
    if (e3 || !comp) { await fallar(`No se pudo armar el comprobante: ${e3?.message ?? 'vacío'}`); continue }
    const c = comp as DatosComprobanteCorte

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remitente,
        to: para,
        subject: asunto(q.tipo as string, c),
        html: comprobanteCorteHtml(c),
      }),
    })
    if (!r.ok) {
      await fallar(`El servicio de correo contestó ${r.status}: ${(await r.text()).slice(0, 300)}`)
      continue
    }
    enviados++
    await sb.from('correos_cola').update({
      enviado_en: new Date().toISOString(), para, error: null, intentos: (q.intentos as number) + 1,
    }).eq('id', q.id)
  }
  return { enviados, fallidos }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  const url = Deno.env.get('SUPABASE_URL')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !servicio) return Response.json({ ok: false, error: 'not_configured' }, { status: 500 })
  const sb = createClient(url, servicio, { auth: { persistSession: false } })

  const llave = Deno.env.get('RESEND_API_KEY')
  const remitente = Deno.env.get('CORREO_REMITENTE') ?? 'Shakeaholic <onboarding@resend.dev>'
  if (!llave) {
    // Se deja dicho en la cola (Admin lo enseña) y se pospone una hora.
    await sb.from('correos_cola').update({
      error: 'Falta configurar el servicio de correo (RESEND_API_KEY).',
      proximo_intento: new Date(Date.now() + 3_600_000).toISOString(),
    }).is('enviado_en', null)
    return Response.json({ ok: false, error: 'sin_llave' }, { status: 503 })
  }

  try {
    return Response.json({ ok: true, ...(await procesar(sb, llave, remitente)) })
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
})
