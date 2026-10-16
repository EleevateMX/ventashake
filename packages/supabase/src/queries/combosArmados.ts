import type { ShakeClient } from '../client'

/**
 * Combos armados (16/10/26, `combos_*.sql`): un combo es un producto de la
 * categoría Combos con
 *   · fijos   — lo que trae SIEMPRE (`combo_fijos`), y
 *   · grupos  — «elige una» (`producto_extras.grupo`), cada opción ligada a
 *               su producto real (`inventario_como`) para que al venderse
 *               descuente la receta de ESE producto, la de Costeos.
 *
 * El semáforo (`avisos`) lo arma el servidor: es la misma regla que usa el
 * descuento, no una copia en la pantalla. Todo pide gerencia.
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpc = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as Rpc)(fn, args)
  if (error) throw error
  return data as T
}

export interface ComboFijo {
  producto_id: string
  nombre: string
  cantidad: number
  activo: boolean
  costo: number | null
  recetas: number
  /** Insumos con cantidad 0 en su receta (sin contar el hielo). */
  ceros: string | null
}

export interface ComboOpcion {
  extra_id: string
  nombre: string
  activo: boolean
  estacion: string | null
  por_defecto: boolean
  /** El producto real cuya receta descuenta. */
  como_id: string | null
  como_nombre: string | null
  como_activo: boolean | null
  recetas: number
  ceros: string | null
  costo: number
}

export interface ComboArmado {
  id: string
  nombre: string
  precio: number
  activo: boolean
  precio_sin_iva: number | null
  /** Extras con costo que no son «elige una» (leches, suplementos). */
  extras_sueltos: number
  fijos: ComboFijo[]
  grupos: { grupo: string; opciones: ComboOpcion[] }[]
  costo_min: number
  costo_max: number
  avisos: string[]
}

export async function combosArmados(sb: ShakeClient): Promise<ComboArmado[]> {
  const filas = (await rpc<ComboArmado[]>(sb, 'fn_combos_admin')) ?? []
  return filas.map((c) => ({
    ...c,
    precio: Number(c.precio),
    precio_sin_iva: c.precio_sin_iva == null ? null : Number(c.precio_sin_iva),
    costo_min: Number(c.costo_min),
    costo_max: Number(c.costo_max),
    fijos: (c.fijos ?? []).map((f) => ({ ...f, cantidad: Number(f.cantidad), costo: f.costo == null ? null : Number(f.costo) })),
    grupos: (c.grupos ?? []).map((g) => ({ ...g, opciones: g.opciones.map((o) => ({ ...o, costo: Number(o.costo) })) })),
    avisos: c.avisos ?? [],
  }))
}

/** Nace APAGADO: se prende cuando ya tiene sus partes. */
export async function crearComboArmado(sb: ShakeClient, nombre: string, precio: number): Promise<string> {
  return rpc<string>(sb, 'fn_combo_crear', { p_nombre: nombre, p_precio: precio })
}

export async function guardarFijoCombo(sb: ShakeClient, comboId: string, productoId: string, cantidad: number): Promise<void> {
  await rpc<null>(sb, 'fn_combo_fijo_guardar', { p_combo: comboId, p_producto: productoId, p_cantidad: cantidad })
}

export async function quitarFijoCombo(sb: ShakeClient, comboId: string, productoId: string): Promise<void> {
  await rpc<null>(sb, 'fn_combo_fijo_quitar', { p_combo: comboId, p_producto: productoId })
}

/** Agrega una opción a un grupo; reusa o crea el extra ligado a ese producto. */
export async function agregarOpcionCombo(sb: ShakeClient, comboId: string, grupo: string, productoId: string): Promise<string> {
  return rpc<string>(sb, 'fn_combo_opcion_agregar', { p_combo: comboId, p_grupo: grupo, p_producto: productoId })
}

/** Cambia el producto real que descuenta una opción. */
export async function ligarOpcionCombo(sb: ShakeClient, extraId: string, productoId: string): Promise<void> {
  await rpc<null>(sb, 'fn_combo_opcion_ligar', { p_extra: extraId, p_producto: productoId })
}
