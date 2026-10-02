// Vaciar la cola de avisos: lo comparten push-cola (cron) y push-enviar
// (campaña de Admin), para que una campaña salga en el momento y no espere
// al siguiente minuto.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { mandarAviso } from './apns.ts'

interface Pendiente {
  id: string
  auth_user_id: string | null
  cliente_id: string | null
  titulo: string
  cuerpo: string
  datos: Record<string, unknown>
}

interface Dispositivo {
  id: string
  token: string
  entorno: 'sandbox' | 'production'
}

export async function procesarCola(sb: SupabaseClient, maximo = 200): Promise<{ procesados: number; entregados: number }> {
  const { data: pendientes, error } = await sb
    .from('push_cola')
    .select('id, auth_user_id, cliente_id, titulo, cuerpo, datos')
    .is('enviado_en', null)
    .order('creado_en')
    .limit(maximo)
  if (error) throw error

  let entregados = 0
  for (const p of (pendientes ?? []) as Pendiente[]) {
    let consulta = sb.from('push_dispositivos').select('id, token, entorno').eq('activo', true)
    consulta = p.auth_user_id ? consulta.eq('auth_user_id', p.auth_user_id) : consulta.eq('cliente_id', p.cliente_id)
    const { data: dispositivos } = await consulta
    let ok = 0
    const errores: string[] = []
    for (const d of (dispositivos ?? []) as Dispositivo[]) {
      const r = await mandarAviso(d.token, d.entorno, { titulo: p.titulo, cuerpo: p.cuerpo, datos: p.datos })
      if (r.ok) {
        ok++
        await sb.from('push_dispositivos').update({ visto_en: new Date().toISOString(), ultimo_error: null }).eq('id', d.id)
      } else {
        errores.push(r.razon)
        await sb.from('push_dispositivos').update({ ultimo_error: r.razon, ...(r.tokenMuerto ? { activo: false } : {}) }).eq('id', d.id)
      }
    }
    entregados += ok
    await sb.from('push_cola').update({
      enviado_en: new Date().toISOString(),
      entregados: ok,
      error: errores.length ? errores.slice(0, 3).join(' | ') : null,
    }).eq('id', p.id)
  }
  return { procesados: (pendientes ?? []).length, entregados }
}
