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

// ------------------ autoprueba y revisión (Ayuda) --------------------

export interface PasoAutoprueba {
  paso: string
  ok: boolean
  detalle: string
}

/**
 * Corre una venta COMPLETA de mentira y comprueba que todo lo que debe
 * dispararse se disparó: comanda, etiqueta en cola, inventario, corte.
 *
 * Cobra de verdad —un `select` no prueba nada del camino del dinero— y
 * después lo deshace todo dentro de la misma transacción, así que no queda
 * ninguna orden ni venta falsa. Lo que NO prueba es la impresora física:
 * como nunca se confirma la transacción, el agente no ve esa comanda.
 */
export async function autopruebaPos(sb: ShakeClient): Promise<PasoAutoprueba[]> {
  const { data, error } = await sb.rpc('fn_autoprueba_pos')
  if (error) throw error
  return (data ?? []) as PasoAutoprueba[]
}

export interface RevisionSistema {
  area: string
  ok: boolean
  detalle: string
  que_hacer: string
}

/** Revisión de configuración: lo que no rompe una venta hoy pero muerde mañana. */
export async function revisarSistema(sb: ShakeClient): Promise<RevisionSistema[]> {
  const { data, error } = await sb.rpc('fn_revision_sistema')
  if (error) throw error
  return (data ?? []) as RevisionSistema[]
}

/** Vuelve a encolar las comandas que agotaron reintentos (solo las de 24 h). */
export async function reintentarImpresiones(sb: ShakeClient): Promise<number> {
  const { data, error } = await sb.rpc('fn_reintentar_impresiones')
  if (error) throw error
  return (data as number) ?? 0
}

// --------------------------- diagnóstico -----------------------------

export interface HallazgoDiagnostico {
  area: string
  severidad: 'alta' | 'media' | 'baja'
  cuantos: number
  titulo: string
  detalle: string
  que_hacer: string
}

export interface Diagnostico {
  revisado_en: string
  hallazgos: HallazgoDiagnostico[]
}

/**
 * El chequeo médico del sistema (RPC `fn_diagnostico_sistema`): no cuántos
 * problemas hay, sino CUÁLES, con ejemplos concretos y qué hacer con cada
 * uno — incluido lo que pasa fuera del punto de venta (Rewards).
 *
 * Exige gerencia del lado del servidor.
 */
export async function diagnosticoSistema(sb: ShakeClient): Promise<Diagnostico> {
  const { data, error } = await (sb.rpc as unknown as
    (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  )('fn_diagnostico_sistema', {})
  if (error) throw error
  return data as Diagnostico
}
