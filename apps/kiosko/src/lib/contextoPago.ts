import { listarAlmacenes, listarCajas, corteAbierto } from '@shake/supabase'
import type { Almacen, CajaCorte, ModoPagoKiosko } from '@shake/types'
import { sb } from './sb'
import { resolverModoKiosko } from './modoKiosko'
import { conRespaldo } from './respaldo'

export interface ContextoPago {
  kiosko: Almacen
  modoResuelto: ModoPagoKiosko
  corteActual: CajaCorte | null
}

/**
 * De qué almacén sale la venta, en qué modo cobra el kiosko y en qué corte
 * cae. Con respaldo (08/10/26): sin internet la venta igual lo necesita.
 *
 * App.tsx lo precarga al abrir y cada 5 minutos, para que el respaldo
 * exista y esté fresco ANTES de que se vaya el internet — si solo se
 * guardara al cobrar con internet, el primer apagón después de actualizar
 * encontraría la pantalla de pago sin datos.
 */
export function contextoDePago(): Promise<ContextoPago> {
  return conRespaldo('pago_contexto', async () => {
    const almacenes = await listarAlmacenes(sb)
    const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0] ?? null
    if (!kiosko) throw new Error('No hay almacén configurado para el kiosko.')
    const modoResuelto = await resolverModoKiosko(sb, kiosko.sucursal_id)
    // En modo cajero la venta tiene que caer en el corte abierto; si no, no
    // aparece en el arqueo del día. Se resuelve aquí y no al cobrar para
    // que un problema de configuración salte antes, no a media venta.
    let corteActual: CajaCorte | null = null
    if (modoResuelto === 'cajero') {
      const cajas = await listarCajas(sb)
      const caja = cajas.find((c) => c.sucursal_id === kiosko.sucursal_id) ?? cajas[0] ?? null
      corteActual = caja ? await corteAbierto(sb, caja.id) : null
    }
    return { kiosko, modoResuelto, corteActual }
  })
}
