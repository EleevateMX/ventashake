import { useCallback, useEffect, useState } from 'react'
import {
  buscarVentas, cancelarVenta, cancelaciones,
  type VentaBuscada, type VentaCancelada,
} from '@shake/supabase'
import { mxn, mensajeDeError, hoyEnMerida, diasAntesEnMerida } from '@shake/utils'
import { sb } from '../lib/sb'
import { Panel, ErrorMsg, OkMsg, Chip, cx } from '../ui'

/**
 * Cancelar una venta de cualquier día, con bitácora.
 *
 * **El corte del día original NO se recalcula.** Ese turno se arqueó
 * contra el efectivo que había en el cajón esa noche; reescribirlo hoy
 * dejaría un arqueo que ya no cuadra contra nada. Es como lo trata la
 * contabilidad: no se borra el asiento, se registra el reverso.
 *
 * La otra cara sí cambia y hay que decirla: «Ventas diarias» y los
 * productos más vendidos **sí** excluyen las canceladas, así que el
 * reporte de ese día baja mientras el corte se queda igual. Esa
 * diferencia tiene que poder explicarse en un clic — para eso está la
 * bitácora, y por eso vive en esta misma pantalla y no escondida.
 */

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', {
    timeZone: 'America/Merida', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })

export function CancelarVentas() {
  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState(diasAntesEnMerida(30))
  const [hasta, setHasta] = useState(hoyEnMerida())
  const [ventas, setVentas] = useState<VentaBuscada[] | null>(null)
  const [log, setLog] = useState<VentaCancelada[]>([])
  const [confirmando, setConfirmando] = useState<VentaBuscada | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const recargarLog = useCallback(async () => {
    try { setLog(await cancelaciones(sb, 180)) } catch (e) { setError(mensajeDeError(e)) }
  }, [])

  useEffect(() => { void recargarLog() }, [recargarLog])

  async function buscar() {
    setVentas(null); setError(null)
    try { setVentas(await buscarVentas(sb, texto, desde, hasta)) }
    catch (e) { setError(mensajeDeError(e)) }
  }

  async function confirmar() {
    if (!confirmando || motivo.trim().length < 4) return
    setEnviando(true); setError(null)
    try {
      await cancelarVenta(sb, confirmando.id, motivo)
      setOk(`Folio ${confirmando.folio} cancelado. Quedó registrado con tu nombre.`)
      setTimeout(() => setOk(null), 8000)
      setConfirmando(null); setMotivo('')
      await Promise.all([buscar(), recargarLog()])
    } catch (e) { setError(mensajeDeError(e)) }
    finally { setEnviando(false) }
  }

  return (
    <div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <Panel className="mb-4">
        <p className="text-sm text-sa-green-ink/75 leading-relaxed">
          Cancelar <b>no rehace el corte</b> de ese día: ese turno ya se contó
          contra el efectivo del cajón y se queda como se arqueó. Lo que baja
          es el reporte de «Ventas diarias», y la diferencia se explica con la
          bitácora de aquí abajo.{' '}
          <b>Tampoco regresa el inventario</b> — si el producto no llegó a
          prepararse, ajústalo desde el kiosko en «¿Llegó mercancía?».
        </p>
      </Panel>

      <div className="flex gap-3 flex-wrap items-end mb-4">
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
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }}
          placeholder="Folio o nombre del cliente…"
          className={`${cx.input} !py-2 w-64`}
        />
        <button onClick={() => void buscar()} className={cx.btnPrimary}>Buscar ventas</button>
      </div>

      {ventas && (
        ventas.length === 0 ? (
          <Panel className="mb-6"><p className={cx.muted}>No hay ventas que empaten con eso.</p></Panel>
        ) : (
          <div className={`${cx.tableWrap} mb-6`}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Folio</th>
                  <th className={cx.th}>Cuándo</th>
                  <th className={cx.th}>Cliente</th>
                  <th className={cx.th}>Cobró</th>
                  <th className={cx.thNum}>Total</th>
                  <th className={cx.th}>Estado</th>
                  <th className={cx.thNum}></th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {ventas.map((v) => (
                  <tr key={v.id} className={`${cx.tr} ${v.cancelada ? 'opacity-50' : ''}`}>
                    <td className={`${cx.td} font-mono`}>{v.folio}</td>
                    <td className={`${cx.td} font-mono text-xs`}>{fechaHora(v.created_at)}</td>
                    <td className={cx.td}>{v.nombre_cliente ?? '—'}</td>
                    <td className={cx.td}>{v.cobro ?? '—'}</td>
                    <td className={cx.tdNum}>{mxn(v.total)}</td>
                    <td className={cx.td}>
                      {v.cancelada
                        ? <Chip tone="no">cancelada</Chip>
                        : v.pagado
                          ? <Chip tone="si">pagada</Chip>
                          : <Chip tone="neutral">sin pagar</Chip>}
                    </td>
                    <td className={cx.tdNum}>
                      {!v.cancelada && (
                        <button
                          onClick={() => { setConfirmando(v); setMotivo('') }}
                          className="text-xs text-sa-strawberry underline"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <h4 className={`${cx.h3} mb-1`}>Bitácora de cancelaciones</h4>
      <p className={`${cx.muted} text-sm mb-3`}>
        No se edita ni se borra: lo impone la base, no la buena voluntad.
      </p>
      {log.length === 0 ? (
        <Panel><p className={cx.muted}>Todavía no se ha cancelado ninguna venta desde aquí.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Folio</th>
                <th className={cx.th}>Fecha de la venta</th>
                <th className={cx.th}>Fecha de cancelación</th>
                <th className={cx.th}>Quién</th>
                <th className={cx.thNum}>Importe</th>
                <th className={cx.th}>Motivo</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {log.map((c) => (
                <tr key={c.id} className={cx.tr}>
                  <td className={`${cx.td} font-mono`}>{c.folio ?? '—'}</td>
                  <td className={`${cx.td} font-mono text-xs`}>{fechaHora(c.fecha_venta)}</td>
                  <td className={`${cx.td} font-mono text-xs`}>{fechaHora(c.cancelada_en)}</td>
                  <td className={cx.td}>{c.quien ?? '—'}</td>
                  <td className={cx.tdNum}>
                    {mxn(c.total_cancelado)}
                    {!c.estaba_pagada && <Chip tone="neutral">no estaba pagada</Chip>}
                  </td>
                  <td className={`${cx.td} text-xs`}>{c.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmando && (
        <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-center justify-center p-6">
          <div className="bg-sa-cream-paper rounded-sa-lg max-w-md w-full p-7">
            <p className="font-display text-3xl text-sa-green-ink leading-tight">
              Cancelar folio {confirmando.folio}
            </p>
            <p className="text-sm text-sa-green-ink/70 mt-2 leading-relaxed">
              {fechaHora(confirmando.created_at)} · {mxn(confirmando.total)}
              {confirmando.nombre_cliente && ` · ${confirmando.nombre_cliente}`}
            </p>
            <label className="block mt-5 text-sm text-sa-green-ink/70">
              ¿Por qué se cancela?
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ej.: se cobró dos veces el mismo pedido"
                className={`${cx.input} w-full mt-1 resize-y`}
              />
            </label>
            <p className="text-[11px] text-sa-green-ink/50 mt-1 leading-snug">
              Queda escrito con tu nombre y no se puede editar después. Dentro
              de tres meses, esto es lo único que va a explicar el movimiento.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setConfirmando(null); setMotivo('') }}
                className={cx.btnSec}
              >
                No cancelar
              </button>
              <button
                onClick={() => void confirmar()}
                disabled={enviando || motivo.trim().length < 4}
                className="flex-1 bg-sa-strawberry text-white py-3 rounded-sa-lg font-display text-lg disabled:opacity-40"
              >
                {enviando ? 'Cancelando…' : 'Sí, cancelar esta venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
