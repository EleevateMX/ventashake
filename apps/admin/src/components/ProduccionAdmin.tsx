import { useCallback, useEffect, useState } from 'react'
import { ligarProduccion, produccionAdmin, type ProduccionAdmin as Datos } from '@shake/supabase'
import { mensajeDeError, mxn } from '@shake/utils'
import { sb } from '../lib/sb'
import { Panel, ErrorMsg, cx } from '../ui'

/**
 * Producción de preparados (24/10/26). Qué receta de Costeos produce qué
 * ingrediente elaborado, y las producciones registradas en el kiosko
 * («Caja y turno» → «¿Preparaste algo?»).
 *
 * Las cantidades NO viven aquí: el servidor las toma de la receta que
 * Costeos sincroniza. Aquí solo se liga la receta con su ingrediente y,
 * si hace falta, cuánto rinde un lote (vacío = el contenido del
 * ingrediente en Costeos, «Lote 39pz» → 39).
 */
export function ProduccionAdmin() {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [nueva, setNueva] = useState({ producto_id: '', insumo_id: '', rinde: '' })

  const cargar = useCallback(async () => {
    try { setD(await produccionAdmin(sb)); setError(null) } catch (e) { setError(mensajeDeError(e)) }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  async function ligar(l: { producto_id: string; insumo_id: string; rinde: number | null; activo: boolean }) {
    setOcupado(true); setError(null)
    try { await ligarProduccion(sb, l); await cargar() } catch (e) { setError(mensajeDeError(e)) } finally { setOcupado(false) }
  }

  if (!d) return error ? <ErrorMsg>{error}</ErrorMsg> : <Panel><p className={cx.muted}>Cargando…</p></Panel>

  return (
    <div className="space-y-4">
      <Panel>
        <p className="font-display text-2xl text-sa-green-ink">Qué se produce</p>
        <p className="text-sm text-sa-green-ink/70 mt-1 leading-relaxed max-w-3xl">
          En el kiosko: <b>Caja y turno</b> → PIN → <b>¿Preparaste algo?</b>. Sale del kiosko lo que dice la
          receta de Costeo Alimentos (si cambias la receta allá, ya se usa la nueva) y entra el ingrediente
          elaborado. Al vender, el platillo descuenta solo la pieza preparada: lo demás ya salió al producir.
        </p>
        {error && <ErrorMsg>{error}</ErrorMsg>}

        <div className={`${cx.tableWrap} mt-3`}>
          <table className={cx.table}>
            <thead className={cx.thead}>
              <tr>
                <th className={cx.th}>Receta (Costeos)</th>
                <th className={cx.th}>Produce</th>
                <th className={`${cx.th} text-right`}>Rinde por lote</th>
                <th className={cx.th}>Activa</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {d.ligas.map((l) => (
                <tr key={l.producto_id} className={cx.tr}>
                  <td className={cx.td}>{l.receta}</td>
                  <td className={cx.td}>{l.salida}</td>
                  <td className={`${cx.td} text-right`}>
                    <input
                      defaultValue={l.rinde ?? ''}
                      placeholder={l.contenido != null ? String(Number(l.contenido)) : '—'}
                      inputMode="decimal"
                      title="Vacío = el contenido del ingrediente en Costeos"
                      className={`${cx.input} !py-1 w-20 text-right`}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        const rinde = v === '' ? null : Number(v)
                        if (rinde !== l.rinde && (rinde === null || rinde > 0)) void ligar({ ...l, rinde })
                      }}
                    />
                  </td>
                  <td className={cx.td}>
                    <input type="checkbox" checked={l.activo} disabled={ocupado} className="w-4 h-4 accent-sa-green"
                      onChange={(e) => void ligar({ ...l, activo: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end gap-2 mt-4">
          <select value={nueva.producto_id} onChange={(e) => setNueva({ ...nueva, producto_id: e.target.value })}
            className={`${cx.input} !py-2 w-64`}>
            <option value="">— Receta de Costeos —</option>
            {d.recetas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <select value={nueva.insumo_id} onChange={(e) => setNueva({ ...nueva, insumo_id: e.target.value })}
            className={`${cx.input} !py-2 w-64`}>
            <option value="">— Ingrediente que produce —</option>
            {d.ingredientes.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
          <input value={nueva.rinde} onChange={(e) => setNueva({ ...nueva, rinde: e.target.value })}
            placeholder="rinde (opcional)" inputMode="decimal" className={`${cx.input} !py-2 w-36`} />
          <button className={cx.btnSec} disabled={ocupado || !nueva.producto_id || !nueva.insumo_id}
            onClick={() => void ligar({
              producto_id: nueva.producto_id, insumo_id: nueva.insumo_id,
              rinde: nueva.rinde.trim() ? Number(nueva.rinde) : null, activo: true,
            }).then(() => setNueva({ producto_id: '', insumo_id: '', rinde: '' }))}>
            Ligar
          </button>
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/50">
          Últimas producciones · {d.recientes.length}
        </p>
        {d.recientes.length > 0 && (
          <div className={`${cx.tableWrap} mt-2`}>
            <table className={cx.table}>
              <thead className={cx.thead}>
                <tr>
                  <th className={cx.th}>Cuándo</th>
                  <th className={cx.th}>Qué</th>
                  <th className={`${cx.th} text-right`}>Lotes</th>
                  <th className={`${cx.th} text-right`}>Salieron</th>
                  <th className={`${cx.th} text-right`}>Costo</th>
                  <th className={cx.th}>Quién</th>
                  <th className={cx.th}>Nota</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {d.recientes.map((r) => (
                  <tr key={r.creado_en + r.salida} className={cx.tr}>
                    <td className={`${cx.td} whitespace-nowrap`}>
                      {new Date(r.creado_en).toLocaleString('es-MX', {
                        timeZone: 'America/Merida', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className={cx.td}>{r.salida}</td>
                    <td className={`${cx.td} text-right font-mono`}>{r.lotes}</td>
                    <td className={`${cx.td} text-right font-mono`}>
                      {r.cantidad}{r.cantidad !== r.esperado && <span className="text-sa-strawberry"> (esperado {r.esperado})</span>}
                    </td>
                    <td className={`${cx.td} text-right font-mono`}>{r.costo_total != null ? mxn(r.costo_total) : '—'}</td>
                    <td className={cx.td}>{r.quien ?? '—'}</td>
                    <td className={cx.td}>
                      {r.forzada && <span className="text-sa-strawberry">Faltaba inventario · </span>}{r.nota ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
