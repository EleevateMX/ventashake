import type { ShakeClient } from '../client'

/**
 * Caja en vivo (17/10/26, `caja_en_vivo.sql`): gerencia ve lo que hay en la
 * pantalla del kiosko y lo que pasó en el turno, desde Admin o el teléfono.
 *
 * El kiosko publica un VISTAZO de su pantalla (no video): quién cobra, en
 * qué paso va y el carrito. Y anota lo que no deja venta: productos que se
 * quitaron del carrito y carritos que se vaciaron sin cobrar.
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpc = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as Rpc)(fn, args)
  if (error) throw error
  return data as T
}

export interface EspejoRenglon {
  /** nombre */ n: string
  /** cantidad */ c: number
  /** importe del renglón con sus extras */ p: number
  /** extras */ x?: string[]
}

/** Lo que se está contando en la ventana de «Caja y turno», en vivo. */
export interface EspejoConteo {
  /** cierre = corte del turno · apertura = abrir o recibir la caja · entrega = cambio de turno, esperando a quien recibe */
  modo: 'cierre' | 'apertura' | 'entrega'
  quien: string | null
  contado: number
  /** Lo que debería haber (cierre) o el fondo fijo (apertura). */
  esperado: number | null
  billetes: Record<string, number>
  monedas: Record<string, number>
  retiro?: number | null
}

export interface EspejoEstado {
  ruta: string
  cajero: string | null
  cliente: string | null
  pedido: string | null
  items: EspejoRenglon[]
  total: number
  apartadas: number
  /** Cuándo cambió por última vez lo que hay en pantalla (ISO). */
  cambio: string
  /** Solo mientras alguien cuenta la caja. */
  caja?: EspejoConteo | null
}

export interface EventoCaja {
  /** quito/vacio quedan en la bitácora; conteo_cierre/cambio_turno avisan a gerencia. */
  tipo: 'quito' | 'vacio' | 'conteo_cierre' | 'cambio_turno'
  cajero: string | null
  importe?: number
  detalle?: { items: { n: string; c: number }[]; ruta: string }
}

/** El kiosko publica su pantalla. En silencio: si falla, la caja sigue. */
export async function publicarEspejoCaja(
  sb: ShakeClient, pantalla: string, estado: EspejoEstado, eventos: EventoCaja[],
): Promise<void> {
  await rpc<null>(sb, 'fn_caja_espejo_publicar', { p_pantalla: pantalla, p_estado: estado, p_eventos: eventos })
}

export type TipoMovimientoCaja =
  | 'venta' | 'sin_cobrar' | 'cancelacion' | 'cortesia' | 'quito' | 'vacio' | 'apertura' | 'cierre'
  | 'conteo_cierre' | 'cambio_turno'

export interface MovimientoCaja {
  ts: string
  tipo: TipoMovimientoCaja
  folio?: number | null
  importe?: number | null
  metodo?: string | null
  cajero?: string | null
  cliente?: string | null
  descuento?: number | null
  cancelada?: boolean
  texto?: string | null
  detalle?: { items?: { n: string; c: number }[]; ruta?: string }
}

export interface CajaEnVivo {
  ahora: string
  pantallas: { pantalla: string; estado: EspejoEstado; hace_seg: number }[]
  corte: {
    folio: number | null
    abierto_en: string
    abrio: string | null
    fondo: number
    ordenes: number
    efectivo: number
    tarjeta: number
    clip: number
    cortesia: number
    otro: number
    total: number
    efectivo_esperado: number
  } | null
  desde: string
  movimientos: MovimientoCaja[]
}

/** Solo gerencia: el servidor lo exige (`fn_es_jefe`). */
export async function cajaEnVivo(sb: ShakeClient): Promise<CajaEnVivo> {
  const d = await rpc<CajaEnVivo>(sb, 'fn_caja_en_vivo')
  return { ...d, pantallas: d.pantallas ?? [], movimientos: d.movimientos ?? [] }
}
