import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { stockPorAlmacen } from '@shake/supabase'
import type { StockAlmacen } from '@shake/types'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, cx } from '../ui'
import { mensajeDeError } from '@shake/utils'
import { HuecosInventario } from '../components/HuecosInventario'
import { KardexInsumo, RegistrarSalida, ReiniciarInventario, TIPOS_INSUMO } from '../components/InventarioHerramientas'

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

  const cargar = useCallback(() => {
    stockPorAlmacen(sb)
      .then((s) => { setStock(s); setError(null) })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const pestanas: { id: Vista; label: string }[] = [
    { id: 'existencias', label: 'Existencias' },
    { id: 'huecos', label: 'Lo que no descuenta' },
  ]

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={vista === 'existencias' ? 'Stock por almacén · toca un producto para ver su kardex' : 'Lo que se vende y no baja del almacén'}
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

      {vista === 'huecos' ? <HuecosInventario /> : <Existencias stock={stock} cargando={cargando} error={error} onCambio={cargar} />}
    </div>
  )
}

function Existencias({ stock, cargando, error, onCambio }: {
  stock: StockAlmacen[]; cargando: boolean; error: string | null; onCambio: () => void
}) {
  const [q, setQ] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [tipo, setTipo] = useState('')
  const [soloConExistencia, setSoloConExistencia] = useState(false)
  const [kardexDe, setKardexDe] = useState<StockAlmacen | null>(null)
  const [modal, setModal] = useState<'salida' | 'reinicio' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const almacenes = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of stock) if (s.almacen_id) m.set(s.almacen_id, s.almacen ?? '—')
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [stock])

  const filtrado = useMemo(() => {
    const t = q.trim().toLowerCase()
    return stock.filter((s) =>
      (!t || (s.insumo ?? '').toLowerCase().includes(t)) &&
      (!almacen || s.almacen_id === almacen) &&
      (!tipo || s.insumo_tipo === tipo) &&
      (!soloConExistencia || Number(s.stock_actual ?? 0) !== 0))
  }, [stock, q, almacen, tipo, soloConExistencia])

  if (cargando) return <Loading>Cargando inventario…</Loading>

  const hecho = (msg: string) => { setModal(null); setAviso(msg); onCambio() }

  return (
    <div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {aviso && <OkMsg>{aviso}</OkMsg>}

      {/* La pregunta que hizo gerencia al ver los rojos: sí, puede quedar en
          negativo, y es a propósito. Un negativo se ve y se corrige; un
          cero que nunca baja no se ve nunca. */}
      <Panel className="mb-4">
        <p className="text-sm text-sa-green-ink/75 leading-relaxed">
          <b>Estas existencias ya descuentan cada venta, y son las mismas que enseña Costeos → Inventario</b> (las
          dos leen la misma tabla). Un número en
          <span className="text-sa-strawberry font-semibold"> negativo </span>
          quiere decir que se vendió más de lo que el sistema sabía que había —casi
          siempre porque esa mercancía nunca se dio de alta, o porque en caja se
          marcó un sabor por otro (uno queda en negativo y su gemelo sobra). Se
          corrige con un <b>conteo físico</b>: Costeos → Inventario → columna
          <i> Conteo</i> → «Aplicar conteo a existencias». Lo contado se vuelve la
          existencia real. La mercancía que llega se mete desde el kiosko: «Caja y
          turno» → «¿Llegó mercancía?».
        </p>
      </Panel>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className={`${cx.input} w-56`} />
        <select value={almacen} onChange={(e) => setAlmacen(e.target.value)} className={`${cx.input} w-auto`}>
          <option value="">Todos los almacenes</option>
          {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${cx.input} w-auto`}>
          <option value="">Todas las categorías</option>
          {Object.entries(TIPOS_INSUMO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-sa-green-ink">
          <input type="checkbox" checked={soloConExistencia} onChange={(e) => setSoloConExistencia(e.target.checked)} />
          Solo con existencia
        </label>
        <div className="flex-1" />
        <button onClick={() => { setAviso(null); setModal('salida') }} className={cx.btnSec}>Registrar salida</button>
        <button onClick={() => { setAviso(null); setModal('reinicio') }} className={cx.btnSec}>Reiniciar inventario</button>
      </div>

      {filtrado.length === 0 ? (
        <Panel><p className={cx.muted}>Sin existencias que empaten.</p></Panel>
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
              {filtrado.map((s) => (
                <tr key={s.id ?? Math.random()} onClick={() => setKardexDe(s)}
                  className={`${cx.tr} cursor-pointer ${s.bajo_minimo ? 'bg-sa-strawberry/5' : ''}`}>
                  <td className={`${cx.td} font-medium`}>{s.insumo ?? '—'}</td>
                  <td className={cx.td}>{s.almacen ?? '—'}</td>
                  <td className={`${cx.tdNum} ${s.bajo_minimo ? 'text-sa-strawberry font-semibold' : ''}`}>
                    {Number(s.stock_actual ?? 0).toLocaleString('es-MX')}
                  </td>
                  <td className={cx.tdNum}>{s.stock_minimo ?? 0}</td>
                  <td className={cx.td}>{s.unidad ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {kardexDe?.insumo_id && (
        <KardexInsumo insumoId={kardexDe.insumo_id} insumo={kardexDe.insumo ?? ''} unidad={kardexDe.unidad}
          almacenes={almacenes} onCerrar={() => setKardexDe(null)} />
      )}
      {modal === 'salida' && (
        <RegistrarSalida stock={stock} almacenes={almacenes} onCerrar={() => setModal(null)} onHecho={hecho} />
      )}
      {modal === 'reinicio' && (
        <ReiniciarInventario stock={stock} almacenes={almacenes} onCerrar={() => setModal(null)} onHecho={hecho} />
      )}
    </div>
  )
}
