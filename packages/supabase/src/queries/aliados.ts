import type { ShakeClient } from '../client'

/**
 * Aliados: las marcas con las que colaboramos, para la app de Rewards.
 * Se administran en Admin → Aliados; la app los lee con `listarAliados`
 * (función pública: es publicidad).
 */

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que clientes.ts).
type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

export interface Aliado {
  id: string
  nombre: string
  descripcion: string | null
  logo_url: string | null
  promo_titulo: string | null
  promo_texto: string | null
  web: string | null
  whatsapp: string | null
  instagram: string | null
  telefono: string | null
  direccion: string | null
  orden: number
  activo: boolean
}

export type AliadoInput = Omit<Aliado, 'id' | 'activo' | 'orden'> & { id?: string | null; orden?: number; activo?: boolean }

export async function listarAliados(sb: ShakeClient): Promise<Aliado[]> {
  return (await rpc<Aliado[] | null>(sb, 'fn_aliados')) ?? []
}

export async function aliadosAdmin(sb: ShakeClient): Promise<Aliado[]> {
  return (await rpc<Aliado[] | null>(sb, 'fn_aliados_admin')) ?? []
}

export async function guardarAliado(sb: ShakeClient, a: AliadoInput): Promise<Aliado> {
  return rpc<Aliado>(sb, 'fn_aliado_guardar', { p: a })
}

export async function borrarAliado(sb: ShakeClient, id: string): Promise<void> {
  await rpc<unknown>(sb, 'fn_aliado_borrar', { p_id: id })
}

/** Sube el logo al bucket público `aliados` y devuelve su URL. */
export async function subirLogoAliado(sb: ShakeClient, archivo: File): Promise<string> {
  const ext = (archivo.name.split('.').pop() ?? 'png').toLowerCase()
  const ruta = `logos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await sb.storage.from('aliados').upload(ruta, archivo, { upsert: false, contentType: archivo.type })
  if (error) throw error
  return sb.storage.from('aliados').getPublicUrl(ruta).data.publicUrl
}
