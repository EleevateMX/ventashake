import type { ShakeClient } from '../client'

/**
 * Producción de preparados (24/10/26, `produccion_de_preparados.sql`).
 *
 * Una receta de Costeo Alimentos (la salsa chipotle) se convierte en
 * existencia de un ingrediente elaborado («Salsa Chipotle Preparada»): sale
 * lo de la receta del kiosko y entra lo producido. Las cantidades las toma
 * el servidor de la receta que Costeos sincroniza; aquí no se copia nada.
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpc = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as Rpc)(fn, args)
  if (error) throw error
  return data as T
}

export interface LineaProduccion {
  insumo_id: string
  nombre: string
  unidad: string | null
  /** Por lote. */
  cantidad: number
  existencia: number
}

export interface OpcionProduccion {
  producto_id: string
  receta: string
  insumo_id: string
  salida: string
  unidad: string | null
  /** Piezas por lote. */
  rinde: number
  existencia: number
  lineas: LineaProduccion[]
}

export async function opcionesProduccion(sb: ShakeClient): Promise<OpcionProduccion[]> {
  const r = (await rpc<OpcionProduccion[] | null>(sb, 'fn_produccion_opciones')) ?? []
  return r.map((o) => ({
    ...o,
    rinde: Number(o.rinde),
    existencia: Number(o.existencia),
    lineas: o.lineas.map((l) => ({ ...l, cantidad: Number(l.cantidad), existencia: Number(l.existencia) })),
  }))
}

export interface Faltante {
  nombre: string
  unidad: string | null
  necesita: number
  hay: number
}

export type ResultadoProduccion =
  | { ok: true; id: string; salida?: string; cantidad: number; lotes: number; esperado?: number;
      costo_total?: number; existencia?: number; quien?: string | null; repetida?: boolean }
  | { ok: false; error: string; faltantes: Faltante[] }

/**
 * Registra la producción. `id` lo genera la pantalla al abrirse: un doble
 * toque o un reintento devuelve la misma, no registra dos.
 * Si falta inventario y `forzar` es falso, NO escribe y contesta qué falta.
 */
export async function registrarProduccion(
  sb: ShakeClient,
  p: { id: string; producto_id: string; lotes: number; cantidad: number; nota?: string | null; forzar?: boolean },
): Promise<ResultadoProduccion> {
  const r = await rpc<ResultadoProduccion>(sb, 'fn_produccion_registrar', {
    p_id: p.id, p_producto_id: p.producto_id, p_lotes: p.lotes, p_cantidad: p.cantidad,
    p_nota: p.nota ?? null, p_forzar: p.forzar ?? false,
  })
  if (!r.ok) {
    return { ...r, faltantes: (r.faltantes ?? []).map((f) => ({ ...f, necesita: Number(f.necesita), hay: Number(f.hay) })) }
  }
  return { ...r, cantidad: Number(r.cantidad), lotes: Number(r.lotes) }
}

// ── Admin (gerencia) ─────────────────────────────────────────────────────

export interface LigaProduccion {
  producto_id: string
  receta: string
  insumo_id: string
  salida: string
  /** null = el contenido del ingrediente. */
  rinde: number | null
  contenido: number | null
  activo: boolean
}

export interface ProduccionReciente {
  creado_en: string
  receta: string
  salida: string
  lotes: number
  esperado: number
  cantidad: number
  nota: string | null
  forzada: boolean
  costo_total: number | null
  quien: string | null
}

export interface ProduccionAdmin {
  ligas: LigaProduccion[]
  recetas: { id: string; nombre: string }[]
  ingredientes: { id: string; nombre: string; contenido: number | null; unidad: string | null }[]
  recientes: ProduccionReciente[]
}

export async function produccionAdmin(sb: ShakeClient): Promise<ProduccionAdmin> {
  const r = await rpc<ProduccionAdmin>(sb, 'fn_produccion_admin')
  return {
    ...r,
    recientes: (r.recientes ?? []).map((x) => ({
      ...x, lotes: Number(x.lotes), esperado: Number(x.esperado), cantidad: Number(x.cantidad),
      costo_total: x.costo_total == null ? null : Number(x.costo_total),
    })),
  }
}

export async function ligarProduccion(
  sb: ShakeClient,
  l: { producto_id: string; insumo_id: string; rinde: number | null; activo: boolean },
): Promise<void> {
  await rpc<null>(sb, 'fn_produccion_ligar', {
    p_producto_id: l.producto_id, p_insumo_id: l.insumo_id, p_rinde: l.rinde, p_activo: l.activo,
  })
}
