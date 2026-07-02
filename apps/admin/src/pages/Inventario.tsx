import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { stockPorAlmacen } from '@shake/supabase'
import type { StockAlmacen } from '@shake/types'

export default function Inventario() {
  const [stock, setStock] = useState<StockAlmacen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    stockPorAlmacen(sb)
      .then(setStock)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <div className="cargando">Cargando inventario…</div>

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h2>Stock por almacén</h2>
        {stock.length === 0 && <p className="muted">Sin existencias registradas.</p>}
        {stock.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Almacén</th>
                <th className="num">Stock actual</th>
                <th className="num">Stock mínimo</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.id ?? Math.random()} className={s.bajo_minimo ? 'alerta' : undefined}>
                  <td>{s.insumo ?? '—'}</td>
                  <td>{s.almacen ?? '—'}</td>
                  <td className={s.bajo_minimo ? 'num rojo' : 'num'}>{s.stock_actual ?? 0}</td>
                  <td className="num">{s.stock_minimo ?? 0}</td>
                  <td>{s.unidad ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
