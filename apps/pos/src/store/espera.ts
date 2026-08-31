import type { LineaCarrito, DescuentoManual } from './posStore'
import type { ClienteConLealtad } from '@shake/supabase'
import type { Cupon, Promocion } from '@shake/types'

/**
 * Ventas apartadas: "déjame la mía en espera y cóbrale a él, que va con
 * prisa".
 *
 * Viven en el navegador de ESA caja y no en la base a propósito. Una venta
 * apartada dura minutos, no se comparte entre cajas, y meterla a la base
 * significaría una orden a medio crear que la reconciliación tendría que
 * aprender a distinguir de una venta perdida. El costo de tenerla local es
 * que se pierde si alguien cierra el navegador; el de tenerla en la base
 * sería ensuciar el camino del dinero, que es peor.
 *
 * Todo lo que lee de `localStorage` va con red: en un perfil sin permisos,
 * o con el disco lleno, la caja tiene que seguir cobrando.
 */

const LLAVE = 'shake.pos.ventas-en-espera'
/** Una apartada de ayer no es una venta: es ruido. */
const VIGENCIA_HORAS = 12
const MAX = 12

export interface VentaEnEspera {
  id: string
  guardadaEn: string
  /** Con qué la reconoce el cajero: el nombre del cliente, o qué lleva. */
  etiqueta: string
  items: LineaCarrito[]
  cliente: ClienteConLealtad | null
  cupon: Cupon | null
  promo: Promocion | null
  promosDisp: Promocion[]
  descuentoManual: DescuentoManual | null
}

function vigente(v: VentaEnEspera): boolean {
  const t = Date.parse(v.guardadaEn)
  return Number.isFinite(t) && Date.now() - t < VIGENCIA_HORAS * 3600_000
}

export function leerEspera(): VentaEnEspera[] {
  try {
    const crudo = localStorage.getItem(LLAVE)
    if (!crudo) return []
    const lista = JSON.parse(crudo) as VentaEnEspera[]
    if (!Array.isArray(lista)) return []
    return lista.filter((v) => v && Array.isArray(v.items) && v.items.length > 0 && vigente(v))
  } catch {
    // Perfil sin permisos, JSON corrupto, modo privado: se arranca en cero.
    return []
  }
}

export function guardarEspera(lista: VentaEnEspera[]): void {
  try {
    localStorage.setItem(LLAVE, JSON.stringify(lista.slice(-MAX)))
  } catch {
    // Si no se puede guardar, la venta sigue en pantalla: no se pierde nada
    // que el cajero no pueda volver a capturar.
  }
}

/**
 * Cómo se llama la venta apartada en la lista. El nombre del cliente si lo
 * hay; si no, lo que lleva, que es como el cajero la va a reconocer
 * ("el de los dos shakes").
 */
export function etiquetaDeVenta(
  items: LineaCarrito[],
  cliente: ClienteConLealtad | null,
): string {
  if (cliente?.nombre) return cliente.nombre
  const piezas = items.reduce((s, l) => s + l.cantidad, 0)
  const primero = items[0]?.producto.nombre ?? 'Venta'
  return items.length === 1 && piezas === 1
    ? primero
    : `${primero} +${piezas - 1}`
}
