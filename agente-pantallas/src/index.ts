import 'dotenv/config'
import { hostname } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { descubrir, describir, estado, poner, type Pantalla } from './dlna.js'
import {
  obtenerAsignaciones, reportar, LlaveInvalida,
  type PantallaAsignada, type Reporte, type EstadoReporte,
} from './asignaciones.js'
import { log } from './log.js'

const VERSION = '1.1.0'

const env = (k: string, d = '') => process.env[k]?.trim() || d
const num = (k: string, d: number) => Number(env(k)) || d

const SUPABASE_URL = env('SUPABASE_URL')
const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY')
const TOKEN = env('PANTALLAS_TOKEN')
const RPC_ASIGNACIONES = env('RPC_ASIGNACIONES') || null
const RPC_REPORTE = env('RPC_REPORTE') || null
const ASIGNACIONES_ARCHIVO = env('ASIGNACIONES_ARCHIVO') || null
const AGENTE = env('AGENTE_NOMBRE', hostname())

/** Cada cuanto se pide la asignacion. Es tambien el latido: 30-60 s. */
const CICLO_S = Math.min(60, Math.max(30, num('CICLO_SEGUNDOS', 45)))
/** Reporte forzado aunque nada cambie. El contrato pide 2 min por TV. */
const REPORTE_S = num('REPORTE_SEGUNDOS', 90)
const REDESCUBRIR_S = num('REDESCUBRIR_SEGUNDOS', 300)
/** Latido del motor de rotacion. Fino para que los segundos se respeten. */
const TIC_MS = 1000
/** Registrar cada avance de diapositiva. Util al instalar, ruidoso a diario. */
const VERBOSO = env('VERBOSO') === '1'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY. Copia .env.example como .env.')
  process.exit(1)
}
if (!TOKEN && !ASIGNACIONES_ARCHIVO) {
  console.error('Falta PANTALLAS_TOKEN. Generala en Admin -> Pantallas -> "Generar llave del empujador".')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

/** Lo que el agente sabe de cada TV entre vueltas. */
interface EstadoTv {
  asignada: PantallaAsignada
  /** Indice de la diapositiva puesta. */
  i: number
  /** Cuando se empujo (ms). 0 = nunca. */
  puestoEn: number
  /** `reenganchar_desde` ya atendido, para no repetirlo en cada vuelta. */
  reenganchado: string | null
  ultimoReporte: Reporte | null
  reportadoEn: number
}

const tvs = new Map<string, EstadoTv>()        // por id de pantalla
const enRed = new Map<string, Pantalla>()      // por ip
let ultimoDescubrimiento = 0

async function refrescarRed(forzar = false): Promise<void> {
  if (!forzar && Date.now() - ultimoDescubrimiento < REDESCUBRIR_S * 1000) return
  ultimoDescubrimiento = Date.now()
  for (const [ip, { loc }] of await descubrir()) {
    if (enRed.has(ip)) continue
    const p = await describir(loc)
    if (p) { enRed.set(ip, p); log.info(`encontrada "${p.nombre}"`, p.ip) }
  }
}

async function sincronizarAsignaciones(): Promise<void> {
  const lista = await obtenerAsignaciones(sb, {
    rpc: RPC_ASIGNACIONES, archivo: ASIGNACIONES_ARCHIVO,
    token: TOKEN, version: VERSION, agente: AGENTE,
  })

  const vistos = new Set<string>()
  for (const a of lista) {
    vistos.add(a.id)
    const prev = tvs.get(a.id)
    if (!prev) {
      tvs.set(a.id, { asignada: a, i: 0, puestoEn: 0, reenganchado: null, ultimoReporte: null, reportadoEn: 0 })
      continue
    }
    // Si cambiaron las imagenes, se vuelve a empezar por la primera en vez
    // de quedarse en un indice que ya no apunta a lo mismo.
    const antes = prev.asignada.diapositivas.map(d => d.id).join('|')
    const ahora = a.diapositivas.map(d => d.id).join('|')
    prev.asignada = a
    if (antes !== ahora) { prev.i = 0; prev.puestoEn = 0 }
  }
  // Una TV que ya no viene en la asignacion se olvida: dejo de tocarla.
  for (const id of [...tvs.keys()]) if (!vistos.has(id)) tvs.delete(id)
}

function anotar(e: EstadoTv, estadoR: EstadoReporte, mostrando: string | null,
                transporte: string | null, err: string | null): void {
  e.ultimoReporte = { id: e.asignada.id, estado: estadoR, mostrando, transporte, error: err }
}

/** Decide y aplica lo que toca en una TV. Devuelve true si se empujo algo. */
async function atender(e: EstadoTv, ahora: number): Promise<boolean> {
  const a = e.asignada

  // `pedidos` y `nada` no se tocan: esas las pone el navegador de la TV.
  if (a.diapositivas.length === 0) {
    anotar(e, 'mostrando', null, null, null)
    return false
  }

  const p = enRed.get(a.ip)
  if (!p) {
    anotar(e, 'sin_respuesta', null, null, 'no esta en la red (apagada o en standby)')
    return false
  }

  const actual = e.asignada.diapositivas[e.i] ?? e.asignada.diapositivas[0]!
  const est = await estado(p)

  if (!est) {
    anotar(e, 'sin_respuesta', null, null, 'no contesta DLNA')
    return false
  }

  // Gerencia toco "Volver a poner su contenido".
  const pidenReenganche =
    a.reenganchar_desde != null && a.reenganchar_desde !== e.reenganchado

  // Alguien le cambio la entrada o la detuvo.
  const seSalio = est.uri !== actual.url || est.transporte === 'STOPPED' ||
                  est.transporte === 'NO_MEDIA_PRESENT'

  // Le toca la siguiente diapositiva.
  const toca = e.puestoEn > 0 && ahora - e.puestoEn >= actual.segundos * 1000

  if (est.transporte === 'TRANSITIONING') {
    anotar(e, 'mostrando', actual.nombre, est.transporte, null)
    return false
  }

  if (!pidenReenganche && !seSalio && !toca && e.puestoEn > 0) {
    anotar(e, 'mostrando', actual.nombre, est.transporte, null)
    return false
  }

  // Avanzar solo cuando el motivo es que se cumplio el tiempo. Si se salio
  // de la entrada, se repone LA MISMA: saltarse una imagen cada vez que
  // alguien toca el control haria que unas se vieran y otras no.
  if (toca && !seSalio && !pidenReenganche && a.diapositivas.length > 1) {
    e.i = (e.i + 1) % a.diapositivas.length
  }
  const siguiente = a.diapositivas[e.i]!
  const primera = e.puestoEn === 0

  const ok = await poner(p, siguiente.url, siguiente.nombre, 'imagen')
  e.puestoEn = ahora
  if (pidenReenganche) e.reenganchado = a.reenganchar_desde

  if (ok) {
    if (seSalio) {
      log.info(`reenganchada en "${siguiente.nombre}" (estaba en ${est.transporte})`, a.nombre)
    } else if (primera) {
      log.info(`mostrando "${siguiente.nombre}"`, a.nombre)
    } else if (VERBOSO) {
      log.info(`avanza a "${siguiente.nombre}"`, a.nombre)
    }
    anotar(e, seSalio ? 'otra_entrada' : 'mostrando', siguiente.nombre, 'PLAYING', null)
  } else {
    log.aviso(`no acepto "${siguiente.nombre}"`, a.nombre)
    anotar(e, 'error', null, est.transporte, `la TV rechazo ${siguiente.url}`)
  }
  return true
}

function cambio(a: Reporte | null, b: Reporte | null): boolean {
  if (!a || !b) return true
  return a.estado !== b.estado || a.mostrando !== b.mostrando || a.transporte !== b.transporte
}

async function vuelta(pedirAsignacion: boolean): Promise<void> {
  if (pedirAsignacion) {
    await sincronizarAsignaciones()
    await refrescarRed()
  }
  if (tvs.size === 0) return

  const ahora = Date.now()
  const pendientes: Reporte[] = []

  for (const e of tvs.values()) {
    const antes = e.ultimoReporte
    await atender(e, ahora)
    const r = e.ultimoReporte
    if (!r) continue
    // Se reporta al cambiar algo, y si no, cada REPORTE_SEGUNDOS.
    if (cambio(antes, r) || ahora - e.reportadoEn >= REPORTE_S * 1000) {
      pendientes.push(r)
      e.reportadoEn = ahora
    }
  }

  if (pendientes.length > 0) {
    await reportar(sb, RPC_REPORTE, TOKEN, pendientes)
    const mal = pendientes.filter(r => r.estado !== 'mostrando')
    for (const r of mal) {
      const tv = [...tvs.values()].find(x => x.asignada.id === r.id)
      log.aviso(`${tv?.asignada.nombre ?? r.id}: ${r.estado}${r.error ? ' — ' + r.error : ''}`)
    }
  }
}

async function main(): Promise<void> {
  log.info(`Agente de PANTALLAS v${VERSION} — ${AGENTE}`)
  log.info(`origen: ${ASIGNACIONES_ARCHIVO ? `archivo ${ASIGNACIONES_ARCHIVO}` : `rpc ${RPC_ASIGNACIONES ?? '(sin definir)'}`}`)
  if (!RPC_REPORTE) log.aviso('sin RPC_REPORTE: el estado solo sale por consola')

  await refrescarRed(true)

  let ultimaAsignacion = 0
  for (;;) {
    const ahora = Date.now()
    const toca = ahora - ultimaAsignacion >= CICLO_S * 1000
    try {
      await vuelta(toca)
      if (toca) ultimaAsignacion = ahora
    } catch (e) {
      if (e instanceof LlaveInvalida) {
        // Reintentar en bucle con una llave muerta solo llena el log. Se
        // para en seco para que el servicio lo marque como caido y alguien
        // mire el .env.
        log.error(e.message)
        process.exit(1)
      }
      log.error(e instanceof Error ? e.message : String(e))
      if (toca) ultimaAsignacion = ahora
    }
    await new Promise(r => setTimeout(r, TIC_MS))
  }
}

void main()
