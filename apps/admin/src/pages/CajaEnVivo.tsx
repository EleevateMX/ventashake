import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { cajaEnVivo, type CajaEnVivo as Datos, type MovimientoCaja } from '@shake/supabase'
import { mxn, mensajeDeError, hace } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Chip, cx } from '../ui'

/**
 * Caja en vivo (17/10/26). Lo pidió Adrián: ver la caja como si estuviera
 * parado enfrente, y revisar qué se hizo en el turno.
 *
 * Arriba, lo que la pantalla del kiosko tiene AHORA (quién cobra, en qué
 * paso va, el carrito). Abajo, el turno: lo cobrado por método, el efectivo
 * que debería haber en el cajón y cada movimiento — incluidos los que no
 * dejan venta: productos quitados del carrito, carritos vaciados, órdenes
 * que se levantaron y no se cobraron, cancelaciones y cortesías.
 *
 * Se refresca cada 3 s mientras la pestaña está a la vista y lleva su sello
 * de «hace N s»: un panel en vivo tiene que poder demostrarlo.
 * Pensada para el teléfono también: una sola columna en pantallas chicas.
 */

const REFRESCO_MS = 3_000

const PASOS: Record<string, string> = {
  '/catalogo': 'En el menú',
  '/carrito': 'Revisando el carrito',
  '/pago': 'En la pantalla de cobro',
  '/pagar-en-caja': 'Mandado a pagar en caja',
  '/confirmacion': '¡Listo! · venta cerrada',
  '/lealtad': 'Identificando al cliente',
  '/rewards': 'Enseñando Rewards',
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Merida', hour: '2-digit', minute: '2-digit', hour12: false })

const METODO: Record<string, string> = {
  efectivo: 'Efectivo', clip: 'Clip', tarjeta: 'Terminal del banco', mixto: 'Mixto', cortesia: 'Cortesía',
}

type Filtro = 'todo' | 'ventas' | 'revisar'
const PARA_REVISAR = new Set(['quito', 'vacio', 'sin_cobrar', 'cancelacion', 'cortesia'])

function etiqueta(m: MovimientoCaja): { texto: string; tono: string } {
  switch (m.tipo) {
    case 'venta': return { texto: m.cancelada ? `Venta #${m.folio} · cancelada` : `Venta #${m.folio}`, tono: m.cancelada ? 'bg-sa-strawberry/15 text-sa-strawberry' : 'bg-sa-mint/30 text-sa-green-ink' }
    case 'sin_cobrar': return { texto: `Sin cobrar #${m.folio}`, tono: 'bg-sa-banana/40 text-sa-green-ink' }
    case 'cancelacion': return { texto: `Cancelación #${m.folio}`, tono: 'bg-sa-strawberry/15 text-sa-strawberry' }
    case 'cortesia': return { texto: `Cortesía #${m.folio}`, tono: 'bg-sa-blueberry/15 text-sa-blueberry' }
    case 'quito': return { texto: 'Quitó del carrito', tono: 'bg-sa-banana/40 text-sa-green-ink' }
    case 'vacio': return { texto: 'Vació el carrito', tono: 'bg-sa-strawberry/15 text-sa-strawberry' }
    case 'apertura': return { texto: 'Abrió caja', tono: 'bg-sa-cream-warm text-sa-green-ink' }
    case 'cierre': return { texto: 'Cerró caja', tono: 'bg-sa-cream-warm text-sa-green-ink' }
  }
}

function descripcion(m: MovimientoCaja): string {
  if (m.tipo === 'quito' || m.tipo === 'vacio') {
    const items = (m.detalle?.items ?? []).map((i) => `${i.c > 1 ? `${i.c}× ` : ''}${i.n}`).join(' · ')
    const donde = m.detalle?.ruta ? ` (${(PASOS[m.detalle.ruta] ?? m.detalle.ruta).toLowerCase()})` : ''
    return items + donde
  }
  if (m.tipo === 'apertura') return `Fondo ${mxn(Number(m.importe ?? 0))}`
  if (m.tipo === 'cierre') return `Contó ${mxn(Number(m.importe ?? 0))}`
  const partes = [m.texto, m.cliente ? `para ${m.cliente}` : null,
    m.metodo ? METODO[m.metodo] ?? m.metodo : null,
    m.descuento ? `descuento ${mxn(Number(m.descuento))}` : null]
  return partes.filter(Boolean).join(' · ')
}

export default function CajaEnVivo() {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refrescado, setRefrescado] = useState<Date | null>(null)
  const [, setTic] = useState(0)
  const [filtro, setFiltro] = useState<Filtro>('todo')

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const r = await cajaEnVivo(sb)
        if (!vivo) return
        setD(r); setError(null); setRefrescado(new Date())
      } catch (e) {
        if (vivo) setError(mensajeDeError(e))
      }
    }
    void cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    const reloj = setInterval(() => setTic((t) => t + 1), 1_000)
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivo = false; clearInterval(id); clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver) }
  }, [])

  const movs = useMemo(() => {
    const todos = d?.movimientos ?? []
    if (filtro === 'ventas') return todos.filter((m) => m.tipo === 'venta')
    if (filtro === 'revisar') return todos.filter((m) => PARA_REVISAR.has(m.tipo) || (m.tipo === 'venta' && (m.cancelada || m.descuento)))
    return todos
  }, [d, filtro])

  const cuentaRevisar = (d?.movimientos ?? []).filter((m) => PARA_REVISAR.has(m.tipo)).length

  if (!d && !error) return <Loading>Conectando con la caja…</Loading>

  return (
    <div>
      <PageHeader
        title="Caja en vivo"
        subtitle={<>Lo que tiene la pantalla del kiosko ahora y todo lo que pasó en el turno. {refrescado && <span className="font-mono text-xs">· actualizado {hace(refrescado)}</span>}</>}
      />
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {d && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ── La pantalla ahora ─────────────────────────────── */}
          <section className="min-w-0">
            <p className={`${cx.label} mb-2`}>En la pantalla ahora</p>
            {d.pantallas.length === 0 && (
              <div className={cx.panel}>
                <p className={cx.muted}>
                  El kiosko todavía no ha reportado. Empieza a hacerlo en cuanto se actualice la página
                  del kiosko (se actualiza sola al llegar al menú con el carrito vacío).
                </p>
              </div>
            )}
            <div className="space-y-3">
              {d.pantallas.map((p) => {
                const e = p.estado
                const vivo = p.hace_seg < 45
                const quieto = e.cambio ? hace(new Date(e.cambio)) : null
                return (
                  <div key={p.pantalla} className={cx.panel}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="flex items-center gap-2 font-mono text-xs text-sa-green-ink/60">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${vivo ? 'bg-sa-mint' : p.hace_seg < 180 ? 'bg-sa-banana' : 'bg-sa-strawberry'}`} />
                          {p.pantalla} · {vivo ? 'en línea' : `sin señal hace ${Math.round(p.hace_seg / 60)} min`}
                        </p>
                        <h3 className={`${cx.h3} mt-1`}>{PASOS[e.ruta] ?? e.ruta}</h3>
                        <p className="text-sm text-sa-green-ink/70 mt-0.5">
                          Cobra <b>{e.cajero ?? 'nadie con turno'}</b>
                          {e.cliente && <> · cliente {e.cliente}</>}
                          {e.pedido && <> · pedido «{e.pedido}»</>}
                          {quieto && <> · sin cambios {quieto}</>}
                        </p>
                      </div>
                      {e.apartadas > 0 && <Chip tone="neutral">{e.apartadas} en espera</Chip>}
                    </div>
                    <div className="mt-4">
                      {e.items.length === 0 ? (
                        <p className={`text-sm ${cx.muted}`}>Carrito vacío.</p>
                      ) : (
                        <ul className="divide-y divide-sa-green-ink/5">
                          {e.items.map((it, i) => (
                            <li key={i} className="py-2 flex justify-between gap-3 text-sm">
                              <span className="min-w-0">
                                {it.c > 1 && <b>{it.c}× </b>}{it.n}
                                {it.x && <span className="block text-xs text-sa-green-ink/55">+ {it.x.join(', ')}</span>}
                              </span>
                              <span className="font-mono tabular-nums whitespace-nowrap">{mxn(it.p)}</span>
                            </li>
                          ))}
                          <li className="pt-3 flex justify-between font-semibold">
                            <span>Total en pantalla</span>
                            <span className="font-mono tabular-nums">{mxn(e.total)}</span>
                          </li>
                        </ul>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── El turno ─────────────────────────────── */}
            <p className={`${cx.label} mt-6 mb-2`}>El turno</p>
            {d.corte ? (
              <div className={cx.panel}>
                <p className="text-sm text-sa-green-ink/70">
                  Corte {d.corte.folio ? `#${d.corte.folio}` : ''} · abrió <b>{d.corte.abrio ?? '—'}</b> a las {hora(d.corte.abierto_en)}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                  {[
                    ['Ventas', `${d.corte.ordenes}`, mxn(d.corte.total)],
                    ['Efectivo', mxn(d.corte.efectivo), null],
                    ['Clip', mxn(d.corte.clip), null],
                    ['Terminal del banco', mxn(d.corte.tarjeta), null],
                    ['Cortesías', mxn(d.corte.cortesia), null],
                    ['En el cajón debería haber', mxn(d.corte.efectivo_esperado), `fondo ${mxn(d.corte.fondo)} + efectivo`],
                  ].map(([k, v, s]) => (
                    <div key={k as string} className="bg-sa-cream-soft rounded-sa px-3 py-2.5 min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/55">{k}</p>
                      <p className="font-display text-xl text-sa-green-ink leading-tight tabular-nums">{v}</p>
                      {s && <p className="text-[11px] text-sa-green-ink/55">{s}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={cx.panel}><p className={cx.muted}>No hay caja abierta. Abajo, lo de las últimas 12 horas.</p></div>
            )}
          </section>

          {/* ── Movimientos ─────────────────────────────── */}
          <section className="min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <p className={cx.label}>Movimientos desde las {hora(d.desde)}</p>
              <div className="flex gap-1.5">
                {([['todo', 'Todo'], ['ventas', 'Ventas'], ['revisar', `Para revisar${cuentaRevisar ? ` (${cuentaRevisar})` : ''}`]] as [Filtro, string][]).map(([f, t]) => (
                  <button
                    key={f}
                    onClick={() => setFiltro(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === f ? 'bg-sa-green text-sa-cream border-sa-green' : 'border-sa-green-ink/15 text-sa-green-ink'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${cx.panel} !p-0`}>
              {movs.length === 0 ? (
                <p className={`p-5 ${cx.muted}`}>Nada que enseñar con este filtro.</p>
              ) : (
                <ul className="divide-y divide-sa-green-ink/5">
                  {movs.map((m, i) => {
                    const et = etiqueta(m)
                    return (
                      <li key={`${m.ts}-${i}`} className="px-4 py-3 flex gap-3 items-start">
                        <span className="font-mono text-xs text-sa-green-ink/55 pt-0.5 w-11 shrink-0 tabular-nums">{hora(m.ts)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${et.tono}`}>{et.texto}</span>
                            {m.cajero && <span className="text-xs text-sa-green-ink/60">{m.cajero}</span>}
                          </div>
                          <p className="text-sm text-sa-green-ink/80 mt-1 break-words">{descripcion(m)}</p>
                        </div>
                        {m.importe != null && m.tipo !== 'apertura' && m.tipo !== 'cierre' && (
                          <span className={`font-mono text-sm tabular-nums whitespace-nowrap ${m.tipo === 'venta' && !m.cancelada ? 'text-sa-green-ink' : 'text-sa-green-ink/60'}`}>
                            {m.tipo === 'quito' || m.tipo === 'vacio' ? '−' : ''}{mxn(Number(m.importe))}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-sa-green-ink/50 mt-2 leading-snug">
              «Sin cobrar» puede ser un cobro de Clip que falló y se volvió a intentar: busca la venta del mismo
              total unos minutos después antes de darla por perdida.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
