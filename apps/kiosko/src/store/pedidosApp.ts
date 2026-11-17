import { create } from 'zustand'
import { pedidosAppParaCaja, type PedidoAppCaja } from '@shake/supabase'
import { sb } from '@/lib/sb'
import { useConexion } from '@/lib/conexion'

/**
 * Pedidos de la app en la caja (17/11/26, pedido de gerencia).
 *
 * Un pedido de la app que solo trae cosas de mostrador (una barra Think!)
 * no imprime etiqueta ni sale en barra, a propósito; pero entonces nadie se
 * enteraba de que alguien venía a recogerlo. La caja pregunta cada 15 s y,
 * cuando aparece uno nuevo, suena y lo anuncia ENCIMA de lo que esté en
 * pantalla —también a media venta—, porque la alerta es justo para cuando
 * nadie está mirando el historial.
 *
 * Pregunta (no escucha Realtime) a propósito: es lo que hacen las
 * pantallas de cocina como respaldo, y un canal caído no debe dejar un
 * pedido sin anunciar.
 */

const CADA_MS = 15_000
let cargadoUnaVez = false
const CLAVE_VISTOS = 'shake_pedidos_app_vistos_v1'

function leerVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_VISTOS) ?? '[]') as string[]) } catch { return new Set() }
}
function guardarVistos(v: Set<string>) {
  try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify([...v].slice(-200))) } catch { /* sin almacenamiento */ }
}

interface Estado {
  pedidos: PedidoAppCaja[]
  /** Los que todavía no se entregan. */
  pendientes: () => PedidoAppCaja[]
  abierto: boolean
  setAbierto: (v: boolean) => void
  /** El que acaba de llegar, para el aviso. */
  aviso: PedidoAppCaja | null
  cerrarAviso: () => void
  refrescar: () => Promise<void>
}

export const usePedidosApp = create<Estado>((set, get) => ({
  pedidos: [],
  pendientes: () => get().pedidos.filter((p) => p.estado !== 'entregado'),
  abierto: false,
  setAbierto: (v) => set({ abierto: v, ...(v ? { aviso: null } : {}) }),
  aviso: null,
  cerrarAviso: () => set({ aviso: null }),
  refrescar: async () => {
    if (!useConexion.getState().enLinea) return
    let lista: PedidoAppCaja[]
    try { lista = await pedidosAppParaCaja(sb) } catch { return }
    let habiaRegistro = false
    try { habiaRegistro = localStorage.getItem(CLAVE_VISTOS) !== null } catch { /* */ }
    const vistos = leerVistos()
    const nuevos = lista.filter((p) => p.estado !== 'entregado' && !vistos.has(p.id))
    // En una pantalla que nunca los había visto no se anuncian los que ya
    // estaban (salen en el chip y en el panel). Si la pantalla se recargó,
    // sí se anuncia lo que llegó mientras tanto: los vistos viven en el
    // navegador.
    const primeraVez = !cargadoUnaVez && !habiaRegistro
    cargadoUnaVez = true
    for (const p of lista) vistos.add(p.id)
    guardarVistos(vistos)
    set({ pedidos: lista })
    if (nuevos.length && !primeraVez) {
      set({ aviso: nuevos[nuevos.length - 1] })
      sonar()
    }
  },
}))

let vigia: ReturnType<typeof setInterval> | null = null
export function arrancarVigiaPedidosApp(): () => void {
  void usePedidosApp.getState().refrescar()
  if (!vigia) vigia = setInterval(() => void usePedidosApp.getState().refrescar(), CADA_MS)
  return () => { if (vigia) { clearInterval(vigia); vigia = null } }
}

/**
 * Tres notas cortas con WebAudio (sin archivo de sonido). El navegador
 * solo deja sonar después de que alguien tocó la pantalla; en la caja eso
 * ya pasó al poner el PIN.
 */
let ctx: AudioContext | null = null
export function sonar() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    void ctx.resume()
    const t0 = ctx.currentTime
    ;[880, 1175, 1568].forEach((f, i) => {
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = t0 + i * 0.16
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
      o.connect(g).connect(ctx!.destination)
      o.start(t)
      o.stop(t + 0.3)
    })
  } catch { /* sin audio: el aviso en pantalla basta */ }
}
