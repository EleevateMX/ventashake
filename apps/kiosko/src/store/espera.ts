import type { ItemCarrito, UsuarioKiosko } from './carritoStore'
import { idDePantalla, horaEnMerida } from '@shake/utils'
import { publicarEspera, type VentaApartada } from '@shake/supabase'
import { sb } from '@/lib/sb'

/**
 * Ventas apartadas: "déjame la mía en espera y cóbrale a él".
 *
 * El caso real que la pidió: la cuenta ya está capturada, y al cobrar la
 * tarjeta del cliente no pasa o necesita un minuto. Hasta ahora la única
 * salida era **borrar toda la venta** y volver a capturarla después, con
 * la fila esperando.
 *
 * Viven en el navegador de ESTA pantalla y no en la base, a propósito.
 * Una apartada dura minutos, no se comparte entre cajas, y meterla a la
 * base significaría una orden a medio crear que la reconciliación tendría
 * que aprender a distinguir de una venta perdida. El costo de tenerla
 * local es que se pierde si alguien cierra el navegador; el de tenerla en
 * la base sería ensuciar el camino del dinero, que es peor.
 *
 * Todo lo que toca `localStorage` va con red: en un perfil sin permisos o
 * con el disco lleno, la caja tiene que seguir cobrando.
 */

const LLAVE = 'shake.kiosko.ventas-en-espera'
/** Una apartada de ayer no es una venta: es ruido. */
const VIGENCIA_HORAS = 12
const MAX = 12

export interface VentaEnEspera {
  id: string
  guardadaEn: string
  /** Con qué la reconoce el cajero: el nombre del pedido, o qué lleva. */
  etiqueta: string
  items: ItemCarrito[]
  usuario: UsuarioKiosko | null
  nombrePedido: string
  paraLlevar: boolean | null
  /** El total que se vio al apartarla, para poder avisar si cambió. */
  total: number
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

function escribir(lista: VentaEnEspera[]): void {
  const cortada = lista.slice(-MAX)
  try {
    localStorage.setItem(LLAVE, JSON.stringify(cortada))
  } catch {
    // Si no se puede guardar, la venta sigue en pantalla: no se pierde
    // nada que el cajero no pueda volver a capturar.
  }
  publicarVistazo(cortada)
}

/**
 * Le avisa al servidor cuántas apartadas tiene ESTA pantalla, para que
 * gerencia lo vea en Admin → En vivo.
 *
 * **No es guardar la venta**: no viajan los items ni los precios por
 * renglón, solo el conteo, el total y las etiquetas. La venta sigue
 * viviendo aquí, en el navegador, por las razones de arriba.
 *
 * Va desde `escribir` y no desde cada botón a propósito: así toda ruta
 * que cambie la lista publica sola, y no hay forma de agregar un camino
 * nuevo que se olvide de avisar.
 *
 * Y va en silencio. Si esto falla, la caja tiene que seguir cobrando:
 * un vistazo que no llegó es una pantalla de gerencia desactualizada,
 * nada más.
 */
function publicarVistazo(lista: VentaEnEspera[]): void {
  const total = lista.reduce((s, v) => s + (Number(v.total) || 0), 0)
  void publicarEspera(
    sb,
    idDePantalla('kiosko'),
    lista.length,
    Math.round(total * 100) / 100,
    lista.map((v) => v.etiqueta),
    lista.map(detalleParaVistazo),
  ).catch(() => {})
}

/**
 * Lo que se publica de UNA apartada: qué lleva y de qué hora es.
 *
 * Los extras van como renglón propio y no colgando del padre, porque aquí
 * nadie prepara nada: es una lista para que gerencia reconozca la venta
 * desde su celular. Y va la hora en que se apartó, no la de ahora: "desde
 * las 11:54" es lo que dice si alguien se fue y no volvió.
 */
function detalleParaVistazo(v: VentaEnEspera): VentaApartada {
  return {
    etiqueta: v.etiqueta,
    total: Math.round((Number(v.total) || 0) * 100) / 100,
    hora: horaEnMerida(new Date(v.guardadaEn)),
    items: v.items.map((i) => ({ n: i.nombre, c: i.cantidad })),
  }
}

/**
 * Publica lo que ya había al abrir la pantalla, y **sigue latiendo**
 * mientras haya algo apartado.
 *
 * El latido no es adorno, son dos agujeros que tapa:
 *
 * 1. **El vistazo caduca a las 12 h.** Publicando solo al cambiar la
 *    lista, una apartada que nadie toca desaparece del panel de gerencia
 *    aunque siga viva en esta pantalla. El panel perdería justo lo que
 *    está ahí para vigilar.
 * 2. **Lo que esta pantalla sabe decir cambia con los despliegues.** El
 *    día que empezó a viajar el detalle (qué lleva, a qué hora), las
 *    apartadas que ya existían se quedaron sin él: la pantalla no tenía
 *    motivo para volver a hablar, así que en Admin los renglones no se
 *    podían abrir y no había forma de saber por qué. Con el latido, la
 *    versión nueva se pone al día sola en un par de minutos.
 *
 * Con la lista vacía no late: `escribir` ya publicó el cero cuando se
 * retomó la última, y un renglón en cero no se muestra ni caduca a nadie.
 *
 * Devuelve la función para apagarlo, para que la pantalla no deje
 * intervalos sueltos al desmontarse.
 */
const LATIDO_MS = 120_000

export function arrancarLatidoEspera(): () => void {
  publicarVistazo(leerEspera())
  const id = setInterval(() => {
    const lista = leerEspera()
    if (lista.length > 0) publicarVistazo(lista)
  }, LATIDO_MS)
  return () => clearInterval(id)
}

/**
 * Cómo se llama la apartada en la lista. El nombre del pedido si lo hay;
 * si no, lo que lleva, que es como el cajero la va a reconocer ("el de
 * los dos shakes").
 */
export function etiquetaDeVenta(items: ItemCarrito[], nombrePedido: string): string {
  const nombre = nombrePedido.trim()
  if (nombre) return nombre
  // Los extras no cuentan: nadie reconoce su venta por "creatina".
  const principales = items.filter((i) => !i.padreLinea)
  const piezas = principales.reduce((s, l) => s + l.cantidad, 0)
  const primero = principales[0]?.nombre ?? 'Venta'
  return principales.length === 1 && piezas === 1 ? primero : `${primero} +${piezas - 1}`
}

export function apartar(v: Omit<VentaEnEspera, 'id' | 'guardadaEn' | 'etiqueta'>): VentaEnEspera {
  const nueva: VentaEnEspera = {
    ...v,
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `e${Date.now()}${Math.random().toString(16).slice(2)}`,
    guardadaEn: new Date().toISOString(),
    etiqueta: etiquetaDeVenta(v.items, v.nombrePedido),
  }
  escribir([...leerEspera(), nueva])
  return nueva
}

export function quitarDeEspera(id: string): VentaEnEspera[] {
  const quedan = leerEspera().filter((v) => v.id !== id)
  escribir(quedan)
  return quedan
}

/**
 * El refresco contra el catálogo vive en `@shake/utils`, no aquí: el POS
 * también aparta ventas, y dos copias de esa regla se separan en cuanto
 * alguien toca una. Es la misma lección de `extras.ts`, donde el kiosko
 * sabía elegir la leche de casa y el POS no.
 */
export { refrescarContraCatalogo, totalRefrescado } from '@shake/utils'
