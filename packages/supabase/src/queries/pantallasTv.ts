import type { ShakeClient } from '../client'

/**
 * Las TVs de la tienda (18/10/26, `pantallas_tv.sql`): qué le toca a cada una
 * y qué está mostrando. Las imágenes las manda por DLNA el «empujador», un
 * programa de la PC de la tienda; Admin solo asigna y lee lo que reporta.
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpc = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as Rpc)(fn, args)
  if (error) throw error
  return data as T
}

export type ContenidoTv = 'promos' | 'menu' | 'pedidos' | 'nada'

/** Lo que el empujador dice que pasó en la TV la última vez que la tocó. */
export interface ReporteTv {
  estado?: 'mostrando' | 'sin_respuesta' | 'otra_entrada' | 'error' | string
  mostrando?: string | null
  transporte?: string | null
  error?: string | null
}

export interface PantallaTv {
  id: string
  nombre: string
  ubicacion: string | null
  ip: string | null
  contenido: ContenidoTv
  segundos: number
  activa: boolean
  orden: number
  reenganchar_desde: string | null
  reporte: ReporteTv | null
  reportado_en: string | null
  hace_seg: number | null
}

export interface ImagenTv {
  id: string
  grupo: 'promos' | 'menu'
  nombre: string
  url: string
  ruta: string | null
  segundos: number | null
  activa: boolean
  orden: number
  desde: string | null
  hasta: string | null
  creado_en: string
}

export interface PantallasTvAdmin {
  ahora: string
  pantallas: PantallaTv[]
  imagenes: ImagenTv[]
  agente: {
    tiene_llave: boolean
    llave_creada_en: string | null
    llave_creada_por: string | null
    ultimo_latido: string | null
    version: string | null
    agente_id: string | null
    hace_seg: number | null
  } | null
  /** Navegadores abiertos en pantalla.shakeaholic.mx (la TV de pedidos). */
  pedidos: { pantalla: string; estado: { ua?: string; ancho?: number; alto?: number } | null; hace_seg: number }[]
}

export async function pantallasTvAdmin(sb: ShakeClient): Promise<PantallasTvAdmin> {
  const d = await rpc<PantallasTvAdmin>(sb, 'fn_pantallas_tv_admin')
  return { ...d, pantallas: d.pantallas ?? [], imagenes: d.imagenes ?? [], pedidos: d.pedidos ?? [] }
}

export async function guardarPantallaTv(
  sb: ShakeClient,
  p: Partial<Pick<PantallaTv, 'id' | 'nombre' | 'ubicacion' | 'ip' | 'contenido' | 'segundos' | 'activa' | 'orden'>>,
): Promise<string> {
  return rpc<string>(sb, 'fn_pantalla_tv_guardar', { p })
}

/** Pide al empujador volver a poner su contenido en esa TV (o en todas). */
export async function reengancharPantallaTv(sb: ShakeClient, id: string | null): Promise<number> {
  return rpc<number>(sb, 'fn_pantalla_tv_reenganchar', { p_id: id })
}

export async function guardarImagenTv(
  sb: ShakeClient,
  p: Partial<Pick<ImagenTv, 'id' | 'grupo' | 'nombre' | 'url' | 'ruta' | 'segundos' | 'activa' | 'orden' | 'desde' | 'hasta'>>,
): Promise<string> {
  return rpc<string>(sb, 'fn_pantalla_tv_imagen_guardar', { p })
}

/** Sube la imagen al bucket público `pantallas` y devuelve URL y ruta. */
export async function subirImagenTv(sb: ShakeClient, archivo: File): Promise<{ url: string; ruta: string }> {
  const ext = (archivo.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const ruta = `tv/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await sb.storage.from('pantallas').upload(ruta, archivo, { upsert: false, contentType: archivo.type })
  if (error) throw error
  return { url: sb.storage.from('pantallas').getPublicUrl(ruta).data.publicUrl, ruta }
}

/** Genera la llave del empujador. Se ve una sola vez; la anterior deja de servir. */
export async function nuevaLlavePantallasTv(sb: ShakeClient): Promise<string> {
  return rpc<string>(sb, 'fn_pantallas_tv_llave')
}
