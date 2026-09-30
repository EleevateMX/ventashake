import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { productosMasVendidos } from '@shake/supabase'
import type { ProductoVendido } from '@shake/types'
import { mxn, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'
import { ProductosVendidos } from '../components/ProductosVendidos'
import { CancelarVentas } from '../components/CancelarVentas'
import { CierreDiario } from '../components/CierreDiario'

export default function Ventas() {
  const [top, setTop] = useState<ProductoVendido[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    productosMasVendidos(sb, 10)
      .then((t) => {
        setTop(t)
        setError(null)
      })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <Loading>Cargando ventas…</Loading>

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Reportes de ventas y productos" />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="space-y-6">
        <div>
          <h3 className={`${cx.h3} mb-1`}>Historial y cierre del día</h3>
          <p className={`${cx.muted} text-sm mb-4`}>
            Por semana, mes, año o rango. Cada día dice si cuadró: el efectivo contra lo contado en
            los cortes, y la tarjeta y Clip contra lo que reporta Clip.
          </p>
          <CierreDiario />
        </div>

        <div>
          <h3 className={`${cx.h3} mb-1`}>Cancelar una venta</h3>
          <p className={`${cx.muted} text-sm mb-4`}>
            De cualquier día, no solo de hoy. Queda registrado qué se canceló,
            cuándo fue la venta, cuándo se canceló, quién y por qué.
          </p>
          <CancelarVentas />
        </div>

        <div>
          <h3 className={`${cx.h3} mb-1`}>Cuántos se vendieron</h3>
          <p className={`${cx.muted} text-sm mb-4`}>
            Elige un producto y un periodo. Sirve para pedir mercancía y para
            contestar «¿cuántos Choco Killer van hoy?» sin bajar por toda la
            lista.
          </p>
          <ProductosVendidos />
        </div>

        <div>
          <h3 className={`${cx.h3} mb-4`}>Productos más vendidos (top 10)</h3>
          {top.length === 0 ? (
            <Panel><p className={cx.muted}>Sin datos de productos vendidos.</p></Panel>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Producto</th>
                    <th className={cx.th}>Categoría</th>
                    <th className={cx.thNum}>Total vendido</th>
                    <th className={cx.thNum}>Total ingresos</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {top.map((p) => (
                    <tr key={p.id ?? Math.random()} className={cx.tr}>
                      <td className={`${cx.td} font-medium`}>{p.nombre ?? '—'}</td>
                      <td className={cx.td}>{p.categoria ?? '—'}</td>
                      <td className={cx.tdNum}>{p.total_vendido ?? 0}</td>
                      <td className={cx.tdNum}>{mxn(p.total_ingresos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
