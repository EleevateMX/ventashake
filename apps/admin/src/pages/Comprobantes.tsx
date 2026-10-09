import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { comprobantesDeCortes } from '@shake/supabase'
import type { ComprobanteResumen } from '@shake/supabase'
import { mxn, mensajeDeError, hoyEnMerida, folioDeCorte } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'
import { ComprobanteCorte } from '../components/ComprobanteCorte'

/**
 * Admin → Comprobantes: el archivo de las entregas de caja.
 *
 * Cortes de caja es para revisar el arqueo de un turno; esto es para
 * BUSCAR un comprobante: «¿qué dejó Regina el martes?», «¿cuántas veces
 * recibió Andrés con faltante este mes?». Cada renglón abre el mismo
 * comprobante que llega por correo y que se imprime — uno solo.
 */

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

function cuando(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Merida',
  })
}

function Dif({ valor }: { valor: number | null }) {
  if (valor == null) return <span className={cx.muted}>—</span>
  if (valor === 0) return <span className="text-green-700 dark:text-green-400">cuadra</span>
  return (
    <span className="font-semibold text-red-600 dark:text-red-400">
      {valor > 0 ? '+' : '−'}{mxn(Math.abs(valor))}
    </span>
  )
}

export default function Comprobantes() {
  const hoy = hoyEnMerida()
  const [desde, setDesde] = useState(restarDias(hoy, 30))
  const [hasta, setHasta] = useState(hoy)
  const [persona, setPersona] = useState('')
  const [lista, setLista] = useState<ComprobanteResumen[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    setLista(null)
    setError(null)
    comprobantesDeCortes(sb, desde, hasta)
      .then(setLista)
      .catch((e) => { setError(mensajeDeError(e)); setLista([]) })
  }, [desde, hasta])

  const personas = useMemo(() => {
    const s = new Set<string>()
    for (const c of lista ?? []) { if (c.entrega) s.add(c.entrega); if (c.recibe) s.add(c.recibe) }
    return [...s].sort((a, b) => a.localeCompare(b, 'es'))
  }, [lista])

  const filtrados = (lista ?? []).filter((c) => !persona || c.entrega === persona || c.recibe === persona)
  const conDiferencia = filtrados.filter((c) => (c.diferencia ?? 0) !== 0 || (c.recibido_diferencia ?? 0) !== 0).length

  return (
    <div>
      <PageHeader
        title="Comprobantes"
        subtitle="Cada entrega de caja: quién entregó, quién recibió, qué se retiró y qué se dejó"
      />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className={`${cx.muted} block text-xs mb-1`}>Desde</span>
            <input id="comp-desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={`${cx.input} !py-2`} />
          </label>
          <label className="text-sm">
            <span className={`${cx.muted} block text-xs mb-1`}>Hasta</span>
            <input id="comp-hasta" type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} className={`${cx.input} !py-2`} />
          </label>
          <label className="text-sm">
            <span className={`${cx.muted} block text-xs mb-1`}>Persona</span>
            <select id="comp-persona" value={persona} onChange={(e) => setPersona(e.target.value)} className={`${cx.input} !py-2`}>
              <option value="">Todas</option>
              {personas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button key={d} className={cx.btnSec} onClick={() => { setHasta(hoy); setDesde(restarDias(hoy, d)) }}>
                {d} días
              </button>
            ))}
          </div>
          {lista && (
            <p className={`${cx.muted} text-sm ml-auto`}>
              {filtrados.length} comprobante{filtrados.length === 1 ? '' : 's'}
              {conDiferencia > 0 && <> · <span className="text-red-600 dark:text-red-400">{conDiferencia} con diferencia</span></>}
            </p>
          )}
        </div>
      </Panel>

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {lista == null ? (
        <Loading>Buscando comprobantes…</Loading>
      ) : filtrados.length === 0 ? (
        <Panel><p className={cx.muted}>No hay comprobantes en esas fechas.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Folio</th>
                <th className={cx.th}>Cerró</th>
                <th className={cx.th}>Entrega → recibe</th>
                <th className={cx.thNum}>Contado</th>
                <th className={cx.thNum}>Diferencia del turno</th>
                <th className={cx.thNum}>Retiró</th>
                <th className={cx.thNum}>Dejó de fondo</th>
                <th className={cx.thNum}>Al recibir</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <>
                  <tr
                    key={c.corte_id}
                    className={`${cx.tr} cursor-pointer`}
                    onClick={() => setAbierto(abierto === c.corte_id ? null : c.corte_id)}
                  >
                    <td className={`${cx.td} font-mono text-xs whitespace-nowrap`}>{folioDeCorte(c.folio)}</td>
                    <td className={cx.td}>{cuando(c.cerrado_en)}</td>
                    <td className={cx.td}>
                      {c.entrega ?? '—'} <span className={cx.muted}>→</span>{' '}
                      {c.recibe ?? <span className={cx.muted}>pendiente</span>}
                    </td>
                    <td className={cx.tdNum}>{c.efectivo_contado == null ? '—' : mxn(c.efectivo_contado)}</td>
                    <td className={cx.tdNum}><Dif valor={c.diferencia} /></td>
                    <td className={cx.tdNum}>{c.retiro == null ? <span className={cx.muted}>—</span> : mxn(c.retiro)}</td>
                    <td className={cx.tdNum}>
                      {c.fondo_dejado == null ? <span className={cx.muted}>—</span> : mxn(c.fondo_dejado)}
                      {c.reposicion ? <span className={`${cx.muted} block text-[10px]`}>+ {mxn(c.reposicion)} repos.</span> : null}
                    </td>
                    <td className={cx.tdNum} title={c.recibido_notas ?? undefined}><Dif valor={c.recibido_diferencia} /></td>
                  </tr>
                  {abierto === c.corte_id && (
                    <tr key={`${c.corte_id}-c`}>
                      <td className={cx.td} colSpan={8}>
                        <ComprobanteCorte corteId={c.corte_id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={`${cx.muted} text-xs mt-3`}>
        Los cortes de antes del 9 de octubre no tienen retiro ni fondo: ese día empezó el fondo fijo.
      </p>
    </div>
  )
}
