import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { ventasDiarias, productosMasVendidos, stockPorAlmacen } from '@shake/supabase'
import type { VentaDiaria, ProductoVendido, StockAlmacen } from '@shake/types'
import { mxn } from '@shake/utils'

const HOY = new Date().toISOString().slice(0, 10)

export default function Dashboard() {
  const [dias, setDias] = useState<VentaDiaria[]>([])
  const [top, setTop] = useState<ProductoVendido[]>([])
  const [stock, setStock] = useState<StockAlmacen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([ventasDiarias(sb, 7), productosMasVendidos(sb, 6), stockPorAlmacen(sb)])
      .then(([d, t, s]) => {
        setDias(d)
        setTop(t)
        setStock(s)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <div className="cargando">Cargando panel…</div>

  const hoy = dias.find((d) => d.dia === HOY)
  const totalHoy = hoy?.total_ventas ?? 0
  const ordHoy = hoy?.num_ordenes ?? 0
  const ticket = hoy?.ticket_promedio ?? 0
  const semana = dias.reduce((a, d) => a + (d.total_ventas ?? 0), 0)
  const maxDia = Math.max(1, ...dias.map((d) => d.total_ventas ?? 0))
  const bajos = stock.filter((s) => s.bajo_minimo)

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      {/* KPIs del día */}
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-lbl">Ventas de hoy</span>
          <span className="kpi-val">{mxn(totalHoy)}</span>
          <span className="kpi-sub">{ordHoy} {ordHoy === 1 ? 'orden' : 'órdenes'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-lbl">Ticket promedio</span>
          <span className="kpi-val">{mxn(ticket)}</span>
          <span className="kpi-sub">hoy</span>
        </div>
        <div className="kpi">
          <span className="kpi-lbl">Ventas 7 días</span>
          <span className="kpi-val">{mxn(semana)}</span>
          <span className="kpi-sub">acumulado</span>
        </div>
        <div className="kpi" style={{ borderTopColor: bajos.length ? 'var(--sa-strawberry)' : 'var(--sa-mint)' }}>
          <span className="kpi-lbl">Alertas de stock</span>
          <span className="kpi-val">{bajos.length}</span>
          <span className="kpi-sub">bajo mínimo</span>
        </div>
      </div>

      {/* Desglose de pago de hoy */}
      <div className="panel">
        <h2>Cómo se cobró hoy</h2>
        {!hoy && <p className="muted">Aún no hay ventas registradas hoy.</p>}
        {hoy && (
          <div className="pagos-hoy">
            <div><span className="muted">Efectivo</span><b>{mxn(hoy.efectivo ?? 0)}</b></div>
            <div><span className="muted">Tarjeta</span><b>{mxn(hoy.tarjeta ?? 0)}</b></div>
            <div><span className="muted">Clip</span><b>{mxn(hoy.clip ?? 0)}</b></div>
            <div><span className="muted">Cortesía</span><b>{mxn(hoy.cortesia ?? 0)}</b></div>
          </div>
        )}
      </div>

      {/* Tendencia 7 días */}
      <div className="panel">
        <h2>Últimos 7 días</h2>
        {dias.length === 0 && <p className="muted">Sin ventas en el periodo.</p>}
        {dias.length > 0 && (
          <div className="bars">
            {dias.map((d) => (
              <div className="bar-col" key={d.dia}>
                <div className="bar-wrap">
                  <div className="bar" style={{ height: `${Math.round(((d.total_ventas ?? 0) / maxDia) * 100)}%` }} title={mxn(d.total_ventas ?? 0)} />
                </div>
                <span className="bar-lbl">{new Date(d.dia + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash-2col">
        {/* Top productos */}
        <div className="panel">
          <h2>Más vendidos</h2>
          {top.length === 0 && <p className="muted">Sin datos aún.</p>}
          {top.length > 0 && (
            <table>
              <thead><tr><th>Producto</th><th className="num">Uds</th><th className="num">Ingreso</th></tr></thead>
              <tbody>
                {top.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nombre}<span className="chip no" style={{ marginLeft: 6 }}>{p.categoria}</span></td>
                    <td className="num">{p.total_vendido}</td>
                    <td className="num">{mxn(p.total_ingresos ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Alertas de stock */}
        <div className="panel">
          <h2>Stock bajo mínimo</h2>
          {bajos.length === 0 && <p className="muted">Todo por encima del mínimo. 👍</p>}
          {bajos.length > 0 && (
            <table>
              <thead><tr><th>Insumo</th><th>Almacén</th><th className="num">Stock</th><th className="num">Mín</th></tr></thead>
              <tbody>
                {bajos.map((s) => (
                  <tr className="alerta" key={s.id}>
                    <td>{s.insumo}</td>
                    <td>{s.almacen}</td>
                    <td className="num rojo">{s.stock_actual} {s.unidad}</td>
                    <td className="num">{s.stock_minimo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
