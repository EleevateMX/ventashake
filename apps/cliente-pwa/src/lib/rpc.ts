import type { ShakeClient } from '@shake/supabase'

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que
// packages/supabase). Las funciones nuevas de la app (fn_mi_perfil,
// fn_soy_personal…) viven aquí hasta que se regeneren los tipos.
type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
export async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/** Los errores crudos no le sirven a nadie parado en la barra. */
export function amable(e: unknown): string {
  const texto = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')
  const raw = texto.toLowerCase()
  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider')) {
    return 'Rewards estará disponible en un momentito. Estamos afinando el acceso — vuelve a intentar muy pronto.'
  }
  if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('network') || raw.includes('load failed')) {
    return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
  }
  // El mensaje de Postgres tal cual suele ser legible («Esa tarjeta ya se canjeó»).
  if (texto && !/^\{|non-2xx|status code|jwt|token/i.test(texto)) return texto
  return 'Algo salió mal. Inténtalo de nuevo en un momento.'
}

/** El cuerpo JSON que una Edge Function puso en una respuesta de error. */
export async function errorDeFuncion(error: unknown, porOmision: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    const j = await ctx.json().catch(() => null)
    if (j?.error?.mensaje) return String(j.error.mensaje)
  }
  return porOmision
}
