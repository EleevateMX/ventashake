import { useCallback, useEffect, useState } from 'react'
import {
  cuponesAplicados, cuponesTiposAdmin, guardarCuponTipo,
  type CuponDado, type CuponTipo,
} from '@shake/supabase'
import { hoyEnMerida, mensajeDeError, mxn } from '@shake/utils'
import { sb } from '../lib/sb'
import { Panel, ErrorMsg, cx } from '../ui'

/**
 * Cupones de descuento del kiosko (24/10/26): cuáles existen y cuáles se
 * dieron. Los autoriza la MISMA lista que las cortesías (la de arriba). El
 * descuento lo calcula el servidor sobre lo que vale el shake con sus
 * extras; el precio no se toca y el descuento queda aparte en la venta.
 */
export function CuponesAdmin() {
  const [tipos, setTipos] = useState<CuponTipo[] | null>(null)
  const [dados, setDados] = useState<CuponDado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: 'monto' | 'porcentaje'; valor: string }>({
    nombre: '', tipo: 'porcentaje', valor: '',
  })

  const cargar = useCallback(async () => {
    try {
      const hoy = hoyEnMerida()
      const desde = new Date(`${hoy}T12:00:00Z`)
      desde.setUTCDate(desde.getUTCDate() - 30)
      const [t, d] = await Promise.all([
        cuponesTiposAdmin(sb),
        cuponesAplicados(sb, desde.toISOString().slice(0, 10), hoy),
      ])
      setTipos(t); setDados(d)
    } catch (e) {
      setError(mensajeDeError(e)); setTipos([]); setDados([])
    }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  async function guardar(c: Parameters<typeof guardarCuponTipo>[1]) {
    setOcupado(true); setError(null)
    try { await guardarCuponTipo(sb, c); await cargar() } catch (e) { setError(mensajeDeError(e)) } finally { setOcupado(false) }
  }

  async function crear() {
    const valor = Number(nuevo.valor)
    if (nuevo.nombre.trim().length < 3 || !(valor > 0) || (nuevo.tipo === 'porcentaje' && valor > 100)) {
      setError('Ponle nombre y un valor válido (porcentaje de 1 a 100).'); return
    }
    await guardar({ nombre: nuevo.nombre.trim(), tipo: nuevo.tipo, valor })
    setNuevo({ nombre: '', tipo: 'porcentaje', valor: '' })
  }

  const totalDesc = (dados ?? []).reduce((s, c) => s + c.descuento, 0)

  return (
    <Panel className="mt-6">
      <p className="font-display text-2xl text-sa-green-ink">Cupones de descuento</p>
      <p className="text-sm text-sa-green-ink/70 mt-1 leading-relaxed max-w-3xl">
        En el kiosko, al cobrar: <b>🎟 Cupón</b> → cuál → a qué shake → PIN. Lo autoriza la misma lista
        de las cortesías. El precio del shake no cambia: el descuento queda aparte en la venta, con
        cuánto valía, cuánto se descontó y quién autorizó. Un cupón por venta, y no se junta con el
        precio de personal. Los productos gratis (galleta, café, creatina) van por <b>Cortesía</b>.
      </p>
      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="flex flex-wrap gap-2 mt-4">
        {(tipos ?? []).map((t) => (
          <label
            key={t.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-sa border text-sm ${
              t.activo ? 'border-sa-green bg-sa-green/10' : 'border-sa-green-ink/15 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={t.activo}
              disabled={ocupado}
              onChange={(e) => void guardar({ id: t.id, activo: e.target.checked })}
              className="w-4 h-4 accent-sa-green"
            />
            {t.nombre}
            <span className="font-mono text-[10px] text-sa-green-ink/50">
              {t.tipo === 'monto' ? mxn(t.valor) : `${t.valor} %`} · {t.familia}
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 mt-4">
        <label className="text-xs text-sa-green-ink/70">
          Nuevo cupón
          <input
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            placeholder="Ej. 20 % en un shake"
            className={`${cx.input} !py-2 block mt-1 w-56`}
          />
        </label>
        <select
          value={nuevo.tipo}
          onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as 'monto' | 'porcentaje' })}
          className={`${cx.input} !py-2 w-36`}
        >
          <option value="porcentaje">Porcentaje</option>
          <option value="monto">Monto fijo $</option>
        </select>
        <input
          value={nuevo.valor}
          onChange={(e) => setNuevo({ ...nuevo, valor: e.target.value })}
          inputMode="decimal"
          placeholder={nuevo.tipo === 'monto' ? '$' : '%'}
          className={`${cx.input} !py-2 w-24`}
        />
        <button className={cx.btnSec} disabled={ocupado} onClick={() => void crear()}>Agregar</button>
      </div>

      <p className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/50 mt-6">
        Últimos 30 días · {(dados ?? []).length} cupones · {mxn(totalDesc)} descontados
      </p>
      {dados && dados.length > 0 && (
        <div className={`${cx.tableWrap} mt-2`}>
          <table className={cx.table}>
            <thead className={cx.thead}>
              <tr>
                <th className={cx.th}>Cuándo</th>
                <th className={cx.th}>Folio</th>
                <th className={cx.th}>Cupón</th>
                <th className={cx.th}>Shake</th>
                <th className={`${cx.th} text-right`}>Valía</th>
                <th className={`${cx.th} text-right`}>Descuento</th>
                <th className={`${cx.th} text-right`}>Pagó (venta)</th>
                <th className={cx.th}>Autorizó</th>
                <th className={cx.th}>En caja</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {dados.map((c) => (
                <tr key={`${c.folio}-${c.creado_en}`} className={cx.tr}>
                  <td className={`${cx.td} whitespace-nowrap`}>
                    {new Date(c.creado_en).toLocaleString('es-MX', {
                      timeZone: 'America/Merida', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className={`${cx.td} font-mono`}>#{c.folio}</td>
                  <td className={cx.td}>{c.cupon}</td>
                  <td className={cx.td}>{c.producto}</td>
                  <td className={`${cx.td} text-right font-mono`}>{mxn(c.base)}</td>
                  <td className={`${cx.td} text-right font-mono`}>−{mxn(c.descuento)}</td>
                  <td className={`${cx.td} text-right font-mono`}>{mxn(c.pago)}</td>
                  <td className={cx.td}>{c.autorizo}</td>
                  <td className={cx.td}>{c.cajero ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
