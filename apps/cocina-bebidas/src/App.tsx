import { useEffect, useState } from 'react'
import { sb } from './lib/sb'
import { listarPedidosCocina, suscribirPedidosCocina, cambiarEstadoPedido } from '@shake/supabase'
import type { PedidoConItems } from '@shake/supabase'
import type { EstadoCocina } from '@shake/types'

const ESTACION = 'bebidas'
const TITULO = 'Cocina · Bebidas'

// Estado siguiente y etiqueta del botón por estado actual.
const AVANCE: Partial<Record<EstadoCocina, { siguiente: EstadoCocina; etiqueta: string }>> = {
  pendiente: { siguiente: 'en_preparacion', etiqueta: '▶ Preparar' },
  en_preparacion: { siguiente: 'listo', etiqueta: '✓ Listo' },
  listo: { siguiente: 'entregado', etiqueta: '➜ Entregar' },
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'Preparando',
  listo: 'Listo',
}

function minutosDesde(iso: string, ahora: number): number {
  return Math.floor((ahora - new Date(iso).getTime()) / 60000)
}

function claseAntiguedad(min: number): string {
  if (min < 5) return 'nuevo'
  if (min < 10) return 'medio'
  return 'tarde'
}

export default function App() {
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(Date.now())

  async function recargar() {
    try {
      const data = await listarPedidosCocina(sb, ESTACION)
      setPedidos(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void recargar()
    const off = suscribirPedidosCocina(sb, () => { void recargar() })
    return () => { off() }
  }, [])

  // Refresca los contadores de minutos cada 30 s.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  async function avanzar(pedido: PedidoConItems) {
    const paso = AVANCE[pedido.estado]
    if (!paso) return
    try {
      await cambiarEstadoPedido(sb, pedido.id, paso.siguiente)
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (cargando) return <div className="cargando">Cargando comandas…</div>

  return (
    <div className="app">
      <header className="header">
        <h1>🥤 {TITULO}</h1>
        <span className="contador">{pedidos.length} activos</span>
      </header>

      {error && <div className="error-msg">{error}</div>}

      {pedidos.length === 0 && !error && (
        <div className="vacio">Sin comandas activas. Todo al día 🎉</div>
      )}

      <div className="grid-pedidos">
        {pedidos.map((pedido) => {
          const min = minutosDesde(pedido.created_at, ahora)
          const paso = AVANCE[pedido.estado]
          return (
            <div key={pedido.id} className={`comanda ${claseAntiguedad(min)}`}>
              <div className="comanda-top">
                <span className="folio">#{pedido.ordenes?.folio ?? '—'}</span>
                <span className="canal">{pedido.ordenes?.canal ?? ''}</span>
              </div>
              <div className="comanda-meta">
                <span className="tiempo">{min} min</span>
                <span className={`estado ${pedido.estado}`}>
                  {ETIQUETA_ESTADO[pedido.estado] ?? pedido.estado}
                </span>
              </div>
              <ul className="items">
                {pedido.cocina_items.map((item) => (
                  <li key={item.id}>
                    <span className="cant">{item.cantidad}×</span>
                    <span className="nom">{item.productos?.nombre ?? '—'}</span>
                    {item.personalizacion && (
                      <span className="pers">↳ {item.personalizacion}</span>
                    )}
                  </li>
                ))}
              </ul>
              {paso && (
                <button className="avanzar" onClick={() => void avanzar(pedido)}>
                  {paso.etiqueta}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
