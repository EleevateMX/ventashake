import { readFileSync } from 'node:fs'
import 'dotenv/config'
import type { PrinterConfig } from './types.js'

export interface AgenteConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  agenteId: string
  pollIntervaloMs: number
  latidoIntervaloMs: number
  statusHttpPuerto: number
  printers: PrinterConfig[]
}

function requerido(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copia .env.example a .env y llénalo.`,
    )
  }
  return valor
}

export function cargarConfig(): AgenteConfig {
  const supabaseUrl = requerido('SUPABASE_URL')
  const supabaseAnonKey = requerido('SUPABASE_ANON_KEY')
  const agenteId = process.env.AGENTE_ID ?? `agente-${process.pid}`
  const pollIntervaloMs = Number(process.env.POLL_INTERVALO_SEGUNDOS ?? '10') * 1000
  const latidoIntervaloMs = Number(process.env.LATIDO_INTERVALO_SEGUNDOS ?? '30') * 1000
  const statusHttpPuerto = Number(process.env.STATUS_HTTP_PUERTO ?? '7777')
  const printersPath = process.env.PRINTERS_CONFIG_PATH ?? './printers.config.json'

  let printers: PrinterConfig[]
  try {
    const raw = readFileSync(printersPath, 'utf8')
    printers = JSON.parse(raw) as PrinterConfig[]
  } catch (e) {
    throw new Error(
      `No se pudo leer ${printersPath}. Copia printers.config.example.json a ` +
        `printers.config.json y configura al menos una impresora. (${e instanceof Error ? e.message : String(e)})`,
    )
  }

  if (!Array.isArray(printers) || printers.length === 0) {
    throw new Error(`${printersPath} debe tener al menos una impresora configurada.`)
  }
  for (const p of printers) {
    if (!p.id || !p.token || !p.interface) {
      throw new Error(`Impresora inválida en ${printersPath}: faltan id/token/interface — ${JSON.stringify(p)}`)
    }
  }

  return { supabaseUrl, supabaseAnonKey, agenteId, pollIntervaloMs, latidoIntervaloMs, statusHttpPuerto, printers }
}
