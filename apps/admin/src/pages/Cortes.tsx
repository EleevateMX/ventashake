import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { listarCortes, sumaDesglose } from '@shake/supabase'
import type { CorteConDetalle } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'

/**
 * Los cortes de caja, para revisarlos después.
 *
 * Hasta ahora se cerraba el turno y no había dónde mirarlo: el arqueo
 * existía solo en la pantalla del kiosko, y desaparecía al cerrar el
 * modal. Aquí queda el historial, con la diferencia y —lo que de verdad
 * sirve para reclamar— **cuántos billetes de cada denominación había**.
 */

const BILLETES = [1000, 500, 200, 100, 50, 20]
const MONEDAS = [20, 10, 5, 2, 1]

/** Cuánto tuvo abierto un turno, en palabras de gente. */
function duracion(abierto: string | null, cerrado: string | null): string {
  if (!abierto) return '—'
  const fin = cerrado ? new Date(cerrado) : new Date()
  const horas = (fin.getTime() - new Date(abierto).getTime()) / 3_600_000
  if (horas < 1) return `${Math.round(horas * 60)} min`
  if (horas < 48) return `${horas.toFixed(1)} h`
  return `${Math.floor(horas / 24)} días`
}

function fecha(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * El desglose contado, en columnas. Solo se pintan las denominaciones que
 * tuvieron piezas: una tabla llena de ceros esconde los dos renglones que
 * importan.
 */
function Desglose({ titulo, d }: { titulo: string; d: Record<number, number> | null }) {
  const conPiezas = (lista: number[]) => lista.filter((den) => Number(d?.[den] ?? 0) > 0)
  const billetes = conPiezas(BILLETES)
  const monedas = conPiezas(MONEDAS)

  if (!d || (billetes.length === 0 && monedas.length === 0)) {
    return (
      <div>
        <p className={`${cx.muted} font-mono text-[10px] uppercase tracking-wider mb-1`}>{titulo}</p>
        <p className={cx.muted}>
          {d ? 'Se contó en cero.' : 'Sin desglose — se capturó antes de que existiera.'}
        </p>
      </div>
    )
  }

  const fila = (den: number) => (
    <div key={den} className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="font-mono text-xs opacity-70">${den}</span>
      <span className="font-mono text-xs">× {d[den]}</span>
      <span className="font-mono text-xs tabular-nums opacity-60">{mxn(den * Number(d[den]))}</span>
    </div>
  )

  return (
    <div>
      <p className={`${cx.muted} font-mono text-[10px] uppercase tracking-wider mb-1`}>{titulo}</p>
      {billetes.length > 0 && (
        <>
          <p className={`${cx.muted} font-mono text-[9px] uppercase tracking-wider mt-1`}>Billetes</p>
          {billetes.map(fila)}
        </>
      )}
      {monedas.length > 0 && (
        <>
          <p className={`${cx.muted} font-mono text-[9px] uppercase tracking-wider mt-2`}>Monedas</p>
          {monedas.map(fila)}
        </>
      )}
      <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-current/10">
        <span className="font-mono text-[10px] uppercase tracking-wider opacity-60">Suma</span>
        <span className="font-mono text-sm tabular-nums">{mxn(sumaDesglose(d))}</span>
      </div>
    </div>
  )
}

export default function Cortes() {
  const [cortes, setCortes] = useState<CorteConDetalle[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarCortes(sb, 60)
      .then((c) => { setCortes(c); setError(null) })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <Loading>Cargando cortes…</Loading>

  const enCurso = cortes.filter((c) => !c.cerrado_en)

  return (
    <div>
      <PageHeader
        title="Cortes de caja"
        subtitle="Arqueo de cada turno, con el desglose de lo que se contó"
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* Un turno que lleva demasiado abierto no es un turno: es un corte
          que nadie cerró, y su arqueo no significa nada porque mezcla
          varios días. Vale la pena decirlo antes que nada. */}
      {enCurso.map((c) => {
        const horas = (Date.now() - new Date(c.abierto_en as string).getTime()) / 3_600_000
        if (horas < 24) return null
        return (
          <div key={c.corte_id} className="mb-4">
            <ErrorMsg>
              La caja «{c.caja}» lleva {duracion(c.abierto_en, null)} abierta, con{' '}
              {c.num_ordenes ?? 0} pedidos. El arqueo de un turno así junta varios
              días y no cuadra con nada: hay que cerrarlo contando el cajón
              (kiosko → 5 toques a Milo → PIN) y abrir uno nuevo.
            </ErrorMsg>
          </div>
        )
      })}

      {cortes.length === 0 ? (
        <Panel><p className={cx.muted}>Todavía no hay cortes registrados.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Turno</th>
                <th className={cx.th}>Quién</th>
                <th className={cx.thNum}>Pedidos</th>
                <th className={cx.thNum}>Fondo</th>
                <th className={cx.thNum}>Efectivo esperado</th>
                <th className={cx.thNum}>Contado</th>
                <th className={cx.thNum}>Diferencia</th>
                <th className={cx.th}></th>
              </tr>
            </thead>
            <tbody>
              {cortes.map((c) => {
                const dif = Number(c.diferencia ?? 0)
                const cerrado = Boolean(c.cerrado_en)
                const expandido = abierto === c.corte_id
                return (
                  <>
                    <tr key={c.corte_id} className={cx.tr}>
                      <td className={cx.td}>
                        <span className="block">{fecha(c.abierto_en)}</span>
                        <span className={`${cx.muted} font-mono text-[10px]`}>
                          {cerrado ? `cerrado ${fecha(c.cerrado_en)}` : 'abierto ahora'}
                          {' · '}{duracion(c.abierto_en, c.cerrado_en)}
                        </span>
                      </td>
                      <td className={cx.td}>
                        <span className="block">{c.abrio ?? '—'}</span>
                        {c.cerro && c.cerro !== c.abrio && (
                          <span className={`${cx.muted} font-mono text-[10px]`}>cerró {c.cerro}</span>
                        )}
                      </td>
                      <td className={cx.tdNum}>{c.num_ordenes ?? 0}</td>
                      <td className={cx.tdNum}>{mxn(Number(c.fondo_inicial ?? 0))}</td>
                      <td className={cx.tdNum}>{mxn(Number(c.efectivo_esperado ?? 0))}</td>
                      <td className={cx.tdNum}>
                        {cerrado ? mxn(Number(c.efectivo_contado ?? 0)) : '—'}
                      </td>
                      <td className={cx.tdNum}>
                        {!cerrado ? (
                          '—'
                        ) : (
                          <span className={dif === 0 ? '' : 'font-semibold text-red-600 dark:text-red-400'}>
                            {mxn(dif)}
                            {dif !== 0 && (dif > 0 ? ' sobra' : ' falta')}
                          </span>
                        )}
                      </td>
                      <td className={cx.td}>
                        <button
                          onClick={() => setAbierto(expandido ? null : (c.corte_id as string))}
                          className="font-mono text-[10px] uppercase tracking-wider underline opacity-70 hover:opacity-100"
                        >
                          {expandido ? 'Ocultar' : 'Desglose'}
                        </button>
                      </td>
                    </tr>
                    {expandido && (
                      <tr key={`${c.corte_id}-d`}>
                        <td className={cx.td} colSpan={8}>
                          <div className="grid gap-6 sm:grid-cols-3 py-2">
                            <Desglose titulo="Con qué se abrió" d={c.desglose_apertura} />
                            <Desglose titulo="Con qué se cerró" d={c.desglose_cierre} />
                            <div>
                              <p className={`${cx.muted} font-mono text-[10px] uppercase tracking-wider mb-1`}>
                                Cobrado por método
                              </p>
                              {([
                                ['Efectivo', c.total_efectivo],
                                ['Clip', c.total_clip],
                                ['Tarjeta', c.total_tarjeta],
                                ['Cortesía', c.total_cortesia],
                                ['Otro', c.total_otro],
                              ] as const)
                                .filter(([, v]) => Number(v ?? 0) !== 0)
                                .map(([nombre, v]) => (
                                  <div key={nombre} className="flex items-baseline justify-between gap-3 py-0.5">
                                    <span className="font-mono text-xs opacity-70">{nombre}</span>
                                    <span className="font-mono text-xs tabular-nums">{mxn(Number(v ?? 0))}</span>
                                  </div>
                                ))}
                              <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-current/10">
                                <span className="font-mono text-[10px] uppercase tracking-wider opacity-60">Total</span>
                                <span className="font-mono text-sm tabular-nums">
                                  {mxn(Number(c.total_pagado ?? 0))}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
