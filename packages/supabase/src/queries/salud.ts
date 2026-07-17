import type { ShakeClient } from '../client'

export interface SaludSistema {
  pagosPendientes: number
  pagosDesconocidos: number
  ordenesEsperandoCaja: number
  ordenesExpiradas24h: number
  impresorasActivas: number
  impresorasConectadas: number
  trabajosImpresionFallidos: number
  pedidosSinComanda: number
  ventasSinMovimientoInventario: number
}

/**
 * Indicadores operativos para el panel de Admin, en una sola llamada
 * (fn_salud_sistema, SQL puro del lado servidor — "ventas sin movimiento
 * de inventario" no se puede resolver con el embedding automático de
 * PostgREST porque `inventario_movimientos.referencia_id` no tiene FK
 * formal a `ordenes`, así que se calcula ahí). Ver docs/checklist-produccion.md.
 */
export async function obtenerSaludSistema(sb: ShakeClient): Promise<SaludSistema> {
  const { data, error } = await sb.rpc('fn_salud_sistema')
  if (error) throw error
  const fila = Array.isArray(data) ? data[0] : data
  return {
    pagosPendientes: fila?.pagos_pendientes ?? 0,
    pagosDesconocidos: fila?.pagos_desconocidos ?? 0,
    ordenesEsperandoCaja: fila?.ordenes_esperando_caja ?? 0,
    ordenesExpiradas24h: fila?.ordenes_expiradas_24h ?? 0,
    impresorasActivas: fila?.impresoras_activas ?? 0,
    impresorasConectadas: fila?.impresoras_conectadas ?? 0,
    trabajosImpresionFallidos: fila?.trabajos_impresion_fallidos ?? 0,
    pedidosSinComanda: fila?.pedidos_sin_comanda ?? 0,
    ventasSinMovimientoInventario: fila?.ventas_sin_movimiento_inventario ?? 0,
  }
}
