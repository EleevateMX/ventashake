import { create } from 'zustand'
import { comandasSinInternet, folioSinInternet, hoyEnMerida, mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'
import { leerRespaldo } from '@/lib/respaldo'
import { esErrorDeRed, useConexion, revisarAhora } from '@/lib/conexion'
import type { ItemCarrito } from './carritoStore'

/**
 * Ventas cobradas SIN internet (08/10/26).
 *
 * Sin internet el kiosko sigue cobrando efectivo (o registra lo cobrado en
 * la terminal del banco): la venta se guarda en ESTE navegador con un folio
 * provisional («S-03»), la comanda sale por la red de la tienda (el agente
 * de impresión vive en la misma PC) y, en cuanto vuelve el internet, cada
 * venta se manda a `fn_venta_sin_internet`, que la registra con su hora
 * real usando el camino del dinero de siempre.
 *
 * Reglas que no son de estilo:
 *  - Se escribe en localStorage ANTES de imprimir y antes de cambiar de
 *    pantalla. Si la PC se apaga a media venta, lo cobrado no se pierde.
 *  - El id lo pone el kiosko y el servidor es idempotente con él: si la
 *    respuesta se corta, el reintento no crea otra orden.
 *  - Se manda de una en una y nunca dos envíos a la vez.
 *  - Un error de RED detiene la vuelta (sigue sin internet); un error del
 *    SERVIDOR deja esa venta marcada y sigue con las demás — una venta rara
 *    no puede atorar a las otras quince.
 */

export interface VentaSinInternet {
  id: string
  folio_local: string
  vendida_en: string
  sucursal_id: string
  almacen_id: string
  corte_id: string | null
  empleado_id: string | null
  cliente_id: string | null
  nombre_cliente: string | null
  para_llevar: boolean | null
  preparar_a: string | null
  metodo: 'efectivo' | 'tarjeta'
  total_pantalla: number
  items: Array<{
    producto_id: string
    cantidad: number
    personalizacion: string | null
    linea: string
    padre_linea: string | null
  }>
  comanda_impresa: boolean
  /** Solo para la pantalla: qué se vendió. No viaja al servidor. */
  resumen: Array<{ nombre: string; cantidad: number }>
  intentos: number
  ultimoError: string | null
}

export interface VentaRegistrada {
  folio_local: string
  folio: number
  vendida_en: string
  diferencia: number
}

const CLAVE = 'shake_ventas_sin_internet_v1'
const CLAVE_ENVIADAS = 'shake_ventas_sin_internet_enviadas_v1'
const CLAVE_FOLIO = 'shake_folio_sin_internet_v1'

function leer<T>(clave: string, porOmision: T): T {
  try {
    return (JSON.parse(localStorage.getItem(clave) ?? 'null') as T) ?? porOmision
  } catch {
    return porOmision
  }
}

function escribir(clave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
    return true
  } catch {
    return false
  }
}

interface EstadoCola {
  pendientes: VentaSinInternet[]
  enviadas: VentaRegistrada[]
  enviando: boolean
}

export const useVentasSinInternet = create<EstadoCola>(() => ({
  pendientes: leer<VentaSinInternet[]>(CLAVE, []),
  enviadas: leer<VentaRegistrada[]>(CLAVE_ENVIADAS, []),
  enviando: false,
}))

function guardarPendientes(lista: VentaSinInternet[]): boolean {
  const ok = escribir(CLAVE, lista)
  useVentasSinInternet.setState({ pendientes: lista })
  return ok
}

/** El siguiente folio provisional del día de Mérida. */
export function siguienteFolioLocal(): string {
  const hoy = hoyEnMerida()
  const actual = leer<{ dia: string; n: number }>(CLAVE_FOLIO, { dia: hoy, n: 0 })
  const n = actual.dia === hoy ? actual.n + 1 : 1
  escribir(CLAVE_FOLIO, { dia: hoy, n })
  return folioSinInternet(n)
}

/**
 * Guarda una venta cobrada sin internet. Devuelve `false` si el navegador
 * no la pudo guardar — entonces NO se debe dar por cobrada.
 */
export function guardarVentaSinInternet(v: VentaSinInternet): boolean {
  const lista = [...useVentasSinInternet.getState().pendientes, v]
  return guardarPendientes(lista)
}

function marcar(id: string, cambios: Partial<VentaSinInternet>) {
  guardarPendientes(useVentasSinInternet.getState().pendientes.map((v) => (v.id === id ? { ...v, ...cambios } : v)))
}

// ---------------------------------------------------------------------------
// La comanda, por la red de la tienda.
// ---------------------------------------------------------------------------

/** El agente de impresión, en esta misma PC. */
const AGENTE = 'http://127.0.0.1:7777'

/** ¿Está el agente para imprimir sin internet? */
export async function agenteLocalVivo(): Promise<boolean> {
  try {
    const r = await fetch(`${AGENTE}/status`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch {
    return false
  }
}

/**
 * Imprime la comanda de una venta sin internet. Devuelve qué estaciones
 * salieron y cuáles no, para decírselo al cajero: si la comanda de cocina
 * no salió, alguien tiene que ir a decirle.
 */
export async function imprimirComandaLocal(
  v: VentaSinInternet,
  items: ItemCarrito[],
  cajero: string | null,
): Promise<{ salieron: string[]; fallaron: Array<{ estacion: string; error: string }> }> {
  const cocinas = leerRespaldo<Record<string, { slug: string; nombre: string }>>('cocinas') ?? {}
  const comandas = comandasSinInternet(
    items.map((i) => ({
      linea: i.linea,
      padreLinea: i.padreLinea ?? null,
      nombre: i.nombre,
      cantidad: i.cantidad,
      personalizacion: i.personalizacion ?? null,
      estacion: i.estacion ?? cocinas[i.cocina_id]?.slug ?? 'bebidas',
      vaAPantalla: i.vaAPantalla,
      estacionVinculo: i.estacionVinculo ?? null,
    })),
    {
      ticket: v.folio_local,
      creadoEn: v.vendida_en,
      cajero,
      cliente: v.nombre_cliente,
      paraLlevar: v.para_llevar,
      nombresEstacion: Object.fromEntries(Object.values(cocinas).map((k) => [k.slug, k.nombre])),
    },
  )

  const salieron: string[] = []
  const fallaron: Array<{ estacion: string; error: string }> = []
  for (const c of comandas) {
    try {
      const r = await fetch(`${AGENTE}/local/comanda`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: `${v.id}-${c.slug}`, estacion: c.payload.estacion, payload: c.payload }),
        signal: AbortSignal.timeout(8000),
      })
      const cuerpo = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (r.ok && cuerpo.ok) salieron.push(c.payload.estacion)
      else fallaron.push({ estacion: c.payload.estacion, error: cuerpo.error ?? `El agente contestó ${r.status}` })
    } catch {
      fallaron.push({
        estacion: c.payload.estacion,
        error: 'No contesta el agente de impresión de esta PC. ¿Está abierta su ventana?',
      })
    }
  }
  // Solo si salió TODO se le dice al servidor que no la vuelva a mandar.
  // Si algo faltó, que la mande él cuando vuelva el internet (si todavía
  // es reciente) — peor es que barra nunca se entere.
  if (comandas.length > 0 && fallaron.length === 0) marcar(v.id, { comanda_impresa: true })
  if (comandas.length === 0) marcar(v.id, { comanda_impresa: true })
  return { salieron, fallaron }
}

// ---------------------------------------------------------------------------
// El envío, cuando vuelve el internet.
// ---------------------------------------------------------------------------

let enCurso: Promise<void> | null = null

export function enviarPendientes(): Promise<void> {
  if (enCurso) return enCurso
  enCurso = (async () => {
    useVentasSinInternet.setState({ enviando: true })
    try {
      for (const { id } of [...useVentasSinInternet.getState().pendientes]) {
        if (!useConexion.getState().enLinea) return
        // Se relee: la comanda pudo terminar de imprimirse mientras tanto, y
        // mandar `comanda_impresa: false` haría que barra la recibiera dos veces.
        const v = useVentasSinInternet.getState().pendientes.find((x) => x.id === id)
        if (!v) continue
        // Lo que es solo de esta pantalla no viaja.
        const paraServidor: Partial<VentaSinInternet> = { ...v }
        delete paraServidor.resumen
        delete paraServidor.intentos
        delete paraServidor.ultimoError
        try {
          const { data, error } = await (sb.rpc as unknown as (
            fn: string, args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: { message: string } | null }>)(
            'fn_venta_sin_internet', { p_venta: paraServidor },
          )
          if (error) throw new Error(error.message)
          const r = data as { folio: number; diferencia: number }
          const enviadas = [
            { folio_local: v.folio_local, folio: r.folio, vendida_en: v.vendida_en, diferencia: Number(r.diferencia ?? 0) },
            ...useVentasSinInternet.getState().enviadas,
          ].slice(0, 50)
          escribir(CLAVE_ENVIADAS, enviadas)
          useVentasSinInternet.setState({ enviadas })
          guardarPendientes(useVentasSinInternet.getState().pendientes.filter((x) => x.id !== v.id))
        } catch (e) {
          if (esErrorDeRed(e)) {
            void revisarAhora()
            return
          }
          marcar(v.id, { intentos: v.intentos + 1, ultimoError: mensajeDeError(e) })
        }
      }
    } finally {
      useVentasSinInternet.setState({ enviando: false })
      enCurso = null
    }
  })()
  return enCurso
}

let arrancado = false

/**
 * Manda lo pendiente en cuanto vuelve el internet, y luego cada 30 s
 * mientras quede algo (lo que el servidor rechazó se reintenta: casi
 * siempre es una caja que se cerró a medias o un producto que cambió).
 */
export function vigilarVentasSinInternet(): void {
  if (arrancado) return
  arrancado = true
  useConexion.subscribe((s, previo) => {
    if (s.enLinea && !previo.enLinea) void enviarPendientes()
  })
  setInterval(() => {
    if (useConexion.getState().enLinea && useVentasSinInternet.getState().pendientes.length > 0) {
      void enviarPendientes()
    }
  }, 30_000)
  if (useVentasSinInternet.getState().pendientes.length > 0) void enviarPendientes()
}
