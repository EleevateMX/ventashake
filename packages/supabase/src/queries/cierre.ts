import type { ShakeClient } from '../client'

/**
 * Cierre diario consolidado e historial de ventas por periodo.
 *
 * Un día y un mes salen de la MISMA función (`fn_cierre_dias`): ventas por
 * método, los cortes de ese día y Clip tal como lo reporta Clip, separado
 * por terminal. Se calcula en vivo — si mañana se cancela una venta de hoy,
 * el historial se entera solo. Lo único que se guarda aparte son las
 * aclaraciones, con quién y cuándo.
 */

export type EstatusCierre = 'pendiente' | 'cuadrado' | 'con_diferencia' | 'aclarado'

export interface DiaDeCierre {
  dia: string
  ordenes: number
  venta_total: number
  ticket_promedio: number
  efectivo: number
  tarjeta: number
  clip: number
  cortesia: number
  otro: number
  cortes: number
  cortes_abiertos: number
  fondo_inicial: number
  efectivo_esperado: number
  efectivo_contado: number
  dif_efectivo: number
  /** Ya se bajó de Clip ese día (aunque no haya tenido transacciones). */
  clip_bajado: boolean
  /** Lo que reporta Clip de la terminal integrada. null = no se ha bajado. */
  clip_real: number | null
  /** Lo que reporta Clip de la terminal chica (lo que no empató). */
  tarjeta_real: number | null
  dif_clip: number | null
  dif_tarjeta: number | null
  dif_total: number
  estatus: EstatusCierre
  /** Por qué está pendiente, en palabras. */
  motivo: string | null
  notas: number
  ultima_nota: string | null
  ultima_nota_por: string | null
  ultima_nota_en: string | null
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

const NUMEROS: (keyof DiaDeCierre)[] = [
  'venta_total', 'ticket_promedio', 'efectivo', 'tarjeta', 'clip', 'cortesia', 'otro',
  'fondo_inicial', 'efectivo_esperado', 'efectivo_contado', 'dif_efectivo', 'dif_total',
]
const NUMEROS_NULOS: (keyof DiaDeCierre)[] = ['clip_real', 'tarjeta_real', 'dif_clip', 'dif_tarjeta']

export async function diasDeCierre(sb: ShakeClient, desde: string, hasta: string): Promise<DiaDeCierre[]> {
  const { data, error } = await (sb.rpc as unknown as Rpc)('fn_cierre_dias', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  // PostgREST manda los numeric como texto: se convierten aquí una vez.
  return ((data ?? []) as Record<string, unknown>[]).map((f) => {
    const o = { ...f } as Record<string, unknown>
    for (const k of NUMEROS) o[k] = Number(o[k] ?? 0)
    for (const k of NUMEROS_NULOS) o[k] = o[k] == null ? null : Number(o[k])
    return o as unknown as DiaDeCierre
  })
}

export interface NotaDeCierre {
  id: string
  nota: string
  creada_por: string | null
  creada_en: string
}

export async function notasDeCierre(sb: ShakeClient, dia: string): Promise<NotaDeCierre[]> {
  const { data, error } = await (sb.rpc as unknown as Rpc)('fn_cierre_dia_notas', { p_dia: dia })
  if (error) throw error
  return (data ?? []) as NotaDeCierre[]
}

/** Deja una aclaración del día. No se edita ni se borra: se agrega otra. */
export async function aclararCierre(sb: ShakeClient, dia: string, nota: string): Promise<void> {
  const { error } = await (sb.rpc as unknown as Rpc)('fn_cierre_dia_aclarar', { p_dia: dia, p_nota: nota })
  if (error) throw error
}

/**
 * Baja de Clip las transacciones de un día y las empata con los pagos
 * integrados (Edge Function `clip-transacciones`). Lo que no empata es de
 * la terminal chica.
 */
export async function bajarClipDelDia(
  sb: ShakeClient, dia: string,
): Promise<{ transacciones: number; llaves: string[] }> {
  const { data, error } = await sb.functions.invoke('clip-transacciones', { body: { dia } })
  if (error) {
    // El cuerpo del error trae el motivo que dio la función.
    const ctx = (error as { context?: Response }).context
    let msg = (error as Error).message
    try { if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg } catch { /* sin cuerpo */ }
    throw new Error(`No se pudo bajar de Clip el ${dia}: ${msg}`)
  }
  return data as { transacciones: number; llaves: string[] }
}

export interface TransaccionClip {
  receipt_no: string
  hora: string
  total: number
  status: string | null
  metodo: string | null
  last4: string | null
  /** principal = empató con un cobro integrado · chica = no empató con nada. */
  terminal: 'principal' | 'chica'
  folio: number | null
  referencia: string | null
}

export async function transaccionesClipDelDia(sb: ShakeClient, dia: string): Promise<TransaccionClip[]> {
  const { data, error } = await (sb.rpc as unknown as Rpc)('fn_clip_transacciones_dia', { p_dia: dia })
  if (error) throw error
  return ((data ?? []) as TransaccionClip[]).map((t) => ({ ...t, total: Number(t.total) }))
}
