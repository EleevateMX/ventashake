import type { CosteoProducto, Parametros } from '@shake/types'
import type { ShakeClient } from '../client'
import { traerTodo } from './paginar'

/**
 * Costeo por producto calculado en la base (vw_costeo_producto).
 * Al cambiar el costo de un insumo, la vista refleja el recálculo
 * de todos los productos relacionados automáticamente.
 */
export async function listarCosteo(sb: ShakeClient): Promise<CosteoProducto[]> {
  // Paginado: la vista trae 1 468 renglones y PostgREST corta en 1 000
  // sin avisar. Un costeo al que le faltan 468 productos no se ve roto,
  // se ve corto — que es peor. Ver `paginar.ts`.
  return traerTodo<CosteoProducto>((desde, hasta) =>
    sb.from('vw_costeo_producto').select('*')
      .order('nombre').order('id')
      .range(desde, hasta) as unknown as PromiseLike<{ data: CosteoProducto[] | null; error: unknown }>,
  )
}

export async function obtenerParametros(sb: ShakeClient): Promise<Parametros> {
  const { data, error } = await sb.from('parametros').select('*').eq('id', 'default').single()
  if (error) throw error
  return data
}

export async function actualizarParametros(
  sb: ShakeClient,
  cambios: Partial<Pick<Parametros, 'iva' | 'food_cost_meta' | 'merma_default' | 'mano_obra'>>,
): Promise<void> {
  const { error } = await sb.from('parametros').update(cambios).eq('id', 'default')
  if (error) throw error
}
