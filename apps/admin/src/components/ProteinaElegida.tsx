import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { proteinasElegidas, guardarProteinaElegida } from '@shake/supabase'
import type { ProteinasElegidas } from '@shake/supabase'
import type { StockAlmacen } from '@shake/types'
import { botesYScoops, mensajeDeError } from '@shake/utils'
import { Loading, ErrorMsg, OkMsg, Panel, cx } from '../ui'

/**
 * ¿De qué bote sale cada proteína? (09/10/26)
 *
 * Desde hoy un shake descuenta la proteína que **eligió el cliente**, no la
 * fija de su receta. Para eso cada «Proteína MARCA - sabor» tiene que saber
 * de qué bote sale. 30 se ligaron solas (marca y sabor empatan sin duda);
 * las que no, salen aquí arriba para ligarlas a mano. Mientras una no esté
 * ligada, ese shake descuenta como antes: la proteína fija de su receta.
 *
 * No arregla nada solo: Costeos es donde nacen los botes y sus recetas, y
 * lo que está chueco allá se enlista para corregirlo allá.
 */
export function ProteinaElegida({ stock }: { stock: StockAlmacen[] }) {
  const [d, setD] = useState<ProteinasElegidas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const cargar = useCallback(() => {
    proteinasElegidas(sb)
      .then((r) => { setD(r); setError(null) })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const porBote = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const i of d?.insumos ?? []) m.set(i.id, i.scoops_por_bote)
    return m
  }, [d])

  if (cargando) return <Loading>Cargando proteínas…</Loading>
  if (error && !d) return <ErrorMsg>{error}</ErrorMsg>
  if (!d) return null

  const sinLigar = d.proteinas.filter((p) => !p.insumo_id)
  const rotos = d.insumos.filter((i) => i.nombre.includes('—'))
  const t = q.trim().toLowerCase()
  const lista = d.proteinas.filter((p) => !t || p.nombre.toLowerCase().includes(t) || (p.insumo ?? '').toLowerCase().includes(t))

  async function ligar(extraId: string, insumoId: string | null) {
    setGuardando(extraId)
    setAviso(null)
    setError(null)
    try {
      await guardarProteinaElegida(sb, extraId, insumoId)
      setAviso('Guardado. Las ventas de ahora en adelante descuentan de ese bote.')
      cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(null)
    }
  }

  // Existencias de proteína en botes + scoops: el sistema guarda scoops.
  const existencias = stock
    .filter((s) => s.insumo_tipo === 'proteina' && s.insumo_id && Number(s.stock_actual ?? 0) !== 0)

  return (
    <div className="space-y-6">
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {aviso && <OkMsg>{aviso}</OkMsg>}

      <Panel>
        <p className="text-sm text-sa-green-ink/75 leading-relaxed">
          <b>Un shake descuenta la proteína que eligió el cliente</b>, no la fija de su receta,
          y el <b>doble scoop</b> descuenta un scoop más de esa misma. Todo se guarda en
          <b> scoops</b>: la bodega tiene botes cerrados, la barra scoops, y «vino de bodega»
          en el kiosko pasa los scoops de un bote de un lado al otro. Una proteína
          <b> sin bote</b> no descuenta nada al elegirse, y ese shake sigue descontando la
          proteína fija de su receta, como antes.
        </p>
      </Panel>

      {(sinLigar.length > 0 || d.botes_otro_sabor.length > 0 || rotos.length > 0) && (
        <Panel>
          <p className="font-display text-xl text-sa-green-ink mb-3">Lo que hay que revisar</p>
          {sinLigar.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-sa-strawberry">
                {sinLigar.length} proteína{sinLigar.length === 1 ? '' : 's'} sin bote
              </p>
              <p className={`${cx.muted} text-xs mb-1`}>Elige su bote en la tabla de abajo (salen primero).</p>
              <ul className="text-sm text-sa-green-ink list-disc pl-5">
                {sinLigar.map((p) => <li key={p.id}>{p.nombre}{p.activo ? '' : ' (apagada)'}</li>)}
              </ul>
            </div>
          )}
          {d.botes_otro_sabor.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-sa-strawberry">
                Botes que descuentan otro sabor
              </p>
              <p className={`${cx.muted} text-xs mb-1`}>
                Se corrige en Costeos, en la receta del bote: ahí nace y el siguiente guardado pisaría lo que se cambie aquí.
              </p>
              <ul className="text-sm text-sa-green-ink list-disc pl-5">
                {d.botes_otro_sabor.map((b) => <li key={b.producto + b.insumo}>{b.producto} → descuenta <i>{b.insumo}</i></li>)}
              </ul>
            </div>
          )}
          {rotos.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-sa-strawberry">Nombres rotos en Costeos</p>
              <p className={`${cx.muted} text-xs mb-1`}>
                Les falta el sabor (o la marca está repetida). Se corrigen en Costeos → Proteínas.
              </p>
              <ul className="text-sm text-sa-green-ink list-disc pl-5">
                {rotos.map((i) => <li key={i.id}>{i.nombre}</li>)}
              </ul>
            </div>
          )}
        </Panel>
      )}

      <div>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <p className="font-display text-xl text-sa-green-ink flex-1">¿De qué bote sale cada proteína?</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className={`${cx.input} w-56`} />
        </div>
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Proteína que elige el cliente</th>
                <th className={cx.thNum}>Vendidas 30 días</th>
                <th className={cx.th}>Descuenta 1 scoop de</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {[...lista].sort((a, b) => Number(!!a.insumo_id) - Number(!!b.insumo_id)).map((p) => (
                <tr key={p.id} className={`${cx.tr} ${p.insumo_id ? '' : 'bg-sa-strawberry/5'}`}>
                  <td className={`${cx.td} font-medium`}>
                    {p.nombre}
                    {!p.activo && <span className={`${cx.muted} text-xs`}> · apagada</span>}
                  </td>
                  <td className={cx.tdNum}>{Number(p.vendidas_30d).toLocaleString('es-MX')}</td>
                  <td className={cx.td}>
                    <select
                      value={p.insumo_id ?? ''}
                      disabled={guardando === p.id}
                      onChange={(e) => void ligar(p.id, e.target.value || null)}
                      className={`${cx.input} w-full max-w-md`}
                    >
                      <option value="">— Sin bote (no descuenta) —</option>
                      {d.insumos.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nombre}{i.scoops_por_bote ? ` · ${Number(i.scoops_por_bote)} scoops/bote` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {existencias.length > 0 && (
        <div>
          <p className="font-display text-xl text-sa-green-ink mb-3">Existencias de proteína</p>
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Proteína</th>
                  <th className={cx.th}>Almacén</th>
                  <th className={cx.thNum}>Scoops</th>
                  <th className={cx.th}>En botes</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {existencias.map((s) => {
                  const n = Number(s.stock_actual ?? 0)
                  return (
                    <tr key={s.id ?? `${s.insumo_id}-${s.almacen_id}`} className={cx.tr}>
                      <td className={`${cx.td} font-medium`}>{s.insumo}</td>
                      <td className={cx.td}>{s.almacen}</td>
                      <td className={`${cx.tdNum} ${n < 0 ? 'text-sa-strawberry font-semibold' : ''}`}>{n.toLocaleString('es-MX')}</td>
                      <td className={cx.td}>{botesYScoops(n, porBote.get(s.insumo_id as string)).texto}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
