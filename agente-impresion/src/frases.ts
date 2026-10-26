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
 *
 * Desde la 1.7.0 (26/10/26) la base manda además una lista POR ESTACIÓN
 * (`por_estacion`): una frase puede ir solo a barra, solo a cocina o a las
 * dos, y las de siempre se apagan como grupo. Ahí una lista vacía es una
 * decisión de gerencia —no sale frase en esa estación— y se respeta.
 */

export interface FraseVigente {
  texto: string
  /** Imprimir a Milo junto a la frase. */
  milo: boolean
}

const ARCHIVO = join(process.cwd(), 'frases-cache.json')
const CADA_MS = 10 * 60_000

let vigentes: FraseVigente[] | null = null
let porEstacion: Record<string, FraseVigente[]> | null = null
let temporada: string | null = null
let timer: ReturnType<typeof setInterval> | null = null

function respaldo(): FraseVigente[] {
  return FRASES.map((texto) => ({ texto, milo: false }))
}

const limpias = (l: unknown): FraseVigente[] =>
  (Array.isArray(l) ? l : []).filter((f): f is FraseVigente => typeof f?.texto === 'string' && f.texto.trim() !== '')
    .map((f) => ({ texto: f.texto, milo: f.milo === true }))

/** `{Bebidas: [...], Alimentos: [...]}` tal como lo manda la base; null si no viene. */
function leerPorEstacion(x: unknown): Record<string, FraseVigente[]> | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const r: Record<string, FraseVigente[]> = {}
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) r[k.toLowerCase()] = limpias(v)
  return r
}

function leerDisco(): void {
  try {
    const d = JSON.parse(readFileSync(ARCHIVO, 'utf8').replace(/^\uFEFF/, '')) as {
      frases?: FraseVigente[]; temporada?: string | null; por_estacion?: unknown
    }
    const pe = leerPorEstacion(d.por_estacion)
    if ((Array.isArray(d.frases) && d.frases.length > 0) || pe) {
      vigentes = limpias(d.frases)
      porEstacion = pe
      temporada = d.temporada ?? null
    }
  } catch {
    /* sin caché todavía: se usa el respaldo */
  }
}

/**
 * La lista con la que se imprime ahora mismo en esa estación.
 * Sin estación, o si la base no mandó listas por estación, la de siempre
 * (nunca vacía). Con lista por estación, puede venir vacía a propósito:
 * gerencia apagó lo que salía ahí, y la etiqueta sale sin frase.
 */
export function frasesVigentes(estacion?: string | null): FraseVigente[] {
  if (vigentes === null && porEstacion === null) leerDisco()
  const clave = estacion?.trim().toLowerCase()
  if (porEstacion && clave && clave in porEstacion) return porEstacion[clave]
  return vigentes && vigentes.length > 0 ? vigentes : respaldo()
}

export function temporadaVigente(): string | null {
  return temporada
}

/** Solo para pruebas: fija la lista sin red ni disco. */
export function fijarFrasesParaPrueba(
  lista: FraseVigente[] | null, temp: string | null = null,
  estaciones: Record<string, FraseVigente[]> | null = null,
): void {
  vigentes = lista
  porEstacion = estaciones ? leerPorEstacion(estaciones) : null
  temporada = temp
}

async function refrescar(sb: SupabaseClient, token: string): Promise<void> {
  const { data, error } = await sb.rpc('fn_imprimir_frases', { p_token: token })
  if (error) {
    // Sin red o sin la función (base vieja): se queda con lo que tenía.
    log.error(`No se pudieron leer las frases: ${error.message}`)
    return
  }
  const r = (data ?? {}) as { frases?: FraseVigente[]; temporada?: string | null; por_estacion?: unknown }
  const lista = limpias(r.frases)
  const pe = leerPorEstacion(r.por_estacion)
  // Sin listas por estación (base vieja), una lista vacía no borra lo que
  // hay: ahí imprimir sin frase no era una decisión de nadie. Con listas
  // por estación, sí lo es (apagaron las de siempre) y se respeta.
  if (lista.length === 0 && !pe) return
  const cambio = JSON.stringify(lista) !== JSON.stringify(vigentes)
    || JSON.stringify(pe) !== JSON.stringify(porEstacion)
    || (r.temporada ?? null) !== temporada
  vigentes = lista
  porEstacion = pe
  temporada = r.temporada ?? null
  if (cambio) {
    const resumen = pe ? Object.entries(pe).map(([k, v]) => `${k} ${v.length}`).join(', ') : String(lista.length)
    log.info(`Frases al día: ${resumen}${temporada ? ` (temporada ${temporada})` : ''}`)
    try {
      writeFileSync(ARCHIVO, JSON.stringify({ frases: lista, por_estacion: pe, temporada, guardado: new Date().toISOString() }, null, 2))
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
