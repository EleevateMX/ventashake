import { useCallback, useEffect, useState } from 'react'
import { productosVendidos, type ProductoEnPeriodo } from '@shake/supabase'
import { mxn, mensajeDeError, hoyEnMerida, diasAntesEnMerida } from '@shake/utils'
import { sb } from '../lib/sb'
import { Panel, ErrorMsg, Chip, cx } from '../ui'

/**
 * Cuántas piezas de un producto se vendieron en un periodo.
 *
 * Es la pregunta contraria a la del top 10, y por eso hacía falta: el top
 * contesta «qué se vende más» y aquí se pregunta «de ESTE, cuántos van».
 * Con un top 10 eso no se puede responder para nada que no esté en el
 * top, que es justo donde viven las dudas de compras.
 *
 * Los días son **días de Mérida**. El servidor agrupa por
 * `at time zone 'America/Merida'`, así que mandarle el día del navegador
 * dejaría el reporte en blanco todas las tardes a partir de las 6.
 */

const PERIODOS = [
  { id: 'hoy', label: 'Hoy', dias: 0 },
  { id: 'semana', label: '7 días', dias: 6 },
  { id: 'mes', label: '30 días', dias: 29 },
  { id: 'trimestre', label: '90 días', dias: 89 },
] as const

type PeriodoId = (typeof PERIODOS)[number]['id'] | 'rango'

export function ProductosVendidos() {
  const [periodo, setPeriodo] = useState<PeriodoId>('hoy')
  const [desde, setDesde] = useState(hoyEnMerida())
  const [hasta, setHasta] = useState(hoyEnMerida())
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<ProductoEnPeriodo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Al tocar un periodo se recalculan las fechas; el rango a mano manda. */
  function elegirPeriodo(id: PeriodoId, dias?: number) {
    setPeriodo(id)
    if (dias === undefined) return
    setDesde(diasAntesEnMerida(dias))
    setHasta(hoyEnMerida())
  }

  const consultar = useCallback(async () => {
    setFilas(null); setError(null)
    try {
      setFilas(await productosVendidos(sb, desde, hasta, texto))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }, [desde, hasta, texto])

  // A propósito solo con las fechas: `consultar` también depende del texto,
  // y volver a pedir en cada tecla haría una consulta por letra.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void consultar() }, [desde, hasta])

  const totalPiezas = (filas ?? []).reduce((s, f) => s + f.piezas, 0)
  const totalImporte = (filas ?? []).reduce((s, f) => s + f.importe, 0)

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            onClick={() => elegirPeriodo(p.id, p.dias)}
            className={`px-4 py-2 rounded-full text-sm border transition-colors ${
              periodo === p.id
                ? 'bg-sa-green text-sa-cream border-sa-green'
                : 'bg-white border-sa-green-ink/15 text-sa-green-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setPeriodo('rango')}
          className={`px-4 py-2 rounded-full text-sm border transition-colors ${
            periodo === 'rango'
              ? 'bg-sa-green text-sa-cream border-sa-green'
              : 'bg-white border-sa-green-ink/15 text-sa-green-ink'
          }`}
        >
          Entre dos fechas
        </button>
      </div>

      <div className="flex gap-3 flex-wrap items-end mb-4">
        {periodo === 'rango' && (
          <>
            <label className="text-xs text-sa-green-ink/60">
              Desde
              <input
                type="date" value={desde} max={hasta}
                onChange={(e) => setDesde(e.target.value)}
                className={`${cx.input} !py-2 font-mono text-xs block mt-1`}
              />
            </label>
            <label className="text-xs text-sa-green-ink/60">
              Hasta
              <input
                type="date" value={hasta} min={desde} max={hoyEnMerida()}
                onChange={(e) => setHasta(e.target.value)}
                className={`${cx.input} !py-2 font-mono text-xs block mt-1`}
              />
            </label>
          </>
        )}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void consultar() }}
          placeholder="Producto o categoría… (vacío = todos)"
          className={`${cx.input} !py-2 w-72`}
        />
        <button onClick={() => void consultar()} className={cx.btnPrimary}>
          Buscar
        </button>
      </div>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {filas === null ? (
        <Panel><p className={cx.muted}>Consultando…</p></Panel>
      ) : filas.length === 0 ? (
        <Panel>
          <p className={cx.muted}>
            No se vendió nada que empate con eso entre {desde} y {hasta}.
          </p>
        </Panel>
      ) : (
        <>
          <p className={`${cx.muted} font-mono text-xs mb-2`}>
            {desde} → {hasta} · {filas.length} producto{filas.length === 1 ? '' : 's'} ·{' '}
            {totalPiezas} pieza{totalPiezas === 1 ? '' : 's'} · {mxn(totalImporte)}
          </p>
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Producto</th>
                  <th className={cx.th}>Categoría</th>
                  <th className={cx.thNum}>Piezas</th>
                  <th className={cx.thNum}>Tickets</th>
                  <th className={cx.thNum}>Importe</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {filas.map((f) => (
                  <tr key={f.producto_id} className={cx.tr}>
                    <td className={`${cx.td} font-medium`}>
                      {f.producto}
                      {/* Un extra vendido colgado de un shake es una pieza de
                          ese extra: para pedir mercancía eso es justo lo que
                          hay que saber, pero hay que poder distinguirlo de
                          una venta suelta. */}
                      {f.piezas_como_extra > 0 && (
                        <Chip tone="neutral">
                          {f.piezas_como_extra === f.piezas
                            ? 'siempre como extra'
                            : `${f.piezas_como_extra} como extra`}
                        </Chip>
                      )}
                    </td>
                    <td className={cx.td}>{f.categoria ?? '—'}</td>
                    <td className={`${cx.tdNum} font-medium`}>{f.piezas}</td>
                    <td className={cx.tdNum}>{f.tickets}</td>
                    <td className={cx.tdNum}>{mxn(f.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`${cx.muted} text-xs mt-3 leading-relaxed`}>
            No cuentan las canceladas ni las pruebas. El día es el de Mérida,
            así que «hoy» termina al cerrar la tienda y no a las 6 de la tarde.
          </p>
        </>
      )}
    </div>
  )
}
