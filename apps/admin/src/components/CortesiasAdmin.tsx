import { useCallback, useEffect, useState } from 'react'
import {
  cortesiaAutorizados, cortesiaAutorizar, listarCortesias,
  type Cortesia, type CortesiaPersona,
} from '@shake/supabase'
import { hoyEnMerida, mensajeDeError, mxn } from '@shake/utils'
import { sb } from '../lib/sb'
import { Panel, ErrorMsg, cx } from '../ui'

/**
 * Cortesías del kiosko (15/10/26): quién puede darlas y cuáles se dieron.
 *
 * No es una columna más de Permisos a propósito: ese permiso **no lo trae
 * ningún rol, ni gerencia**. Se pidió con nombre (Perla y Adrián) y
 * «gerencia puede todo» lo habría abierto a cualquier admin futuro. La
 * regla vive en el servidor (`fn_cortesia_crear` revisa el PIN contra esta
 * lista); esta pantalla solo la escribe.
 */
export function CortesiasAdmin() {
  const [personas, setPersonas] = useState<CortesiaPersona[] | null>(null)
  const [dadas, setDadas] = useState<Cortesia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const hoy = hoyEnMerida()
      const desde = new Date(`${hoy}T12:00:00Z`)
      desde.setUTCDate(desde.getUTCDate() - 30)
      const [p, d] = await Promise.all([
        cortesiaAutorizados(sb),
        listarCortesias(sb, desde.toISOString().slice(0, 10), hoy),
      ])
      setPersonas(p); setDadas(d)
    } catch (e) {
      setError(mensajeDeError(e)); setPersonas([]); setDadas([])
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function cambiar(p: CortesiaPersona, puede: boolean) {
    setOcupado(p.empleado_id); setError(null)
    try {
      await cortesiaAutorizar(sb, p.empleado_id, puede)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(null)
    }
  }

  const total = (dadas ?? []).reduce((s, c) => s + c.valor, 0)

  return (
    <Panel className="mt-6">
      <p className="font-display text-2xl text-sa-green-ink">Cortesías</p>
      <p className="text-sm text-sa-green-ink/70 mt-1 leading-relaxed max-w-3xl">
        En el kiosko, al cobrar: <b>🎁 Cortesía</b> → motivo → PIN. La cuenta sale en $0, se
        prepara y <b>baja inventario</b> como una venta. Solo con el PIN de quien esté
        palomeado aquí — <b>ni gerencia lo trae por su rol</b>.
      </p>
      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="flex flex-wrap gap-2 mt-4">
        {(personas ?? []).map((p) => (
          <label
            key={p.empleado_id}
            className={`flex items-center gap-2 px-3 py-2 rounded-sa border text-sm ${
              p.puede ? 'border-sa-green bg-sa-green/10' : 'border-sa-green-ink/15'
            }`}
          >
            <input
              type="checkbox"
              checked={p.puede}
              disabled={ocupado === p.empleado_id}
              onChange={(e) => void cambiar(p, e.target.checked)}
              className="w-4 h-4 accent-sa-green"
            />
            {p.nombre}
            <span className="font-mono text-[10px] text-sa-green-ink/50">{p.rol}</span>
          </label>
        ))}
      </div>

      <p className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/50 mt-6">
        Últimos 30 días · {(dadas ?? []).length} cortesías · {mxn(total)} a precio de lista
      </p>
      {dadas && dadas.length > 0 && (
        <div className={`${cx.tableWrap} mt-2`}>
          <table className={cx.table}>
            <thead className={cx.thead}>
              <tr>
                <th className={cx.th}>Cuándo</th>
                <th className={cx.th}>Folio</th>
                <th className={cx.th}>Qué</th>
                <th className={cx.th}>Motivo</th>
                <th className={cx.th}>Autorizó</th>
                <th className={cx.th}>En caja</th>
                <th className={`${cx.th} text-right`}>Valor</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {dadas.map((c) => (
                <tr key={`${c.folio}-${c.creado_en}`} className={cx.tr}>
                  <td className={`${cx.td} whitespace-nowrap`}>
                    {new Date(c.creado_en).toLocaleString('es-MX', {
                      timeZone: 'America/Merida', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className={`${cx.td} font-mono`}>#{c.folio}</td>
                  <td className={cx.td}>{c.productos}</td>
                  <td className={cx.td}>{c.motivo}</td>
                  <td className={cx.td}>{c.autorizo}</td>
                  <td className={cx.td}>{c.cajero ?? '—'}</td>
                  <td className={`${cx.td} text-right font-mono`}>{mxn(c.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
