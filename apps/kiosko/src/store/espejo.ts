import { idDePantalla } from '@shake/utils'
import { publicarEspejoCaja, type EspejoEstado, type EventoCaja, type EspejoConteo } from '@shake/supabase'
import { useCarrito, type ItemCarrito } from './carritoStore'
import { leerEspera } from './espera'
import { sb } from '@/lib/sb'

/**
 * El espejo de la caja (17/10/26): gerencia ve desde Admin → Caja en vivo,
 * también en su teléfono, lo que esta pantalla tiene enfrente.
 *
 * No es video: es un VISTAZO, como el de las ventas apartadas. Quién cobra,
 * en qué paso va (menú, carrito, cobro, ¡Listo!) y el carrito capturado.
 * Se publica al cambiar algo (con una pausa corta para no mandar cada
 * toque) y late cada 20 s para que Admin sepa que la pantalla sigue viva.
 *
 * Y anota lo que NO deja venta: productos que se quitan del carrito y
 * carritos que se vacían sin cobrar. Lo cobrado ya queda en la base; lo
 * capturado y borrado no quedaba en ningún lado, y eso es lo que hay que
 * poder revisar.
 *
 * Todo en silencio: si falla, la caja sigue cobrando.
 */

let ruta = '/'
let cambio = new Date().toISOString()
let pendientes: EventoCaja[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let conteo: EspejoConteo | null = null

/**
 * Lo que se está contando en «Caja y turno» (CorteMilo), en vivo: gerencia
 * ve billete por billete cuánto van poniendo. null al cerrar la ventana.
 */
export function espejoConteo(c: EspejoConteo | null): void {
  conteo = c
  cambio = new Date().toISOString()
  programar(400)
}

/**
 * Avisa a los teléfonos de gerencia: alguien empezó a contar la caja para
 * el corte, o va a entregar la caja a quien sigue. El servidor frena los
 * repetidos (uno por tipo cada 10 min).
 */
export function espejoAviso(tipo: 'conteo_cierre' | 'cambio_turno', quien: string | null): void {
  pendientes.push({ tipo, cajero: quien })
  programar(0)
}

/** App.tsx avisa la ruta: es el «en qué paso va». */
export function espejoRuta(r: string): void {
  if (r === ruta) return
  ruta = r
  cambio = new Date().toISOString()
  programar()
}

function programar(ms = 700): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void publicar() }, ms)
}

function renglones(items: ItemCarrito[]): EspejoEstado['items'] {
  return items
    .filter((i) => !i.padreLinea)
    .map((i) => {
      const extras = items.filter((e) => e.padreLinea === i.linea)
      return {
        n: i.nombre,
        c: i.cantidad,
        p: Math.round((i.precio * i.cantidad + extras.reduce((s, e) => s + e.precio * e.cantidad, 0)) * 100) / 100,
        ...(extras.length ? { x: extras.map((e) => e.nombre) } : {}),
      }
    })
}

async function publicar(): Promise<void> {
  const s = useCarrito.getState()
  let apartadas = 0
  try { apartadas = leerEspera().length } catch { /* sin almacenamiento */ }
  const estado: EspejoEstado = {
    ruta,
    cajero: s.cajero?.nombre ?? null,
    cliente: s.usuario?.nombre ?? null,
    pedido: s.nombrePedido?.trim() || null,
    items: renglones(s.items),
    total: Math.round(s.total() * 100) / 100,
    apartadas,
    cambio,
    caja: conteo,
  }
  const eventos = pendientes
  pendientes = []
  try {
    await publicarEspejoCaja(sb, idDePantalla('kiosko'), estado, eventos)
  } catch {
    // Sin conexión: los eventos esperan al siguiente intento (sin crecer
    // sin límite), el vistazo se repone solo con el latido.
    pendientes = eventos.concat(pendientes).slice(-20)
  }
}

/**
 * Lo que se quitó entre dos carritos. Un carrito que se vacía EN la
 * pantalla de cobro es una venta que se cerró (cobrada, apartada o mandada
 * a caja): eso no es quitar nada.
 */
function detectar(antes: ItemCarrito[], despues: ItemCarrito[]): void {
  if (despues.length === 0 && antes.length > 0) {
    if (ruta === '/pago') return
    const base = antes.filter((i) => !i.padreLinea)
    pendientes.push({
      tipo: 'vacio',
      cajero: useCarrito.getState().cajero?.nombre ?? null,
      importe: Math.round(antes.reduce((s, i) => s + i.precio * i.cantidad, 0) * 100) / 100,
      detalle: { items: base.map((i) => ({ n: i.nombre, c: i.cantidad })), ruta },
    })
    return
  }
  const quitados: { n: string; c: number }[] = []
  let importe = 0
  for (const i of antes.filter((x) => !x.padreLinea)) {
    const ahora = despues.find((d) => d.linea === i.linea)
    const menos = ahora ? i.cantidad - ahora.cantidad : i.cantidad
    if (menos <= 0) continue
    const extras = antes.filter((e) => e.padreLinea === i.linea)
    const unidad = i.precio + extras.reduce((s, e) => s + e.precio * (e.porUnidad ?? 1), 0)
    quitados.push({ n: i.nombre, c: menos })
    importe += unidad * menos
  }
  if (quitados.length) {
    pendientes.push({
      tipo: 'quito',
      cajero: useCarrito.getState().cajero?.nombre ?? null,
      importe: Math.round(importe * 100) / 100,
      detalle: { items: quitados, ruta },
    })
  }
}

/** Se enciende una vez (App.tsx). Devuelve con qué apagarlo. */
export function arrancarEspejo(): () => void {
  let previos = useCarrito.getState().items
  const colgar = useCarrito.subscribe((s) => {
    if (s.items !== previos) {
      detectar(previos, s.items)
      previos = s.items
      cambio = new Date().toISOString()
    }
    programar()
  })
  const latido = setInterval(() => programar(0), 20_000)
  programar(0)
  return () => {
    colgar()
    clearInterval(latido)
    if (timer) clearTimeout(timer)
  }
}
