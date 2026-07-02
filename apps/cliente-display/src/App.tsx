import { useEffect, useMemo, useState } from 'react'
import { sb } from './lib/sb'
import { listarPedidosActivos, suscribirPedidosCocina } from '@shake/supabase'
import type { PedidoConItems } from '@shake/supabase'

interface FolioAgrupado {
  folio: number
  listo: boolean
}

/** Agrupa los pedidos por folio. Un folio solo está "listo" si TODAS
 *  sus filas (una por cocina) están en estado 'listo'. */
function agruparPorFolio(pedidos: PedidoConItems[]): FolioAgrupado[] {
  const mapa = new Map<number, boolean>()
  for (const p of pedidos) {
    const folio = p.ordenes?.folio
    if (folio == null) continue
    const estaListo = p.estado === 'listo'
    const previo = mapa.get(folio)
    mapa.set(folio, previo == null ? estaListo : previo && estaListo)
  }
  return [...mapa.entries()]
    .map(([folio, listo]) => ({ folio, listo }))
    .sort((a, b) => a.folio - b.folio)
}

export default function App() {
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloj, setReloj] = useState(() => new Date())

  async function recargar() {
    try {
      setPedidos(await listarPedidosActivos(sb))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void recargar()
    const desuscribir = suscribirPedidosCocina(sb, () => void recargar())
    // Respaldo por si el realtime se cae.
    const intervalo = setInterval(() => void recargar(), 15_000)
    const tick = setInterval(() => setReloj(new Date()), 1_000)
    return () => {
      desuscribir()
      clearInterval(intervalo)
      clearInterval(tick)
    }
  }, [])

  const folios = useMemo(() => agruparPorFolio(pedidos), [pedidos])
  const enPreparacion = folios.filter((f) => !f.listo)
  const listos = folios.filter((f) => f.listo)

  if (cargando) return <div className="estado-full">Cargando pedidos…</div>
  if (error) return <div className="estado-full error">Error: {error}</div>

  const hora = reloj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="display">
      <header className="display-header">
        <h1>🥤 Shakeaholic · Estado de tu pedido</h1>
        <span className="reloj">{hora}</span>
      </header>

      <div className="columnas">
        <section className="columna prep">
          <h2>En preparación</h2>
          {enPreparacion.length === 0 ? (
            <p className="vacio">Sin pedidos en preparación</p>
          ) : (
            <div className="folios">
              {enPreparacion.map((f) => (
                <div className="folio" key={f.folio}>
                  <span className="num">{f.folio}</span>
                  <span className="etq">Folio</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="columna lista">
          <h2>Listo para recoger</h2>
          {listos.length === 0 ? (
            <p className="vacio">Sin pedidos listos</p>
          ) : (
            <div className="folios">
              {listos.map((f) => (
                <div className="folio" key={f.folio}>
                  <span className="num">{f.folio}</span>
                  <span className="etq">Folio</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
