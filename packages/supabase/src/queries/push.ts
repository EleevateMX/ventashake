import type { ShakeClient } from '../client'

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que clientes.ts).
type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/**
 * Avisos push de la app de Rewards (Admin → Avisos).
 *
 * La pantalla no manda nada a Apple: manda la campaña a la Edge Function
 * `push-enviar`, que comprueba que quien llama es gerencia, encola una fila
 * por cliente y la vacía en el momento. Lo automático (mancuernas
 * acreditadas) no pasa por aquí: lo encola un trigger en la base.
 */

export interface AvisoEnviado {
  id: string
  titulo: string
  cuerpo: string
  destino: 'todos' | 'cliente'
  cliente: string | null
  destinatarios: number
  entregados: number
  por: string | null
  creado_en: string
}

export interface ResumenPush {
  telefonos: number
  clientes: number
  pendientes: number
}

export async function resumenPush(sb: ShakeClient): Promise<ResumenPush | null> {
  return (await rpc<ResumenPush | null>(sb, 'fn_push_resumen')) ?? null
}

export async function avisosEnviados(sb: ShakeClient, n = 30): Promise<AvisoEnviado[]> {
  return (await rpc<AvisoEnviado[] | null>(sb, 'fn_push_envios', { p_n: n })) ?? []
}

export async function enviarAviso(
  sb: ShakeClient,
  aviso: { titulo: string; cuerpo: string; destino: 'todos' | 'cliente'; cliente_id?: string | null },
): Promise<{ destinatarios: number; entregados: number }> {
  const { data, error } = await sb.functions.invoke('push-enviar', { body: aviso })
  if (error) {
    // La función contesta JSON con el motivo; sin eso solo diría "non-2xx".
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null)
      if (j?.error?.mensaje) throw new Error(j.error.mensaje)
    }
    throw error
  }
  if (!data?.ok) throw new Error(data?.error?.mensaje ?? 'No se pudo mandar el aviso.')
  return { destinatarios: Number(data.destinatarios ?? 0), entregados: Number(data.entregados ?? 0) }
}
