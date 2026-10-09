import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FRASES } from './tspl.js'
import { log } from './log.js'

/**
 * Las frases del pie, como las decide gerencia en Admin → Impresoras
 * (09/10/26, agente 1.5.0).
 *
 * Antes estaban escritas aquí (`FRASES` en tspl.ts) y cambiar una era sacar
 * una versión nueva del agente. Ahora viven en la base, por temporada
 * (Halloween, Navidad…), y el agente las pide con su token cada 10 minutos
 * (`fn_imprimir_frases`). La base ya resuelve cuál temporada toca hoy en
 * Mérida: aquí solo se guarda la lista.
 *
 * Tres capas, de la más nueva a la de respaldo, para que nunca falte una:
 *   1. la última respuesta de la base (en memoria);
 *   2. la misma, guardada en disco — sin internet o recién reiniciada la PC
 *      se sigue imprimiendo la de la temporada;
 *   3. `FRASES` del código, si nunca se ha podido bajar nada.
 */

export interface FraseVigente {
  texto: string
  /** Imprimir a Milo junto a la frase. */
  milo: boolean
}

const ARCHIVO = join(process.cwd(), 'frases-cache.json')
const CADA_MS = 10 * 60_000

let vigentes: FraseVigente[] | null = null
let temporada: string | null = null
let timer: ReturnType<typeof setInterval> | null = null

function respaldo(): FraseVigente[] {
  return FRASES.map((texto) => ({ texto, milo: false }))
}

function leerDisco(): void {
  try {
    const d = JSON.parse(readFileSync(ARCHIVO, 'utf8').replace(/^\uFEFF/, '')) as {
      frases?: FraseVigente[]; temporada?: string | null
    }
    if (Array.isArray(d.frases) && d.frases.length > 0) {
      vigentes = d.frases.filter((f) => typeof f?.texto === 'string' && f.texto.trim())
      temporada = d.temporada ?? null
    }
  } catch {
    /* sin caché todavía: se usa el respaldo */
  }
}

/** La lista con la que se imprime ahora mismo. Nunca vacía. */
export function frasesVigentes(): FraseVigente[] {
  if (vigentes === null) leerDisco()
  return vigentes && vigentes.length > 0 ? vigentes : respaldo()
}

export function temporadaVigente(): string | null {
  return temporada
}

/** Solo para pruebas: fija la lista sin red ni disco. */
export function fijarFrasesParaPrueba(lista: FraseVigente[] | null, temp: string | null = null): void {
  vigentes = lista
  temporada = temp
}

async function refrescar(sb: SupabaseClient, token: string): Promise<void> {
  const { data, error } = await sb.rpc('fn_imprimir_frases', { p_token: token })
  if (error) {
    // Sin red o sin la función (base vieja): se queda con lo que tenía.
    log.error(`No se pudieron leer las frases: ${error.message}`)
    return
  }
  const r = (data ?? {}) as { frases?: FraseVigente[]; temporada?: string | null }
  const lista = (r.frases ?? []).filter((f) => typeof f?.texto === 'string' && f.texto.trim())
  // Una lista vacía (gerencia apagó todas) no borra lo que hay: imprimir
  // sin frase no es una decisión que alguien haya tomado.
  if (lista.length === 0) return
  const cambio = JSON.stringify(lista) !== JSON.stringify(vigentes) || (r.temporada ?? null) !== temporada
  vigentes = lista
  temporada = r.temporada ?? null
  if (cambio) {
    log.info(`Frases al día: ${lista.length}${temporada ? ` (temporada ${temporada})` : ''}`)
    try {
      writeFileSync(ARCHIVO, JSON.stringify({ frases: lista, temporada, guardado: new Date().toISOString() }, null, 2))
    } catch (e) {
      log.error(`No se pudo guardar ${ARCHIVO}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/** Se arranca una vez, con el cliente y el token de cualquier impresora. */
export function vigilarFrases(sb: SupabaseClient, token: string): void {
  if (timer) return
  leerDisco()
  void refrescar(sb, token)
  timer = setInterval(() => void refrescar(sb, token), CADA_MS)
}
