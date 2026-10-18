import type { ShakeClient } from '../client'

/**
 * El ticket de la impresora de caja (`configuracion_ticket`, `logos_ticket`).
 * El agente de caja (`agente-caja/`) LEE estas tablas; cambiarlas es solo de
 * gerencia (`ticket_de_caja_admin.sql`).
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpc = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as Rpc)(fn, args)
  if (error) throw error
  return data as T
}

export interface ConfigTicket {
  nombre_negocio: string
  linea_sucursal: string | null
  direccion: string | null
  rfc: string | null
  telefono: string | null
  mensaje_pie: string | null
  redes: string | null
  wifi_activo: boolean
  wifi_titulo: string | null
  wifi_mensaje: string | null
  wifi_ssid: string | null
  wifi_seguridad: 'WPA' | 'WEP' | 'nopass' | string
  wifi_password: string | null
  wifi_oculta: boolean
  rewards_activo: boolean
  rewards_titulo: string | null
  rewards_mensaje: string | null
  rewards_url_ios: string | null
  rewards_url_android: string | null
  mostrar_iva: boolean
  mostrar_mancuernas: boolean
  mostrar_cajero: boolean
  copias: number
  logo_id: string | null
  logo_activo: boolean
  imprimir_ticket_auto: boolean
  imprimir_corte_auto: boolean
  updated_at: string
}

export interface LogoTicket {
  id: string
  nombre: string
  /** Raster de 1 bit en base64: filas de `ancho/8` bytes, el bit alto a la izquierda, 1 = negro. */
  bitmap: string
  ancho: number
  alto: number
  /** La imagen de origen (data URL), para volver a ajustar el umbral. */
  original: string | null
  umbral: number
  created_at: string
}

export async function configTicket(sb: ShakeClient): Promise<ConfigTicket> {
  return rpc<ConfigTicket>(sb, 'fn_configuracion_ticket')
}

/** Solo manda lo que cambió. Un texto vacío lo borra. */
export async function guardarConfigTicket(sb: ShakeClient, cambios: Partial<ConfigTicket>): Promise<ConfigTicket> {
  return rpc<ConfigTicket>(sb, 'fn_actualizar_configuracion_ticket', { p_cambios: cambios })
}

export async function logosTicket(sb: ShakeClient): Promise<LogoTicket[]> {
  return (await rpc<LogoTicket[] | null>(sb, 'fn_logos_ticket')) ?? []
}

export async function guardarLogoTicket(
  sb: ShakeClient,
  l: { nombre: string; bitmap: string; ancho: number; alto: number; original: string | null; umbral: number; activar: boolean },
): Promise<LogoTicket> {
  return rpc<LogoTicket>(sb, 'fn_logo_ticket_guardar', {
    p_nombre: l.nombre, p_bitmap: l.bitmap, p_ancho: l.ancho, p_alto: l.alto,
    p_original: l.original, p_umbral: l.umbral, p_activar: l.activar,
  })
}

export async function activarLogoTicket(sb: ShakeClient, id: string | null): Promise<void> {
  await rpc<unknown>(sb, 'fn_logo_ticket_activar', { p_logo_id: id })
}

export async function borrarLogoTicket(sb: ShakeClient, id: string): Promise<void> {
  await rpc<unknown>(sb, 'fn_logo_ticket_borrar', { p_logo_id: id })
}

export interface ResultadoImprimirCorte {
  estado: 'en_cola' | 'ya_en_cola' | 'sin_impresora'
  folio: number
  reimpresion?: boolean
  /** ¿El agente de caja latió en los últimos 2 minutos? Si no, el papel sale cuando vuelva. */
  agente_en_linea?: boolean
}

/**
 * Manda el comprobante de un corte a la impresora de caja (la de tickets),
 * no al diálogo del navegador. La primera vez sale el de siempre; después,
 * copias marcadas como reimpresión. Solo gerencia.
 */
export async function imprimirCorteEnCaja(sb: ShakeClient, corteId: string): Promise<ResultadoImprimirCorte> {
  return rpc<ResultadoImprimirCorte>(sb, 'fn_corte_imprimir_caja', { p_corte_id: corteId })
}
