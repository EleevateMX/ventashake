import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { stockPorAlmacen } from '@shake/supabase'
import type { StockAlmacen } from '@shake/types'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'
import { mensajeDeError } from '@shake/utils'
import { HuecosInventario } from '../components/HuecosInventario'

/**
 * El inventario tiene dos preguntas y no son la misma.
 *
 * «Existencias» contesta cuánto hay. «Huecos» contesta por qué ese número
 * no baja cuando se vende — que es lo que llevaba treinta días sin que
 * nadie lo notara, porque el descuento fallaba callado.
 */
type Vista = 'existencias' | 'huecos'

export default function Inventario() {
  const [vista, setVista] = useState<Vista>('existencias')
  const [stock, setStock] = useState<StockAlmacen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    stockPorAlmacen(sb)
      .then(setStock)
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  const pestanas: { id: Vista; label: string }[] = [
    { id: 'existencias', label: 'Existencias' },
    { id: 'huecos', label: 'Lo que no descuenta' },
  ]

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={vista === 'existencias' ? 'Stock por almacén' : 'Lo que se vende y no baja del almacén'}
        action={
          <div className="flex gap-1">
            {pestanas.map((p) => (
              <button
                key={p.id}
                onClick={() => setVista(p.id)}
                className={p.id === vista ? cx.btnPrimary : cx.btnSec}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {vista === 'huecos' ? <HuecosInventario /> : <Existencias stock={stock} cargando={cargando} error={error} />}
    </div>
  )
}

function Existencias({ stock, cargando, error }: {
  stock: StockAlmacen[]; cargando: boolean; error: string | null
}) {
  if (cargando) return <Loading>Cargando inventario…</Loading>

  return (
    <div>
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {stock.length === 0 ? (
        <Panel><p className={cx.muted}>Sin existencias registradas.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Insumo</th>
                <th className={cx.th}>Almacén</th>
                <th className={cx.thNum}>Stock actual</th>
                <th className={cx.thNum}>Stock mínimo</th>
                <th className={cx.th}>Unidad</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {stock.map((s) => (
                <tr key={s.id ?? Math.random()} className={`${cx.tr} ${s.bajo_minimo ? 'bg-sa-strawberry/5' : ''}`}>
                  <td className={`${cx.td} font-medium`}>{s.insumo ?? '—'}</td>
                  <td className={cx.td}>{s.almacen ?? '—'}</td>
                  <td className={`${cx.tdNum} ${s.bajo_minimo ? 'text-sa-strawberry font-semibold' : ''}`}>{s.stock_actual ?? 0}</td>
                  <td className={cx.tdNum}>{s.stock_minimo ?? 0}</td>
                  <td className={cx.td}>{s.unidad ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
