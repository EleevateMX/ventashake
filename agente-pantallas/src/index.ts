import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { descubrir, describir, estado, poner, type Pantalla } from './dlna.js'
import { obtenerAsignaciones, reportar, type Asignacion, type Reporte } from './asignaciones.js'
import { log } from './log.js'

var VERSION = '1.0.0'

const env = (k: string, d = '') => process.env[k]?.trim() || d
const num = (k: string, d: number) => Number(env(k)) || d

const SUPABASE_URL = env('SUPABASE_URL')
const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY')
const RPC_ASIGNACIONES = env('RPC_ASIGNACIONES') || null
const RPC_REPORTE = env('RPC_REPORTE') || null
const ASIGNACIONES_ARCHIVO = env('ASIGNACIONES_ARCHIVO') || null
const CICLO_S = num('CICLO_SEGUNDOS', 20)
const REDESCUBRIR_S = num('REDESCUBRIR_SEGUNDOS', 300)

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY. Copia .env.example como .env.')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

/** Teles vistas en la red, por IP. Se refresca cada REDESCUBRIR_SEGUNDOS. */
const pantallas = new Map<string, Pantalla>()
let ultimoDescubrimiento = 0

async function refrescarPantallas(forzar = false): Promise<void> {
  if (!forzar && Date.now() - ultimoDescubrimiento < REDESCUBRIR_S * 1000) return
  ultimoDescubrimiento = Date.now()

  const hallazgos = await descubrir()
  let nuevas = 0
  for (const [ip, { loc }] of hallazgos) {
    if (pantallas.has(ip)) continue
    const p = await describir(loc)
    if (p) { pantallas.set(ip, p); nuevas++; log.info(`encontrada "${p.nombre}"`, p.ip) }
  }
  if (nuevas === 0 && pantallas.size === 0) {
    log.aviso('ninguna tele respondio al descubrimiento')
  }
}

/**
 * Decide si hay que volver a empujar.
 *
 * Se compara contra lo que la tele DICE que esta reproduciendo, no contra lo
 * que se le mando la vez pasada. Si alguien cambio a HDMI o apago la tele, el
 * estado real lo delata y se reengancha sola. Confiar en la memoria del
 * agente es justo como las pantallas amanecen en negro.
 */
function hayQueEmpujar(est: Awaited<ReturnType<typeof estado>>, a: Asignacion): { si: boolean; motivo: string } {
  if (!est) return { si: false, motivo: 'no responde' }
  if (est.transporte === 'TRANSITIONING') return { si: false, motivo: 'cambiando' }
  if (est.uri !== a.url) return { si: true, motivo: `mostraba ${est.uri ?? 'nada'}` }
  if (est.transporte !== 'PLAYING') return { si: true, motivo: `estaba en ${est.transporte}` }
  return { si: false, motivo: 'al dia' }
}

async function unaVuelta(): Promise<void> {
  let asignaciones: Asignacion[]
  try {
    asignaciones = await obtenerAsignaciones(sb, RPC_ASIGNACIONES, ASIGNACIONES_ARCHIVO)
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e))
    return
  }
  if (asignaciones.length === 0) return

  await refrescarPantallas()
  const reportes: Reporte[] = []

  for (const a of asignaciones) {
    const p = pantallas.get(a.ip)
    const nombre = a.nombre ?? p?.nombre ?? a.ip

    if (!p) {
      // Puede estar en standby: en VIDAA el renderer DLNA desaparece con la
      // pantalla apagada y vuelve sola al encenderla.
      reportes.push({ ip: a.ip, nombre, mostrando: null, transporte: 'SIN_RESPUESTA',
                      correcto: false, detalle: 'no esta en la red (apagada o en standby)' })
      continue
    }

    if (a.activa === false) {
      reportes.push({ ip: a.ip, nombre, mostrando: null, transporte: 'DESACTIVADA', correcto: true })
      continue
    }

    const est = await estado(p)
    const { si, motivo } = hayQueEmpujar(est, a)

    if (si) {
      const ok = await poner(p, a.url, a.titulo ?? 'Shakeaholic', a.tipo ?? 'imagen')
      log.info(ok ? `reenganchada (${motivo})` : `NO acepto el contenido (${motivo})`, nombre)
      reportes.push({ ip: a.ip, nombre, mostrando: ok ? a.url : est?.uri ?? null,
                      transporte: ok ? 'PLAYING' : est?.transporte ?? 'DESCONOCIDO',
                      correcto: ok, detalle: ok ? `reenganchada: ${motivo}` : 'rechazo el contenido' })
    } else {
      reportes.push({ ip: a.ip, nombre, mostrando: est?.uri ?? null,
                      transporte: est?.transporte ?? 'SIN_RESPUESTA',
                      correcto: motivo === 'al dia',
                      ...(motivo === 'al dia' ? {} : { detalle: motivo }) })
    }
  }

  await reportar(sb, RPC_REPORTE, reportes)

  const bien = reportes.filter(r => r.correcto).length
  log.info(`${bien}/${reportes.length} pantallas en su contenido`)
  for (const r of reportes.filter(x => !x.correcto)) {
    log.aviso(`${r.nombre}: ${r.detalle ?? r.transporte}`)
  }
}

async function main(): Promise<void> {
  log.info(`Agente de PANTALLAS v${VERSION}`)
  log.info(`origen: ${ASIGNACIONES_ARCHIVO ? `archivo ${ASIGNACIONES_ARCHIVO}` : `rpc ${RPC_ASIGNACIONES ?? '(sin definir)'}`}`)
  if (!RPC_REPORTE) log.aviso('sin RPC_REPORTE: el estado solo sale por consola')

  await refrescarPantallas(true)

  // Secuencial: dos vueltas solapadas se pisarian empujando la misma tele.
  for (;;) {
    try { await unaVuelta() } catch (e) {
      log.error(e instanceof Error ? e.message : String(e))
    }
    await new Promise(r => setTimeout(r, CICLO_S * 1000))
  }
}

void main()
