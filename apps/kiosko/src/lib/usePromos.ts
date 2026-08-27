import { useEffect, useMemo, useState } from 'react'
import { promosVigentes } from '@shake/supabase'
import { descuentoPromos, type LineaParaPromo, type PromoVigente } from '@shake/utils'
import { sb } from './sb'

/**
 * Las promos automáticas vigentes, para PREVISUALIZAR el descuento.
 *
 * El total que se cobra siempre es el que devuelve el servidor al crear la
 * orden. Esto solo existe para que el carrito y la calculadora de cambio
 * enseñen el mismo número que se va a cobrar: pedir $30 y cobrar $25
 * descuadra el cajón todos los días.
 *
 * Si la consulta falla no pasa nada visible: se muestran los precios de
 * lista y el servidor igual aplica la promo al cobrar. Un error rojo aquí
 * asustaría al cajero por algo que no le impide vender.
 */
export function usePromos(lineas: LineaParaPromo[]) {
  const [promos, setPromos] = useState<PromoVigente[]>([])

  useEffect(() => {
    let vivo = true
    promosVigentes(sb)
      .then((p) => { if (vivo) setPromos(p) })
      .catch(() => { /* silencio a propósito: ver arriba */ })
    return () => { vivo = false }
  }, [])

  const aplicadas = useMemo(() => descuentoPromos(lineas, promos), [lineas, promos])
  const descuento = useMemo(() => aplicadas.reduce((s, a) => s + a.descuento, 0), [aplicadas])

  return { aplicadas, descuento }
}
