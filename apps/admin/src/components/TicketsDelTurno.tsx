import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { ticketsDeCorte, detalleDeTicket, trabajosDeOrden, reimprimirTrabajo } from '@shake/supabase'
import type { TicketDeCorte, TicketDetalle, RenglonTicket } from '@shake/supabase'
import type { TrabajoImpresion } from '@shake/types'
import { mxn, mensajeDeError, lecheDeTicket } from '@shake/utils'
import { cx } from '../ui'

/**
 * Los tickets de un turno, y el detalle de uno.
 *
 * Para qué sirve de verdad: cuando el corte no cuadra, o cuando un cliente
 * vuelve preguntando por lo que le cobraron. Por eso se listan **todas**
 * las órdenes del turno y no solo las cobradas — un listado que esconde
 * las que no se pagaron esconde justo lo que hay que mirar.
 */

function hora(s: string): string {
  return new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  clip: 'Terminal (Clip)',
  tarjeta: 'Terminal del banco',
  mixto: 'Mixto',
  cortesia: 'Cortesía',
  otro: 'Otro',
}

/**
 * Un renglón del ticket.
 *
 * La **leche va con su propia etiqueta**, y no de adorno: es lo que
 * gerencia revisa cuando quiere saber si se cobró lo que el cliente pidió.
 * El problema era que la misma pregunta tenía dos respuestas en lugares
 * distintos — la leche incluida viajaba como nota chiquita entre las
 * observaciones, y la de pago como un renglón hijo perdido entre la
 * creatina y los toppings. Quien revisaba tenía que saber de antemano
 * cuál de los dos mirar. `lecheDeTicket` las devuelve iguales y aquí se
 * pintan iguales, con su precio.
 */
function Renglon({ r, sangria = false }: { r: RenglonTicket; sangria?: boolean }) {
  const leche = sangria ? null : lecheDeTicket(r)
  // La que se cobró ya sale como renglón hijo con su importe; repetirla
  // abajo sería enseñar el mismo dinero dos veces y hacer dudar de si se
  // cobró doble.
  const otros = r.extras.filter((e) => !(leche?.cobrada && e.producto === leche.nombre))
  // Lo que queda de la nota una vez apartada la leche: las observaciones
  // de verdad ("Sin hielo"), que siguen siendo útiles.
  const notaSinLeche = (r.personalizacion ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && !(leche && !leche.cobrada && x === leche.nombre))
    .join(', ')

  return (
    <>
      <div className={`flex items-baseline gap-3 py-1 ${sangria ? 'pl-6' : ''}`}>
        <span className="font-mono text-xs opacity-60 w-8 shrink-0">×{r.cantidad}</span>
        <span className="flex-1 min-w-0">
          <span className={sangria ? 'opacity-80' : ''}>{sangria ? '· ' : ''}{r.producto}</span>
          {leche && (
            <span className="block text-xs text-sa-green-ink/75 mt-0.5">
              <span className="font-mono text-[10px] uppercase tracking-wider opacity-60">Leche</span>
              {' '}{leche.nombre}
              <span className="font-mono text-[10px] opacity-60">
                {leche.cobrada ? ` · cobrada ${mxn(leche.precio)}` : ' · incluida'}
              </span>
            </span>
          )}
          {notaSinLeche && (
            <span className={`${cx.muted} block font-mono text-[10px]`}>{notaSinLeche}</span>
          )}
        </span>
        <span className="font-mono text-xs tabular-nums opacity-70">
          {mxn(r.precio_unitario * r.cantidad)}
        </span>
      </div>
      {otros.map((e) => <Renglon key={e.id} r={e} sangria />)}
    </>
  )
}

function Detalle({ ordenId, onCerrar }: { ordenId: string; onCerrar: () => void }) {
  const [t, setT] = useState<TicketDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Reimprimir la comanda **desde el folio**, sin ir a buscarla a la cola.
   *
   * La cola de Admin → Impresoras está ordenada por hora y llena de
   * trabajos de todas las órdenes: encontrar el del folio 5184 ahí es
   * buscar una aguja, y el momento en que alguien lo necesita es justo
   * cuando está mirando este ticket.
   *
   * Sale marcada como REIMPRESIÓN y queda auditada — no reencola el
   * original, crea una copia.
   */
  const [trabajos, setTrabajos] = useState<TrabajoImpresion[] | null>(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    detalleDeTicket(sb, ordenId)
      .then((d) => { if (vivo) { setT(d); setError(null) } })
      .catch((e) => { if (vivo) setError(mensajeDeError(e)) })
    return () => { vivo = false }
  }, [ordenId])

  useEffect(() => {
    let vivo = true
    // Aparte del ticket y sin bloquearlo: si la cola de impresión no
    // responde, el ticket se sigue pudiendo consultar.
    trabajosDeOrden(sb, ordenId)
      .then((j) => { if (vivo) setTrabajos(j) })
      .catch(() => { if (vivo) setTrabajos([]) })
    return () => { vivo = false }
  }, [ordenId])

  async function reimprimir() {
    const job = (trabajos ?? [])[0]
    if (!job) return
    setImprimiendo(true); setAviso(null)
    try {
      await reimprimirTrabajo(sb, job.id, { motivo: 'Reimpresión desde Admin (ticket)' })
      setAviso('Mandada a la impresora. Sale marcada como REIMPRESIÓN.')
      setTrabajos(await trabajosDeOrden(sb, ordenId))
    } catch (e) {
      setAviso(mensajeDeError(e))
    } finally { setImprimiendo(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onCerrar}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-[420px] max-w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {!t && !error && <p className={cx.muted}>Cargando ticket…</p>}
        {t && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider opacity-50">Folio</p>
                <p className="text-3xl font-semibold leading-none">#{t.folio}</p>
              </div>
              <button onClick={onCerrar} className="text-2xl opacity-40 hover:opacity-80 leading-none">×</button>
            </div>

            <p className={`${cx.muted} font-mono text-[11px] mt-2`}>
              {new Date(t.created_at).toLocaleString('es-MX')}
              {t.cobro && ` · cobró ${t.cobro}`}
              {t.para_llevar != null && ` · ${t.para_llevar ? 'para llevar' : 'para comer aquí'}`}
            </p>

            {t.nombre_cliente && <p className="mt-1 text-lg">{t.nombre_cliente}</p>}

            {/* Lo primero que hay que poder ver de un vistazo: si esta venta
                se cobró o no. Un ticket sin pagar entre los cobrados, sin
                distinguirse, es justo el que descuadra el corte. */}
            {!t.pagado && (
              <p className="mt-3 rounded px-3 py-2 text-sm bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">
                <strong>Este pedido no se cobró.</strong> Estado: {t.estado}.
              </p>
            )}
            {t.es_demo && (
              <p className={`${cx.muted} mt-2 font-mono text-[10px] uppercase tracking-wider`}>
                Marcado como demostración: no cuenta en las ventas
              </p>
            )}

            <div className="mt-4 border-t border-current/10 pt-3">
              {t.renglones.map((r) => <Renglon key={r.id} r={r} />)}
            </div>

            {Number(t.descuento ?? 0) > 0 && (
              <div className="flex justify-between mt-2 text-sm">
                <span className={cx.muted}>Descuento</span>
                <span className="font-mono tabular-nums">−{mxn(Number(t.descuento))}</span>
              </div>
            )}

            <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-current/10">
              <span className="font-mono text-[10px] uppercase tracking-wider opacity-60">Total</span>
              <span className="text-2xl font-semibold tabular-nums">{mxn(t.total)}</span>
            </div>

            {t.pagos.length > 0 && (
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-wider opacity-50 mb-1">
                  Cómo se pagó
                </p>
                {t.pagos.map((p, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 py-0.5">
                    <span className="text-sm">
                      {ETIQUETA_METODO[p.metodo] ?? p.metodo}
                      {p.estado !== 'aprobado' && (
                        <span className={`${cx.muted} font-mono text-[10px]`}> · {p.estado}</span>
                      )}
                    </span>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        p.estado === 'aprobado' ? '' : 'line-through opacity-40'
                      }`}
                    >
                      {mxn(Number(p.monto))}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-sa-green-ink/10">
              {trabajos === null ? (
                <p className={`${cx.muted} font-mono text-[11px]`}>Buscando la comanda…</p>
              ) : trabajos.length === 0 ? (
                <p className={`${cx.muted} font-mono text-[11px]`}>
                  Este folio no generó comanda (su categoría no va a pantalla).
                </p>
              ) : (
                <>
                  <button
                    onClick={() => void reimprimir()}
                    disabled={imprimiendo}
                    className="text-xs text-sa-green underline disabled:opacity-50"
                  >
                    {imprimiendo ? 'Mandando…' : 'Reimprimir la comanda'}
                  </button>
                  <span className={`${cx.muted} font-mono text-[10px] ml-3`}>
                    {trabajos.length} impresión{trabajos.length === 1 ? '' : 'es'} de este folio
                  </span>
                </>
              )}
              {aviso && (
                <p className="text-[11px] text-sa-green-ink/70 mt-1.5 leading-snug">{aviso}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function TicketsDelTurno({ corteId }: { corteId: string }) {
  const [tickets, setTickets] = useState<TicketDeCorte[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [viendo, setViendo] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ticketsDeCorte(sb, corteId)
      .then((t) => { if (vivo) { setTickets(t); setError(null) } })
      .catch((e) => { if (vivo) setError(mensajeDeError(e)) })
    return () => { vivo = false }
  }, [corteId])

  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!tickets) return <p className={cx.muted}>Cargando tickets…</p>
  if (tickets.length === 0) return <p className={cx.muted}>Este turno no levantó ningún pedido.</p>

  const q = busca.trim().toLowerCase()
  const visibles = q
    ? tickets.filter(
        (t) =>
          String(t.folio).includes(q) ||
          (t.nombre_cliente ?? '').toLowerCase().includes(q),
      )
    : tickets

  const cobrados = tickets.filter((t) => t.pagado).length
  const sinCobrar = tickets.length - cobrados

  return (
    <div className="py-2">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="font-mono text-[10px] uppercase tracking-wider opacity-60">
          {tickets.length} tickets · {cobrados} cobrados
          {sinCobrar > 0 && ` · ${sinCobrar} sin cobrar`}
        </span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por folio o nombre…"
          className="ml-auto px-3 py-1.5 rounded border border-current/15 bg-transparent text-sm w-56"
        />
      </div>

      <div className="max-h-80 overflow-y-auto rounded border border-current/10">
        <table className="w-full text-sm">
          <tbody>
            {visibles.map((t) => (
              <tr
                key={t.id}
                onClick={() => setViendo(t.id)}
                className="cursor-pointer border-b border-current/5 last:border-0 hover:bg-current/5"
              >
                <td className="px-3 py-1.5 font-mono text-xs opacity-60 w-16">#{t.folio}</td>
                <td className="px-2 py-1.5 font-mono text-xs opacity-50 w-16">{hora(t.created_at)}</td>
                <td className="px-2 py-1.5">
                  {t.nombre_cliente ?? <span className={cx.muted}>—</span>}
                  {t.es_demo && (
                    <span className={`${cx.muted} font-mono text-[9px] uppercase ml-2`}>demo</span>
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px] uppercase opacity-60">
                  {t.pagado
                    ? (ETIQUETA_METODO[t.metodo_pago ?? ''] ?? t.metodo_pago ?? '')
                    : <span className="text-red-600 dark:text-red-400">sin cobrar</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{mxn(Number(t.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className={`${cx.muted} p-3`}>Ningún ticket con «{busca}».</p>
        )}
      </div>

      {viendo && <Detalle ordenId={viendo} onCerrar={() => setViendo(null)} />}
    </div>
  )
}
