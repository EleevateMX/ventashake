import type { LineaCarrito, DescuentoManual } from './posStore'
import type { ClienteConLealtad } from '@shake/supabase'
import type { Cupon, Promocion } from '@shake/types'
import { idDePantalla } from '@shake/utils'
import { publicarEspera } from '@shake/supabase'
import { sb } from '../lib/sb'

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
  const cortada = lista.slice(-MAX)
  try {
    localStorage.setItem(LLAVE, JSON.stringify(cortada))
  } catch {
    // Si no se puede guardar, la venta sigue en pantalla: no se pierde nada
    // que el cajero no pueda volver a capturar.
  }
  publicarVistazo(cortada)
}

/**
 * Le avisa al servidor cuántas apartadas tiene ESTA pantalla, para que
 * gerencia las vea en Admin → En vivo.
 *
 * **No es guardar la venta**: viajan el conteo, el total y las etiquetas,
 * nunca los items ni los precios por renglón. La venta sigue viviendo en
 * este navegador, por las razones de arriba.
 *
 * Va desde `guardarEspera` y no desde cada botón, igual que en el kiosko:
 * así toda ruta que cambie la lista publica sola. Y va en silencio — si
 * falla, la caja sigue cobrando y lo único desactualizado es la pantalla
 * de gerencia.
 */
function publicarVistazo(lista: VentaEnEspera[]): void {
  // El POS no guarda un total en la apartada: guarda las líneas. Se suma
  // de ellas, y a precio de catálogo — es un vistazo, no una cuenta: el
  // servidor cobra el precio de hoy cuando la venta se retome, y ese es
  // el número que manda.
  const deLaVenta = (v: VentaEnEspera) =>
    v.items.reduce((s, l) => s + (Number(l.producto?.precio) || 0) * (Number(l.cantidad) || 0), 0)
  const total = lista.reduce((s, v) => s + deLaVenta(v), 0)
  void publicarEspera(
    sb,
    idDePantalla('pos'),
    lista.length,
    Math.round(total * 100) / 100,
    lista.map((v) => v.etiqueta),
  ).catch(() => {})
}

/** Publica lo que ya había al abrir la pantalla. */
export function publicarEsperaAlArrancar(): void {
  publicarVistazo(leerEspera())
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
