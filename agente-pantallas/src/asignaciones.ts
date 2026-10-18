import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from './log.js'

/**
 * Contrato con la base. Ver `docs/pantallas-tv.md`.
 *
 * Las dos funciones van firmadas con la llave del empujador (Admin ->
 * Pantallas -> "Generar llave"). Esa llave vive en el .env de esta PC y en
 * ningun otro lado: la base solo guarda su hash.
 */

export interface Diapositiva {
  id: string
  nombre: string
  url: string
  /** Ya viene resuelto: el de la imagen, o el de la TV si la imagen no trae. */
  segundos: number
}

export interface PantallaAsignada {
  id: string
  nombre: string
  ip: string
  contenido: 'promos' | 'menu' | 'pedidos' | 'nada'
  segundos: number
  /** Si es mas nuevo que el ultimo empuje, gerencia pidio reenganchar ya. */
  reenganchar_desde: string | null
  /** Vacia para `pedidos` y `nada`: a esas TVs no se les toca. */
  diapositivas: Diapositiva[]
}

export type EstadoReporte = 'mostrando' | 'sin_respuesta' | 'otra_entrada' | 'error'

export interface Reporte {
  id: string
  estado: EstadoReporte
  /** Nombre de la diapositiva que esta puesta, no su URL. */
  mostrando: string | null
  transporte: string | null
  error: string | null
}

/** La llave es invalida (P0001 / hint `llave_invalida`), no un fallo de red. */
export class LlaveInvalida extends Error {}

function normalizarPantalla(f: Record<string, unknown>): PantallaAsignada | null {
  const s = (k: string) => (typeof f[k] === 'string' && (f[k] as string).trim() ? (f[k] as string).trim() : null)
  const id = s('id')
  const ip = s('ip')
  if (!id || !ip) return null

  const contenido = (s('contenido') ?? 'nada') as PantallaAsignada['contenido']
  const segundos = Math.max(3, Number(f['segundos']) || 12)

  const brutas = Array.isArray(f['diapositivas']) ? (f['diapositivas'] as unknown[]) : []
  const diapositivas: Diapositiva[] = []
  for (const d of brutas) {
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const url = typeof o['url'] === 'string' ? o['url'].trim() : ''
    if (!url) continue
    diapositivas.push({
      id: String(o['id'] ?? url),
      nombre: typeof o['nombre'] === 'string' && o['nombre'].trim() ? o['nombre'].trim() : 'Sin nombre',
      url,
      segundos: Math.max(3, Number(o['segundos']) || segundos),
    })
  }

  // Compatibilidad: si la fila trae `url` suelta y ninguna diapositiva, se
  // trata como una sola. Asi el agente sigue sirviendo contra un JSON local.
  if (diapositivas.length === 0) {
    const url = s('url')
    if (url) diapositivas.push({ id: url, nombre: s('titulo') ?? 'Contenido', url, segundos })
  }

  return {
    id, ip,
    nombre: s('nombre') ?? ip,
    contenido,
    segundos,
    reenganchar_desde: s('reenganchar_desde'),
    diapositivas,
  }
}

export async function obtenerAsignaciones(
  sb: SupabaseClient,
  opciones: { rpc: string | null; archivo: string | null; token: string; version: string; agente: string },
): Promise<PantallaAsignada[]> {
  let crudo: unknown

  if (opciones.archivo) {
    crudo = JSON.parse(readFileSync(opciones.archivo, 'utf8'))
  } else if (opciones.rpc) {
    const { data, error } = await sb.rpc(opciones.rpc, {
      p_token: opciones.token,
      p_version: opciones.version,
      p_agente: opciones.agente,
    })
    if (error) {
      const pista = `${error.hint ?? ''} ${error.message}`.toLowerCase()
      if (pista.includes('llave_invalida')) {
        throw new LlaveInvalida('La llave del empujador no sirve. Genera otra en Admin -> Pantallas.')
      }
      throw new Error(`${opciones.rpc}: ${error.message}`)
    }
    crudo = data
  } else {
    throw new Error('Falta RPC_ASIGNACIONES (o ASIGNACIONES_ARCHIVO) en el .env')
  }

  const filas: unknown[] = Array.isArray(crudo)
    ? crudo
    : Array.isArray((crudo as Record<string, unknown>)?.['pantallas'])
      ? ((crudo as Record<string, unknown>)['pantallas'] as unknown[])
      : []

  const salida: PantallaAsignada[] = []
  for (const f of filas) {
    if (!f || typeof f !== 'object') continue
    const p = normalizarPantalla(f as Record<string, unknown>)
    if (p) salida.push(p)
    else log.aviso(`fila ignorada, falta id o ip: ${Object.keys(f as object).join(', ')}`)
  }
  return salida
}

export async function reportar(
  sb: SupabaseClient, rpc: string | null, token: string, reportes: Reporte[],
): Promise<void> {
  if (!rpc || reportes.length === 0) return
  // Tope del contrato: 50 TVs por llamada.
  for (let i = 0; i < reportes.length; i += 50) {
    const lote = reportes.slice(i, i + 50).map(r => ({
      ...r,
      error: r.error ? r.error.slice(0, 2000) : null,
    }))
    const { error } = await sb.rpc(rpc, { p_token: token, p_reportes: lote })
    if (error) log.error(`${rpc}: ${error.message}`)
  }
}
