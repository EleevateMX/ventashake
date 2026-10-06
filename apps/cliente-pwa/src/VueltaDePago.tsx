import milo from '@shake/brand/milo.png'
import { useEffect, useState } from 'react'
import { useEstado, pedidoVivo } from './Estado'
import { estadoDePago } from './lib/pedidos'
import { Boton } from './ui'

/**
 * A donde manda Clip al terminar el pago (/pago-app?r=ok|error). Aquí solo
 * se le pregunta al servidor —que a su vez le pregunta a Clip— y se dice
 * qué pasó. La pantalla que abrió el pago sigue sondeando por su cuenta,
 * así que esta puede cerrarse sin más.
 */
export function VueltaDePago() {
  const { fase, misPedidos, cargarMisPedidos } = useEstado()
  const r = new URLSearchParams(window.location.search).get('r')
  const [resultado, setResultado] = useState<'esperando' | 'pagado' | 'pendiente' | 'fallido'>('esperando')

  useEffect(() => {
    if (fase !== 'lista') return
    let vivo = true
    void (async () => {
      await cargarMisPedidos()
      // Se confirma el pedido sin pagar más reciente; si ya no hay, es que ya quedó.
      for (let i = 0; i < 4 && vivo; i++) {
        const sinPagar = misPedidos.filter(pedidoVivo).filter((p) => p.estado === 'por_pagar')
        if (sinPagar.length === 0) { setResultado('pagado'); return }
        const e = await estadoDePago(sinPagar[0].id).catch(() => 'pendiente')
        if (e === 'pagado') { setResultado('pagado'); await cargarMisPedidos(); return }
        if (e === 'fallido') { setResultado('fallido'); return }
        await new Promise((res) => setTimeout(res, 2000))
      }
      if (vivo) setResultado(r === 'error' ? 'fallido' : 'pendiente')
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  const textos = {
    esperando: ['Confirmando con Clip…', 'Un momento.'],
    pagado: ['¡Pedido pagado!', 'Ya lo tiene la barra. Te avisamos cuando esté listo.'],
    pendiente: ['Todavía no vemos el pago', 'Si ya pagaste, dale un momento: en tu tarjeta aparece en cuanto Clip lo confirme.'],
    fallido: ['El pago no se completó', 'Desde tu tarjeta puedes volver a abrir el pago del mismo pedido.'],
  }[fase === 'sinSesion' ? 'pendiente' : resultado]

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center bg-sa-green-deep">
      <img src={milo} alt="" className="w-[110px]" />
      <h1 className="font-display text-[26px] text-sa-cream">{textos[0]}</h1>
      <p className="text-[15px] text-sa-cream/80 max-w-[320px]">{textos[1]}</p>
      <div className="w-full max-w-[300px] pt-4">
        <Boton onClick={() => { window.history.replaceState(null, '', '/'); window.location.reload() }}>Ir a mi tarjeta</Boton>
      </div>
    </div>
  )
}
