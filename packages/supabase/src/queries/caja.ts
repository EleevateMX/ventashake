import type { Caja, CajaCorte, CorteResumen } from '@shake/types'
import type { ShakeClient } from '../client'

export async function listarCajas(sb: ShakeClient): Promise<Caja[]> {
  const { data, error } = await sb.from('cajas').select('*').eq('activa', true).order('nombre')
  if (error) throw error
  return data
}

/** Corte abierto de una caja, o null si está cerrada. */
export async function corteAbierto(sb: ShakeClient, cajaId: string): Promise<CajaCorte | null> {
  const { data, error } = await sb
    .from('caja_cortes')
    .select('*')
    .eq('caja_id', cajaId)
    .eq('estado', 'abierta')
    .maybeSingle()
  if (error) throw error
  return data
}

/** Abre caja. La base garantiza un solo corte abierto por caja. */
/**
 * Cuantas piezas hay de cada denominacion. Llave = pesos, valor = piezas.
 * `{"200": 2, "100": 1, "20": 15}` son dos billetes de 200, uno de 100 y
 * quince de 20.
 */
export type DesgloseEfectivo = Record<number, number>

export async function abrirCaja(
  sb: ShakeClient,
  cajaId: string,
  fondoInicial: number,
  empleadoId?: string,
  /**
   * El desglose con el que se conto el fondo. Se guarda aparte del total
   * porque el total no sirve para reclamar nada: cuando el lunes falta un
   * billete de 500, lo que hace falta saber es cuantos habia el viernes.
   */
  desglose?: DesgloseEfectivo,
): Promise<CajaCorte> {
  const { data, error } = await sb
    .from('caja_cortes')
    .insert({
      caja_id: cajaId,
      fondo_inicial: fondoInicial,
      empleado_apertura_id: empleadoId ?? null,
      desglose_apertura: desglose ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cerrarCaja(
  sb: ShakeClient,
  corteId: string,
  efectivoContado: number,
  empleadoId?: string,
  notas?: string,
  desglose?: DesgloseEfectivo,
): Promise<void> {
  const { error } = await sb
    .from('caja_cortes')
    .update({
      estado: 'cerrada',
      cerrado_en: new Date().toISOString(),
      efectivo_contado: efectivoContado,
      empleado_cierre_id: empleadoId ?? null,
      notas: notas ?? null,
      desglose_cierre: desglose ?? null,
    })
    .eq('id', corteId)
  if (error) throw error
}

/** Totales del corte por método de pago (vw_corte_resumen). */
export async function resumenCorte(sb: ShakeClient, corteId: string): Promise<CorteResumen> {
  const { data, error } = await sb
    .from('vw_corte_resumen')
    .select('*')
    .eq('corte_id', corteId)
    .single()
  if (error) throw error
  return data
}

/** Un corte ya resumido, con quien lo abrio y cerro y el desglose contado. */
export interface CorteConDetalle extends CorteResumen {
  abrio: string | null
  cerro: string | null
  desglose_apertura: DesgloseEfectivo | null
  desglose_cierre: DesgloseEfectivo | null
}

/**
 * El historial de cortes, para revisarlos desde Admin.
 *
 * Son dos consultas y no una: los totales viven en `vw_corte_resumen` (que
 * ya suma por metodo de pago) y el desglose con los nombres viven en la
 * tabla. Meterlo todo en la vista obligaria a tocarla cada vez que se
 * agregue una columna, y `create or replace view` borra las reloptions
 * -- ahi es donde se pierde el `security_invoker` sin que nadie lo note.
 */
export async function listarCortes(sb: ShakeClient, limite = 60): Promise<CorteConDetalle[]> {
  const { data: resumenes, error: e1 } = await sb
    .from('vw_corte_resumen')
    .select('*')
    .order('abierto_en', { ascending: false })
    .limit(limite)
  if (e1) throw e1

  const ids = (resumenes ?? []).map((r) => r.corte_id).filter(Boolean) as string[]
  if (ids.length === 0) return []

  const { data: detalles, error: e2 } = await sb
    .from('caja_cortes')
    .select(`
      id, desglose_apertura, desglose_cierre,
      apertura:empleados!caja_cortes_empleado_apertura_id_fkey(nombre),
      cierre:empleados!caja_cortes_empleado_cierre_id_fkey(nombre)
    `)
    .in('id', ids)
  if (e2) throw e2

  const porId = new Map((detalles ?? []).map((d) => [d.id, d]))
  return (resumenes ?? []).map((r) => {
    const d = porId.get(r.corte_id as string)
    return {
      ...r,
      abrio: (d?.apertura as { nombre: string } | null)?.nombre ?? null,
      cerro: (d?.cierre as { nombre: string } | null)?.nombre ?? null,
      desglose_apertura: (d?.desglose_apertura as DesgloseEfectivo | null) ?? null,
      desglose_cierre: (d?.desglose_cierre as DesgloseEfectivo | null) ?? null,
    }
  })
}

/** Suma un desglose. La misma cuenta que hace la pantalla al contar. */
export function sumaDesglose(d: DesgloseEfectivo | null | undefined): number {
  if (!d) return 0
  return Object.entries(d).reduce((t, [den, n]) => t + Number(den) * (Number(n) || 0), 0)
}
