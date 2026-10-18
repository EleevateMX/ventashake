import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from './log.js'

/**
 * De donde sale "que muestra cada tele".
 *
 * La funcion de la base la construye la otra sesion y su nombre todavia no
 * esta definido, asi que NO se escribe a mano en el codigo: viene de
 * `RPC_ASIGNACIONES` en el .env. Enchufarla el dia que exista es cambiar una
 * linea del .env, sin recompilar ni volver a desplegar el agente.
 *
 * Mientras tanto, `ASIGNACIONES_ARCHIVO` permite correrlo contra un JSON
 * local y probar el empujador de verdad contra las teles.
 */

export interface Asignacion {
  /** IP de la tele. Es la llave: es lo unico que el empujador puede resolver solo. */
  ip: string
  /** Para los logs y el reporte. Si falta se usa el nombre que dice la tele. */
  nombre?: string
  /** URL del contenido. Tiene que ser alcanzable DESDE la tele, no desde esta PC. */
  url: string
  tipo?: 'imagen' | 'video'
  /** Titulo que se manda en los metadatos DIDL. */
  titulo?: string
  /** `false` deja la tele en paz: ni se empuja ni se reengancha. */
  activa?: boolean
}

/** Acepta varias formas razonables de nombrar los campos. */
function normalizar(fila: Record<string, unknown>): Asignacion | null {
  const s = (...claves: string[]): string | undefined => {
    for (const k of claves) {
      const v = fila[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return undefined
  }
  const ip = s('ip', 'ip_pantalla', 'host', 'direccion_ip')
  const url = s('url', 'contenido_url', 'media_url', 'uri')
  if (!ip || !url) return null

  const tipoBruto = (s('tipo', 'tipo_contenido', 'clase') ?? '').toLowerCase()
  const activa = fila['activa'] ?? fila['activo'] ?? fila['habilitada']

  return {
    ip,
    nombre: s('nombre', 'pantalla', 'titulo_pantalla'),
    url,
    // Por defecto imagen: un video mal clasificado se queda en negro, una
    // imagen mal clasificada igual se pinta.
    tipo: tipoBruto.includes('video') ? 'video' : 'imagen',
    titulo: s('titulo', 'descripcion', 'nombre') ?? 'Shakeaholic',
    activa: activa === undefined ? true : Boolean(activa),
  }
}

export async function obtenerAsignaciones(
  sb: SupabaseClient, rpc: string | null, archivo: string | null,
): Promise<Asignacion[]> {
  let crudo: unknown

  if (archivo) {
    crudo = JSON.parse(readFileSync(archivo, 'utf8'))
  } else if (rpc) {
    const { data, error } = await sb.rpc(rpc)
    if (error) throw new Error(`${rpc}: ${error.message}`)
    crudo = data
  } else {
    throw new Error('Falta RPC_ASIGNACIONES (o ASIGNACIONES_ARCHIVO) en el .env')
  }

  // La funcion puede devolver un arreglo, o un objeto con las filas dentro.
  const filas: unknown[] = Array.isArray(crudo)
    ? crudo
    : Array.isArray((crudo as Record<string, unknown>)?.['pantallas'])
      ? ((crudo as Record<string, unknown>)['pantallas'] as unknown[])
      : []

  const salida: Asignacion[] = []
  for (const f of filas) {
    if (f && typeof f === 'object') {
      const a = normalizar(f as Record<string, unknown>)
      if (a) salida.push(a)
      // Una fila que no se entiende se dice en voz alta con sus llaves: es
      // la pista que hace falta para ajustar el mapeo en un minuto.
      else log.aviso(`fila ignorada, no trae ip+url: ${Object.keys(f as object).join(', ')}`)
    }
  }
  return salida
}

/** Lo que el empujador reporta de vuelta por cada tele. */
export interface Reporte {
  ip: string
  nombre: string
  /** Lo que la tele dice que esta reproduciendo AHORA, no lo que se le mando. */
  mostrando: string | null
  transporte: string
  /** ¿Coincide con lo asignado? */
  correcto: boolean
  /** Motivo cuando no coincide o no se pudo hablar con ella. */
  detalle?: string
}

export async function reportar(
  sb: SupabaseClient, rpc: string | null, reportes: Reporte[],
): Promise<void> {
  if (!rpc || reportes.length === 0) return
  const { error } = await sb.rpc(rpc, { p_reportes: reportes })
  if (error) log.error(`${rpc}: ${error.message}`)
}
