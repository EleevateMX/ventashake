/**
 * La última respuesta buena, para cuando no hay internet (08/10/26).
 *
 * El catálogo se vuelve a pedir cada vez que se regresa al menú: sin
 * internet, la primera venta guardada dejaba el menú vacío al volver. Con
 * esto, si la consulta falla se usa lo último que sí llegó. Si llega bien,
 * se guarda — así el respaldo siempre es de hoy.
 *
 * Solo sirve para LEER (catálogo, modo, caja abierta). Nada que cobre pasa
 * por aquí: el dinero lo sigue calculando el servidor.
 */

import { useConexion } from './conexion'

const PREFIJO = 'shake_respaldo_v1:'

/**
 * Sin internet, con la red de la tienda viva, una consulta no falla: se
 * queda colgada. Por eso, si ya se sabe que no hay internet se usa el
 * respaldo de una vez, y si la consulta tarda más de 8 s también.
 */
export async function conRespaldo<T>(clave: string, pedir: () => Promise<T>): Promise<T> {
  const guardado = leerRespaldo<T>(clave)
  if (guardado !== undefined && !useConexion.getState().enLinea) return guardado
  try {
    const consulta = pedir().then((valor) => {
      guardarRespaldo(clave, valor)
      return valor
    })
    if (guardado === undefined) return await consulta
    consulta.catch(() => { /* ya se contestó con el respaldo */ })
    return await Promise.race([
      consulta,
      new Promise<T>((ok) => setTimeout(() => ok(guardado), 8000)),
    ])
  } catch (e) {
    if (guardado !== undefined) return guardado
    throw e
  }
}

export function guardarRespaldo<T>(clave: string, valor: T): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify({ en: new Date().toISOString(), valor }))
  } catch {
    // Lleno o bloqueado.
  }
}

export function leerRespaldo<T>(clave: string): T | undefined {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave)
    if (!crudo) return undefined
    return (JSON.parse(crudo) as { valor: T }).valor
  } catch {
    return undefined
  }
}
