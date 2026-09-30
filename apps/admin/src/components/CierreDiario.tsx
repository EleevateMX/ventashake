import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  diasDeCierre, notasDeCierre, aclararCierre, bajarClipDelDia, transaccionesClipDelDia,
  type DiaDeCierre, type EstatusCierre, type NotaDeCierre, type TransaccionClip,
} from '@shake/supabase'
import { mxn, mensajeDeError, hoyEnMerida, periodoEnMerida, type TipoPeriodo } from '@shake/utils'
import { Loading, ErrorMsg, OkMsg, Panel, cx } from '../ui'

/**
 * Historial de ventas por periodo y cierre de cada día.
 *
 * Un día y un año salen de la misma función (`fn_cierre_dias`), calculada
 * en vivo: no hay un "cierre" guardado que se pueda quedar viejo si mañana
 * se cancela una venta de hoy. Lo único que se guarda son las aclaraciones.
 *
 * El fondo inicial NO es venta: se muestra para explicar el efectivo
 * esperado (fondo + efectivo vendido), y nunca entra en los totales de venta.
 */

type Modo = TipoPeriodo | 'rango'

const ESTATUS: Record<EstatusCierre, { texto: string; clase: string }> = {
  cuadrado: { texto: 'Cuadrado', clase: 'bg-sa-mint/30 text-sa-green-ink' },
  con_diferencia: { texto: 'Con diferencia', clase: 'bg-sa-strawberry/15 text-sa-strawberry' },
  aclarado: { texto: 'Aclarado', clase: 'bg-sa-blueberry/15 text-sa-blueberry' },
  pendiente: { texto: 'Pendiente', clase: 'bg-sa-cream-warm text-sa-green-ink/70' },
}

function ChipEstatus({ d }: { d: DiaDeCierre }) {
  const e = ESTATUS[d.estatus]
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${e.clase}`}>
      {e.texto}
    </span>
  )
}

/** Diferencia con signo y color: + sobra, − falta, 0 en verde. */
function Dif({ v }: { v: number | null }) {
  if (v == null) return <span className={cx.muted}>—</span>
  const r = Math.round(v * 100) / 100
  const color = r === 0 ? 'text-sa-green' : 'text-sa-strawberry font-semibold'
  return <span className={color}>{r > 0 ? '+' : ''}{mxn(r)}</span>
}

function fechaLarga(dia: string) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${dia}T12:00:00Z`))
}

const suma = (xs: DiaDeCierre[], f: (d: DiaDeCierre) => number | null) =>
  xs.reduce((a, d) => a + (f(d) ?? 0), 0)

export function CierreDiario() {
  const [modo, setModo] = useState<Modo>('mes')
  const [atras, setAtras] = useState(0)
  const hoy = hoyEnMerida()
  const [rDesde, setRDesde] = useState(hoy.slice(0, 8) + '01')
  const [rHasta, setRHasta] = useState(hoy)

  const periodo = useMemo(() => {
    if (modo === 'rango') return { desde: rDesde, hasta: rHasta, etiqueta: `Del ${rDesde} al ${rHasta}` }
    return periodoEnMerida(modo, atras)
  }, [modo, atras, rDesde, rHasta])

  const [dias, setDias] = useState<DiaDeCierre[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [bajando, setBajando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setDias(await diasDeCierre(sb, periodo.desde, periodo.hasta))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
      setDias([])
    }
  }, [periodo.desde, periodo.hasta])

  useEffect(() => { setDias(null); void cargar() }, [cargar])

  const t = useMemo(() => {
    const xs = dias ?? []
    const venta = suma(xs, (d) => d.venta_total)
    const ordenes = suma(xs, (d) => d.ordenes)
    const bajados = xs.filter((d) => d.clip_bajado)
    return {
      venta, ordenes,
      ticket: ordenes > 0 ? venta / ordenes : 0,
      efectivo: suma(xs, (d) => d.efectivo),
      tarjeta: suma(xs, (d) => d.tarjeta),
      clip: suma(xs, (d) => d.clip),
      cortesia: suma(xs, (d) => d.cortesia),
      otro: suma(xs, (d) => d.otro),
      difEfectivo: suma(xs, (d) => d.dif_efectivo),
      difTarjeta: suma(bajados, (d) => d.dif_tarjeta),
      difClip: suma(bajados, (d) => d.dif_clip),
      difTotal: suma(xs, (d) => d.dif_total),
      cortes: suma(xs, (d) => d.cortes),
      conteo: {
        cuadrado: xs.filter((d) => d.estatus === 'cuadrado').length,
        con_diferencia: xs.filter((d) => d.estatus === 'con_diferencia').length,
        aclarado: xs.filter((d) => d.estatus === 'aclarado').length,
        pendiente: xs.filter((d) => d.estatus === 'pendiente').length,
      },
      faltaClip: xs.filter((d) => !d.clip_bajado && d.dia < hoy && (d.tarjeta > 0 || d.clip > 0)),
    }
  }, [dias, hoy])

  // De uno en uno: son pocas consultas y así Clip no nos corta por ráfaga.
  async function bajarPendientes() {
    setError(null); setAviso(null)
    let n = 0
    for (const d of t.faltaClip) {
      setBajando(d.dia)
      try {
        const r = await bajarClipDelDia(sb, d.dia)
        n += r.transacciones
      } catch (e) {
        setError(mensajeDeError(e))
        break
      }
    }
    setBajando(null)
    if (n > 0 || t.faltaClip.length > 0) setAviso(`Se bajaron ${n} transacciones de Clip.`)
    await cargar()
  }

  function exportar() {
    const xs = [...(dias ?? [])].reverse()
    const n = (v: number | null) => (v == null ? '' : v.toFixed(2))
    const encabezado = [
      'Fecha', 'Órdenes', 'Venta total', 'Ticket promedio', 'Efectivo vendido', 'Tarjeta (POS)',
      'Clip (POS)', 'Cortesías', 'Otros', 'Fondo inicial', 'Efectivo esperado', 'Efectivo contado',
      'Diferencia efectivo', 'Número de cortes', 'Tarjeta real terminal chica', 'Diferencia de tarjeta',
      'Clip real', 'Diferencia de Clip', 'Diferencia total', 'Estatus', 'Pendiente por', 'Observaciones',
    ]
    const filas = xs.map((d) => [
      d.dia, String(d.ordenes), n(d.venta_total), n(d.ticket_promedio), n(d.efectivo), n(d.tarjeta),
      n(d.clip), n(d.cortesia), n(d.otro), n(d.fondo_inicial), n(d.efectivo_esperado), n(d.efectivo_contado),
      n(d.dif_efectivo), String(d.cortes), n(d.tarjeta_real), n(d.dif_tarjeta),
      n(d.clip_real), n(d.dif_clip), n(d.dif_total), ESTATUS[d.estatus].texto, d.motivo ?? '',
      d.ultima_nota ? `${d.ultima_nota}${d.ultima_nota_por ? ` (${d.ultima_nota_por})` : ''}` : '',
    ])
    // El fondo inicial no se suma en el total: no es venta, y sumar fondos
    // de varios días no significa nada.
    const totales = [
      'TOTAL DEL PERIODO', String(t.ordenes), n(t.venta), n(t.ticket), n(t.efectivo), n(t.tarjeta),
      n(t.clip), n(t.cortesia), n(t.otro), '', '', '', n(t.difEfectivo), String(t.cortes),
      '', n(t.difTarjeta), '', n(t.difClip), n(t.difTotal), '', '', '',
    ]
    const todo = [encabezado, ...filas, totales]
    // El BOM es lo que hace que Excel en español no parta los acentos.
    const csv = '﻿' + todo.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ventas-${periodo.desde}-a-${periodo.hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const diaAbierto = dias?.find((d) => d.dia === abierto) ?? null

  const boton = (m: Modo, texto: string) => (
    <button
      onClick={() => { setModo(m); setAtras(0) }}
      className={`px-4 py-2 rounded-sa text-sm font-medium ${modo === m
        ? 'bg-sa-green text-sa-cream' : 'bg-white border border-sa-green-ink/15 text-sa-green-ink'}`}
    >
      {texto}
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {boton('semana', 'Semana')}
        {boton('mes', 'Mes')}
        {boton('anio', 'Año')}
        {boton('rango', 'Rango')}
        <div className="w-4" />
        {modo === 'rango' ? (
          <>
            <input type="date" value={rDesde} onChange={(e) => setRDesde(e.target.value)} className={`${cx.input} w-auto`} />
            <span className={cx.muted}>a</span>
            <input type="date" value={rHasta} onChange={(e) => setRHasta(e.target.value)} className={`${cx.input} w-auto`} />
          </>
        ) : (
          <>
            <button onClick={() => setAtras(atras + 1)} className={cx.btnSec} aria-label="Periodo anterior">‹</button>
            <span className="font-medium text-sa-green-ink min-w-[12rem] text-center">{periodo.etiqueta}</span>
            <button onClick={() => setAtras(Math.max(0, atras - 1))} disabled={atras === 0}
              className={`${cx.btnSec} disabled:opacity-30`} aria-label="Periodo siguiente">›</button>
          </>
        )}
        <div className="flex-1" />
        {t.faltaClip.length > 0 && (
          <button onClick={() => void bajarPendientes()} disabled={bajando !== null} className={cx.btnSec}>
            {bajando ? `Bajando ${bajando}…` : `Bajar Clip (${t.faltaClip.length} día${t.faltaClip.length === 1 ? '' : 's'})`}
          </button>
        )}
        <button onClick={exportar} disabled={!dias || dias.length === 0} className={cx.btnPrimary}>
          Exportar a Excel
        </button>
      </div>

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {aviso && <OkMsg>{aviso}</OkMsg>}

      {dias === null ? <Loading>Cargando el periodo…</Loading> : dias.length === 0 ? (
        <Panel><p className={cx.muted}>Sin ventas ni cortes en este periodo.</p></Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Tarjeta titulo="Venta total" valor={mxn(t.venta)} />
            <Tarjeta titulo="Órdenes" valor={String(t.ordenes)} />
            <Tarjeta titulo="Ticket promedio" valor={mxn(t.ticket)} nota="venta ÷ órdenes" />
            <Tarjeta titulo="Efectivo" valor={mxn(t.efectivo)} />
            <Tarjeta titulo="Tarjeta" valor={mxn(t.tarjeta)} nota="terminal chica" />
            <Tarjeta titulo="Clip" valor={mxn(t.clip)} nota="terminal integrada" />
            <Tarjeta titulo="Cortesías" valor={mxn(t.cortesia)} />
            <Tarjeta titulo="Otros" valor={mxn(t.otro)} />
            <Tarjeta titulo="Dif. de efectivo" valor={<Dif v={t.difEfectivo} />} nota="acumulada" />
            <Tarjeta titulo="Dif. de tarjeta" valor={<Dif v={t.difTarjeta} />} nota="días bajados de Clip" />
            <Tarjeta titulo="Dif. de Clip" valor={<Dif v={t.difClip} />} nota="días bajados de Clip" />
            <Tarjeta titulo="Días" valor={
              <span className="text-base">
                {t.conteo.cuadrado} ✓ · {t.conteo.con_diferencia} ✗ · {t.conteo.aclarado} ✎ · {t.conteo.pendiente} …
              </span>
            } nota="cuadrados · con dif. · aclarados · pendientes" />
          </div>

          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Fecha</th>
                  <th className={cx.thNum}>Órdenes</th>
                  <th className={cx.thNum}>Venta total</th>
                  <th className={cx.thNum}>Ticket prom.</th>
                  <th className={cx.thNum}>Efectivo vendido</th>
                  <th className={cx.thNum}>Tarjeta</th>
                  <th className={cx.thNum}>Clip</th>
                  <th className={cx.thNum}>Cortesías</th>
                  <th className={cx.thNum}>Otros</th>
                  <th className={cx.thNum}>Efectivo esperado</th>
                  <th className={cx.thNum}>Efectivo contado</th>
                  <th className={cx.thNum}>Dif. efectivo</th>
                  <th className={cx.thNum}>Cortes</th>
                  <th className={cx.thNum}>Tarjeta real</th>
                  <th className={cx.thNum}>Dif. tarjeta</th>
                  <th className={cx.thNum}>Dif. Clip</th>
                  <th className={cx.th}>Estatus</th>
                  <th className={cx.th}>Observaciones</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {dias.map((d) => (
                  <tr key={d.dia} className={`${cx.tr} cursor-pointer`} onClick={() => setAbierto(d.dia)}>
                    <td className={`${cx.td} font-medium whitespace-nowrap`}>{fechaLarga(d.dia)}</td>
                    <td className={cx.tdNum}>{d.ordenes}</td>
                    <td className={`${cx.tdNum} font-semibold`}>{mxn(d.venta_total)}</td>
                    <td className={cx.tdNum}>{mxn(d.ticket_promedio)}</td>
                    <td className={cx.tdNum}>{mxn(d.efectivo)}</td>
                    <td className={cx.tdNum}>{mxn(d.tarjeta)}</td>
                    <td className={cx.tdNum}>{mxn(d.clip)}</td>
                    <td className={cx.tdNum}>{mxn(d.cortesia)}</td>
                    <td className={cx.tdNum}>{mxn(d.otro)}</td>
                    <td className={cx.tdNum}>{mxn(d.efectivo_esperado)}</td>
                    <td className={cx.tdNum}>{mxn(d.efectivo_contado)}</td>
                    <td className={cx.tdNum}><Dif v={d.cortes_abiertos > 0 ? null : d.dif_efectivo} /></td>
                    <td className={cx.tdNum}>{d.cortes}</td>
                    <td className={cx.tdNum}>{d.tarjeta_real == null ? <span className={cx.muted}>—</span> : mxn(d.tarjeta_real)}</td>
                    <td className={cx.tdNum}><Dif v={d.dif_tarjeta} /></td>
                    <td className={cx.tdNum}><Dif v={d.dif_clip} /></td>
                    <td className={cx.td}>
                      <ChipEstatus d={d} />
                      {d.motivo && <div className="text-[11px] text-sa-green-ink/50 mt-1 whitespace-nowrap">{d.motivo}</div>}
                    </td>
                    <td className={`${cx.td} text-xs max-w-[16rem] truncate`} title={d.ultima_nota ?? ''}>
                      {d.ultima_nota ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`${cx.muted} text-xs`}>
            Toca un día para ver su cierre. El fondo inicial no es venta: solo explica el efectivo esperado
            (fondo + efectivo vendido). «Tarjeta real» es lo que Clip reporta de la terminal chica, y aparece
            cuando ese día ya se bajó de Clip.
          </p>
        </>
      )}

      {diaAbierto && (
        <DetalleDelDia
          d={diaAbierto}
          onCerrar={() => setAbierto(null)}
          onCambio={() => void cargar()}
        />
      )}
    </div>
  )
}

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: React.ReactNode; nota?: string }) {
  return (
    <div className="bg-white rounded-sa p-4 shadow-sa-sm border border-sa-green-ink/5">
      <div className={cx.label}>{titulo}</div>
      <div className="font-mono tabular-nums text-xl text-sa-green-ink mt-1">{valor}</div>
      {nota && <div className="text-[11px] text-sa-green-ink/40 mt-0.5">{nota}</div>}
    </div>
  )
}

function Renglon({ t, pos, real, dif, nota }: {
  t: string; pos: number; real?: number | null; dif?: number | null; nota?: string
}) {
  return (
    <tr className={cx.tr}>
      <td className={`${cx.td} font-medium`}>{t}{nota && <div className="text-[11px] text-sa-green-ink/50 font-normal">{nota}</div>}</td>
      <td className={cx.tdNum}>{mxn(pos)}</td>
      <td className={cx.tdNum}>{real === undefined ? '' : real == null ? <span className={cx.muted}>sin bajar</span> : mxn(real)}</td>
      <td className={cx.tdNum}>{dif === undefined ? '' : <Dif v={dif} />}</td>
    </tr>
  )
}

function DetalleDelDia({ d, onCerrar, onCambio }: { d: DiaDeCierre; onCerrar: () => void; onCambio: () => void }) {
  const [notas, setNotas] = useState<NotaDeCierre[] | null>(null)
  const [trans, setTrans] = useState<TransaccionClip[] | null>(null)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [n, tr] = await Promise.all([notasDeCierre(sb, d.dia), transaccionesClipDelDia(sb, d.dia)])
      setNotas(n); setTrans(tr)
    } catch (e) { setError(mensajeDeError(e)) }
  }, [d.dia])

  useEffect(() => { void cargar() }, [cargar])

  async function bajar() {
    setOcupado(true); setError(null)
    try { await bajarClipDelDia(sb, d.dia); await cargar(); onCambio() }
    catch (e) { setError(mensajeDeError(e)) }
    finally { setOcupado(false) }
  }

  async function aclarar() {
    if (texto.trim().length < 3) return
    setOcupado(true); setError(null)
    try { await aclararCierre(sb, d.dia, texto.trim()); setTexto(''); await cargar(); onCambio() }
    catch (e) { setError(mensajeDeError(e)) }
    finally { setOcupado(false) }
  }

  const chicas = (trans ?? []).filter((x) => x.terminal === 'chica')
  const principales = (trans ?? []).filter((x) => x.terminal === 'principal')

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-ink/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-sa-cream-soft rounded-sa-lg w-full max-w-3xl my-8 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-3xl font-display text-sa-green-ink">Cierre del {fechaLarga(d.dia)}</h3>
            <div className="mt-2 flex items-center gap-2">
              <ChipEstatus d={d} />
              {d.motivo && <span className="text-sm text-sa-green-ink/60">{d.motivo}</span>}
            </div>
          </div>
          <button onClick={onCerrar} className={cx.btnSec}>Cerrar</button>
        </div>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        <div className="grid grid-cols-3 gap-3">
          <Tarjeta titulo="Venta total" valor={mxn(d.venta_total)} nota={`${d.ordenes} órdenes · ticket ${mxn(d.ticket_promedio)}`} />
          <Tarjeta titulo="Cortes" valor={String(d.cortes)} nota={d.cortes_abiertos > 0 ? `${d.cortes_abiertos} sin cerrar` : 'todos cerrados'} />
          <Tarjeta titulo="Diferencia total" valor={<Dif v={d.dif_total} />} nota={d.clip_bajado ? 'efectivo + tarjeta + Clip' : 'solo efectivo: falta bajar Clip'} />
        </div>

        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Concepto</th>
                <th className={cx.thNum}>Sistema (POS)</th>
                <th className={cx.thNum}>Real</th>
                <th className={cx.thNum}>Diferencia</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              <Renglon t="Fondo inicial" pos={d.fondo_inicial} nota="No es venta" />
              <Renglon t="Efectivo vendido" pos={d.efectivo} />
              <Renglon t="Efectivo" pos={d.efectivo_esperado} real={d.efectivo_contado}
                dif={d.cortes_abiertos > 0 ? null : d.dif_efectivo} nota="esperado (fondo + vendido) contra contado" />
              <Renglon t="Tarjeta" pos={d.tarjeta} real={d.tarjeta_real} dif={d.dif_tarjeta} nota="terminal chica, según Clip" />
              <Renglon t="Clip" pos={d.clip} real={d.clip_real} dif={d.dif_clip} nota="terminal integrada, según Clip" />
              {d.cortesia > 0 && <Renglon t="Cortesías" pos={d.cortesia} />}
              {d.otro > 0 && <Renglon t="Otros" pos={d.otro} />}
            </tbody>
          </table>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-display text-xl text-sa-green-ink">Clip de este día</h4>
            <button onClick={() => void bajar()} disabled={ocupado} className={cx.btnSec}>
              {ocupado ? 'Consultando…' : d.clip_bajado ? 'Volver a bajar de Clip' : 'Bajar de Clip'}
            </button>
          </div>
          {!d.clip_bajado ? (
            <p className={`${cx.muted} text-sm`}>
              Aún no se consulta Clip para este día. Al bajarlo, cada cobro que empata con uno de la terminal
              integrada se marca como tal; lo que no empata con nada es de la terminal chica.
            </p>
          ) : trans === null ? <Loading>Cargando…</Loading> : trans.length === 0 ? (
            <p className={`${cx.muted} text-sm`}>Clip no reporta transacciones este día.</p>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Hora</th>
                    <th className={cx.th}>Terminal</th>
                    <th className={cx.th}>Folio</th>
                    <th className={cx.th}>Tarjeta</th>
                    <th className={cx.th}>Estado</th>
                    <th className={cx.thNum}>Monto</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {[...chicas, ...principales].map((x) => (
                    <tr key={x.receipt_no} className={cx.tr}>
                      <td className={`${cx.td} font-mono`}>{x.hora}</td>
                      <td className={cx.td}>
                        {x.terminal === 'chica'
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sa-banana/40">Chica</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sa-mint/30">Integrada</span>}
                      </td>
                      <td className={`${cx.td} font-mono`}>{x.folio ? `#${x.folio}` : '—'}</td>
                      <td className={`${cx.td} font-mono`}>{x.last4 ? `•••• ${x.last4}` : ''}</td>
                      <td className={`${cx.td} text-xs`}>{x.status ?? ''}</td>
                      <td className={cx.tdNum}>{mxn(x.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h4 className="font-display text-xl text-sa-green-ink mb-2">Aclaraciones</h4>
          <p className={`${cx.muted} text-sm mb-3`}>
            Por qué no cuadró, o qué se revisó. No se editan ni se borran: si algo cambia, se agrega otra.
            Un día con diferencia y aclaración queda como «Aclarado».
          </p>
          {(notas ?? []).length > 0 && (
            <ul className="space-y-2 mb-3">
              {(notas ?? []).map((n) => (
                <li key={n.id} className="bg-white rounded-sa p-3 border border-sa-green-ink/5">
                  <div className="text-sm text-sa-green-ink whitespace-pre-wrap">{n.nota}</div>
                  <div className="text-[11px] text-sa-green-ink/50 mt-1 font-mono">
                    {n.creada_por ?? '—'} · {new Date(n.creada_en).toLocaleString('es-MX', { timeZone: 'America/Merida' })}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="Ej. Faltaron $50: se pagó al proveedor de hielo con efectivo de caja"
            className={cx.input}
          />
          <div className="flex justify-end mt-2">
            <button onClick={() => void aclarar()} disabled={ocupado || texto.trim().length < 3} className={cx.btnPrimary}>
              Guardar aclaración
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
