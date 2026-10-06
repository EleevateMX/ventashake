import { sb } from './sb'
import { rpc, errorDeFuncion } from './rpc'

/**
 * Pedir y pagar desde la app: el servidor crea la orden (el precio lo pone
 * él), Clip cobra en su página y, en cuanto Clip dice que se cobró, cocina
 * lo prepara. Mismo camino que la app de iOS. Solo existe si gerencia lo
 * prendió (`fn_pedidos_app_config`).
 */

export interface LineaPedido {
  producto_id: string
  cantidad: number
  personalizacion?: string | null
  linea?: string
  padre_linea?: string | null
}

export interface PedidoCreado { id: string; folio: number; total: number; preparar_a?: string | null }

export async function crearPedido(lineas: LineaPedido[], nota: string | null): Promise<PedidoCreado> {
  return rpc<PedidoCreado>(sb, 'fn_pedido_app_crear', { p_items: lineas, p_nota: nota })
}

/** La URL de la página de pago de Clip para ESTE pedido (o que ya está pagado). */
export async function enlaceDePago(ordenId: string): Promise<{ url?: string; pagado?: boolean }> {
  const { data, error } = await sb.functions.invoke('clip-checkout-crear', { body: { orden_id: ordenId } })
  if (error) throw new Error(await errorDeFuncion(error, 'No se pudo abrir el pago.'))
  if (!data?.ok) throw new Error(data?.error?.mensaje ?? 'No se pudo abrir el pago.')
  return { url: data.url, pagado: data.pagado === true }
}

/** 'pagado' | 'pendiente' | 'fallido' — le pregunta a Clip, no adivina. */
export async function estadoDePago(ordenId: string): Promise<string> {
  const { data } = await sb.functions.invoke('clip-checkout-estado', { body: { orden_id: ordenId } })
  return (data?.estado as string) ?? 'pendiente'
}

/**
 * Abre la página de Clip. En la PWA instalada se abre en una pestaña del
 * sistema y, al terminar, Clip manda a /pago-app; la pantalla original
 * sigue preguntando por el pago mientras tanto.
 */
export function abrirPago(url: string): void {
  const w = window.open(url, '_blank', 'noopener')
  if (!w) window.location.assign(url)
}

/**
 * Espera a que el pago aparezca: pregunta cada pocos segundos y también
 * cada vez que la app vuelve al frente (al cerrar la página de Clip).
 * Devuelve el estado final o 'pendiente' si se acabó el tiempo.
 */
export function esperarPago(ordenId: string, opciones: { cadaMs?: number; maxMs?: number; alCambiar?: (e: string) => void } = {}): { promesa: Promise<string>; cancelar: () => void } {
  const cadaMs = opciones.cadaMs ?? 4000
  const maxMs = opciones.maxMs ?? 10 * 60 * 1000
  let vivo = true
  let timer: number | null = null
  let resolver: (e: string) => void = () => {}
  const promesa = new Promise<string>((r) => { resolver = r })
  const inicio = Date.now()

  const preguntar = async () => {
    if (!vivo) return
    const e = await estadoDePago(ordenId).catch(() => 'pendiente')
    opciones.alCambiar?.(e)
    if (e === 'pagado' || e === 'fallido') { terminar(e); return }
    if (Date.now() - inicio > maxMs) { terminar('pendiente'); return }
    timer = window.setTimeout(() => void preguntar(), cadaMs)
  }
  const alVolver = () => { if (document.visibilityState === 'visible') void preguntar() }
  const terminar = (e: string) => {
    if (!vivo) return
    vivo = false
    if (timer) window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', alVolver)
    resolver(e)
  }
  document.addEventListener('visibilitychange', alVolver)
  void preguntar()
  return { promesa, cancelar: () => terminar('pendiente') }
}
