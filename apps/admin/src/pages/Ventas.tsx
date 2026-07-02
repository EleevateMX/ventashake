import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { ventasDiarias, productosMasVendidos } from '@shake/supabase'
import type { VentaDiaria, ProductoVendido } from '@shake/types'
import { mxn } from '@shake/utils'

export default function Ventas() {
  const [dias, setDias] = useState<VentaDiaria[]>([])
  const [top, setTop] = useState<ProductoVendido[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([ventasDiarias(sb, 30), productosMasVendidos(sb, 10)])
      .then(([d, t]) => {
        // Más recientes primero para la vista.
        setDias([...d].reverse())
        setTop(t)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <div className="cargando">Cargando ventas…</div>

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h2>Ventas diarias (últimos 30 días)</h2>
        {dias.length === 0 && <p className="muted">Sin ventas registradas en el periodo.</p>}
        {dias.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Día</th>
                <th className="num">Órdenes</th>
                <th className="num">Total</th>
                <th className="num">Ticket prom.</th>
                <th className="num">Efectivo</th>
                <th className="num">Tarjeta</th>
                <th className="num">Clip</th>
                <th className="num">Cortesía</th>
                <th className="num">Otro</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d) => (
                <tr key={d.dia ?? Math.random()}>
                  <td>{d.dia ?? '—'}</td>
                  <td className="num">{d.num_ordenes ?? 0}</td>
                  <td className="num">{mxn(d.total_ventas)}</td>
                  <td className="num">{mxn(d.ticket_promedio)}</td>
                  <td className="num">{mxn(d.efectivo)}</td>
                  <td className="num">{mxn(d.tarjeta)}</td>
                  <td className="num">{mxn(d.clip)}</td>
                  <td className="num">{mxn(d.cortesia)}</td>
                  <td className="num">{mxn(d.otro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Productos más vendidos (top 10)</h2>
        {top.length === 0 && <p className="muted">Sin datos de productos vendidos.</p>}
        {top.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="num">Total vendido</th>
                <th className="num">Total ingresos</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.id ?? Math.random()}>
                  <td>{p.nombre ?? '—'}</td>
                  <td>{p.categoria ?? '—'}</td>
                  <td className="num">{p.total_vendido ?? 0}</td>
                  <td className="num">{mxn(p.total_ingresos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
