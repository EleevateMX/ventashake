import type { ShakeClient } from '../client'

/**
 * Recarga remota de las pantallas de la tienda.
 *
 * Después de cambiar precios o productos (en Admin o en Costeos), gerencia
 * toca un botón y las pantallas se refrescan solas — nadie camina a cada
 * monitor a picar F5.
 */

type RpcPantallas = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

export type PantallaDeTienda = 'kiosko' | 'barra' | 'cocina' | 'pantalla'

/**
 * Suscripción al timbre de recargas: cuando gerencia pide "actualizar
 * pantallas" desde Admin, cada pantalla suscrita ejecuta `alRecibir`.
 * Devuelve la función para colgar el canal (cleanup de React).
 *
 * `alRecibir` decide CÓMO recargar: las pantallas de solo lectura (barra,
 * cocina, folios) recargan al instante; el kiosko espera a no tener un
 * pedido a medias para no tirarle el carrito a un cliente.
 */
export function escucharRecargas(
  sb: ShakeClient,
  pantalla: PantallaDeTienda,
  alRecibir: () => void,
): () => void {
  const canal = sb
    .channel(`recargas-${pantalla}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'senales_pantallas' },
      (evento: { new?: { pantalla?: string; accion?: string } }) => {
        const fila = evento.new
        if (!fila || fila.accion !== 'recargar') return
        if (fila.pantalla === pantalla || fila.pantalla === 'todas') alRecibir()
      },
    )
    .subscribe()
  return () => { void sb.removeChannel(canal) }
}

/** Admin: toca el timbre (RPC con candado de gerencia). */
export async function pedirRecargaPantallas(
  sb: ShakeClient,
  pantalla: PantallaDeTienda | 'todas',
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcPantallas)('fn_pantallas_recargar', {
    p_pantalla: pantalla,
  })
  if (error) throw error
}
