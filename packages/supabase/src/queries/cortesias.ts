import type { ShakeClient } from '../client'
import type { NuevaOrdenItem } from './ordenes'

/**
 * Cortesías del kiosko (15/10/26, `cortesias_en_el_kiosko.sql`).
 *
 * La pantalla manda los productos, el motivo y el PIN de quien autoriza;
 * NUNCA un precio ni un descuento. El servidor crea la orden con los
 * precios de siempre, la deja en $0 y la cobra como `cortesia`: sale la
 * comanda y baja el inventario igual que una venta. Solo pueden darla las
 * personas que gerencia anotó a mano (no lo trae ningún rol).
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpc = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as Rpc)(fn, args)
  if (error) throw error
  return data as T
}

export interface CortesiaCreada {
  id: string
  folio: number
  /** Lo que valía a precio de lista: lo que se regaló. */
  valor: number
  /** Quién la autorizó con su PIN. */
  autorizo: string
}

export async function crearCortesia(
  sb: ShakeClient,
  datos: {
    pin: string
    motivo: string
    sucursal_id: string
    almacen_id: string
    corte_id?: string | null
    empleado_id?: string | null
    nombre_cliente?: string | null
    para_llevar?: boolean | null
  },
  items: NuevaOrdenItem[],
): Promise<CortesiaCreada> {
  const lineas = items.map((i) => ({
    producto_id: i.producto_id,
    cantidad: i.cantidad,
    personalizacion: i.personalizacion ?? null,
    ...(i.linea ? { linea: i.linea } : {}),
    ...(i.padre_linea ? { padre_linea: i.padre_linea } : {}),
  }))
  const r = await rpc<CortesiaCreada>(sb, 'fn_cortesia_crear', {
    p_pin: datos.pin,
    p_motivo: datos.motivo,
    p_sucursal_id: datos.sucursal_id,
    p_almacen_id: datos.almacen_id,
    p_items: lineas,
    p_corte_id: datos.corte_id ?? null,
    p_empleado_id: datos.empleado_id ?? null,
    p_nombre_cliente: datos.nombre_cliente ?? null,
    p_para_llevar: datos.para_llevar ?? null,
  })
  return { ...r, valor: Number(r.valor), folio: Number(r.folio) }
}

export interface Cortesia {
  creado_en: string
  folio: number
  autorizo: string
  cajero: string | null
  motivo: string
  valor: number
  productos: string | null
}

/** Las cortesías de un rango de días (Mérida). Solo gerencia. */
export async function listarCortesias(sb: ShakeClient, desde: string, hasta: string): Promise<Cortesia[]> {
  const filas = await rpc<Cortesia[]>(sb, 'fn_cortesias', { p_desde: desde, p_hasta: hasta })
  return (filas ?? []).map((f) => ({ ...f, valor: Number(f.valor) }))
}

export interface CortesiaPersona {
  empleado_id: string
  nombre: string
  rol: string
  puede: boolean
}

/** Quién puede dar cortesías. Solo gerencia. */
export async function cortesiaAutorizados(sb: ShakeClient): Promise<CortesiaPersona[]> {
  return (await rpc<CortesiaPersona[]>(sb, 'fn_cortesia_autorizados')) ?? []
}

export async function cortesiaAutorizar(sb: ShakeClient, empleadoId: string, puede: boolean): Promise<void> {
  await rpc<null>(sb, 'fn_cortesia_autorizar', { p_empleado_id: empleadoId, p_puede: puede })
}
