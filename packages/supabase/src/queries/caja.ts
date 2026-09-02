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
