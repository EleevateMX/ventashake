import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  kardex, registrarSalida, reiniciarInventario,
  type FilaKardex, type MotivoSalida,
} from '@shake/supabase'
import type { StockAlmacen } from '@shake/types'
import { mxn, mensajeDeError, hoyEnMerida, diasAntesEnMerida } from '@shake/utils'
import { ErrorMsg, Loading, cx } from '../ui'
import { DetalleDeTicket } from './TicketsDelTurno'

/**
 * Las tres herramientas del inventario que escriben o explican un
 * movimiento: el kardex de un producto, las salidas que no son venta y el
 * reinicio. Ninguna borra historia: todo cambio de existencia deja su
 * renglón con quién y por qué.
 */

export const CLASES: Record<string, { texto: string; clase: string }> = {
  venta: { texto: 'Venta', clase: 'bg-sa-blueberry/15 text-sa-blueberry' },
  compra: { texto: 'Compra', clase: 'bg-sa-mint/30 text-sa-green-ink' },
  entrada: { texto: 'Entrada', clase: 'bg-sa-mint/30 text-sa-green-ink' },
  traspaso: { texto: 'Traspaso', clase: 'bg-sa-cream-warm text-sa-green-ink' },
  produccion: { texto: 'Producción', clase: 'bg-sa-mint/30 text-sa-green-ink' },
  conteo: { texto: 'Ajuste por conteo', clase: 'bg-sa-banana/40 text-sa-green-ink' },
  costeos: { texto: 'Ajuste desde Costeos', clase: 'bg-sa-cream-warm text-sa-green-ink/70' },
  reinicio: { texto: 'Reinicio', clase: 'bg-sa-green-ink text-sa-cream' },
  ajuste: { texto: 'Ajuste', clase: 'bg-sa-banana/40 text-sa-green-ink' },
  merma: { texto: 'Merma', clase: 'bg-sa-strawberry/15 text-sa-strawberry' },
  caducado: { texto: 'Caducado', clase: 'bg-sa-strawberry/15 text-sa-strawberry' },
  danado: { texto: 'Dañado', clase: 'bg-sa-strawberry/15 text-sa-strawberry' },
  error_preparacion: { texto: 'Error de preparación', clase: 'bg-sa-strawberry/15 text-sa-strawberry' },
  consumo_interno: { texto: 'Consumo interno', clase: 'bg-sa-strawberry/15 text-sa-strawberry' },
  otro: { texto: 'Otro', clase: 'bg-sa-strawberry/15 text-sa-strawberry' },
}

export const MOTIVOS: { id: MotivoSalida; texto: string }[] = [
  { id: 'merma', texto: 'Merma' },
  { id: 'caducado', texto: 'Caducado' },
  { id: 'danado', texto: 'Dañado' },
  { id: 'error_preparacion', texto: 'Error de preparación' },
  { id: 'consumo_interno', texto: 'Consumo interno' },
  { id: 'ajuste', texto: 'Ajuste' },
  { id: 'otro', texto: 'Otro' },
]

export const TIPOS_INSUMO: Record<string, string> = {
  shake: 'Ingredientes de shakes',
  proteina: 'Proteínas',
  alimento: 'Ingredientes de alimentos',
  empaque: 'Empaque',
  reventa: 'Bebidas y snacks',
}

const num = (v: number) => v.toLocaleString('es-MX', { maximumFractionDigits: 3 })

function Modal({ titulo, children, onCerrar, ancho = 'max-w-3xl' }: {
  titulo: string; children: React.ReactNode; onCerrar: () => void; ancho?: string
}) {
  return (
    <div className="fixed inset-0 z-50 bg-sa-green-ink/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onCerrar}>
      <div className={`bg-sa-cream-soft rounded-sa-lg w-full ${ancho} my-8 p-6 space-y-4`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-3xl font-display text-sa-green-ink">{titulo}</h3>
          <button onClick={onCerrar} className={cx.btnSec}>Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Kardex ──────────────────────────────────────────────────────────────

export function KardexInsumo({ insumoId, insumo, unidad, almacenes, onCerrar }: {
  insumoId: string; insumo: string; unidad: string | null
  almacenes: { id: string; nombre: string }[]; onCerrar: () => void
}) {
  const [almacen, setAlmacen] = useState<string>('')
  const [dias, setDias] = useState<number | null>(30)
  const [filas, setFilas] = useState<FilaKardex[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ticket, setTicket] = useState<string | null>(null)

  useEffect(() => {
    setFilas(null)
    kardex(sb, insumoId, almacen || null, dias == null ? undefined : diasAntesEnMerida(dias - 1))
      .then((f) => { setFilas(f); setError(null) })
      .catch((e) => { setError(mensajeDeError(e)); setFilas([]) })
  }, [insumoId, almacen, dias])

  const tot = useMemo(() => {
    const xs = filas ?? []
    return {
      entradas: xs.reduce((a, f) => a + (f.entrada ?? 0), 0),
      salidas: xs.reduce((a, f) => a + (f.salida ?? 0), 0),
    }
  }, [filas])

  function exportar() {
    const enc = ['Fecha', 'Hora', 'Almacén', 'Tipo', 'Entrada', 'Salida', 'Saldo', 'Responsable', 'Ticket', 'Nota', 'Valor']
    const filasCsv = (filas ?? []).map((f) => {
      const d = new Date(f.fecha)
      return [
        hoyEnMerida(d), d.toLocaleTimeString('es-MX', { timeZone: 'America/Merida', hour: '2-digit', minute: '2-digit' }),
        f.almacen, CLASES[f.clase]?.texto ?? f.clase,
        f.entrada == null ? '' : String(f.entrada), f.salida == null ? '' : String(f.salida), String(f.saldo),
        f.responsable ?? '', f.folio ? `#${f.folio}` : '', f.nota ?? '', f.valor ? f.valor.toFixed(2) : '',
      ]
    })
    const csv = '﻿' + [enc, ...filasCsv].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `kardex-${insumo.replace(/[^\w-]+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal titulo={`Kardex · ${insumo}`} onCerrar={onCerrar} ancho="max-w-5xl">
      <div className="flex flex-wrap gap-2 items-center">
        <select value={almacen} onChange={(e) => setAlmacen(e.target.value)} className={`${cx.input} w-auto`}>
          <option value="">Todos los almacenes</option>
          {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDias(d)} className={dias === d ? cx.btnPrimary : cx.btnSec}>{d} días</button>
        ))}
        <button onClick={() => setDias(null)} className={dias === null ? cx.btnPrimary : cx.btnSec}>Todo</button>
        <div className="flex-1" />
        <span className="text-sm text-sa-green-ink/70 font-mono">
          +{num(tot.entradas)} / −{num(tot.salidas)} {unidad ?? ''}
        </span>
        <button onClick={exportar} disabled={!filas?.length} className={cx.btnSec}>Exportar a Excel</button>
      </div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {filas === null ? <Loading>Cargando movimientos…</Loading> : filas.length === 0 ? (
        <p className={`${cx.muted} text-sm`}>Sin movimientos en este periodo.</p>
      ) : (
        <div className={`${cx.tableWrap} max-h-[60vh] overflow-y-auto`}>
          <table className={cx.table}>
            <thead className="sticky top-0">
              <tr className={cx.thead}>
                <th className={cx.th}>Fecha</th>
                <th className={cx.th}>Tipo</th>
                <th className={cx.thNum}>Entrada</th>
                <th className={cx.thNum}>Salida</th>
                <th className={cx.thNum}>Saldo</th>
                <th className={cx.th}>Almacén</th>
                <th className={cx.th}>Responsable</th>
                <th className={cx.th}>Ticket / nota</th>
                <th className={cx.thNum}>Valor</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {filas.map((f) => {
                const c = CLASES[f.clase] ?? { texto: f.clase, clase: 'bg-sa-cream-warm' }
                return (
                  <tr key={f.id} className={cx.tr}>
                    <td className={`${cx.td} font-mono text-xs whitespace-nowrap`}>
                      {new Date(f.fecha).toLocaleString('es-MX', { timeZone: 'America/Merida', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className={cx.td}>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${c.clase}`}>{c.texto}</span>
                    </td>
                    <td className={`${cx.tdNum} text-sa-green`}>{f.entrada == null ? '' : `+${num(f.entrada)}`}</td>
                    <td className={`${cx.tdNum} text-sa-strawberry`}>{f.salida == null ? '' : `−${num(f.salida)}`}</td>
                    <td className={`${cx.tdNum} font-semibold`}>{num(f.saldo)}</td>
                    <td className={cx.td}>{f.almacen}</td>
                    <td className={`${cx.td} text-xs`}>{f.responsable ?? ''}</td>
                    <td className={`${cx.td} text-xs max-w-[18rem]`}>
                      {f.orden_id ? (
                        <button onClick={() => setTicket(f.orden_id)} className="font-mono underline text-sa-blueberry">
                          Ticket #{f.folio}
                        </button>
                      ) : <span className="text-sa-green-ink/60">{f.nota ?? ''}</span>}
                    </td>
                    <td className={cx.tdNum}>{f.valor ? mxn(f.valor) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={`${cx.muted} text-xs`}>
        Saldo = la existencia que quedó después de cada movimiento en ese almacén. «Ajuste desde Costeos» es el número
        que se tecleó en Costeos; «Ajuste por conteo», el conteo físico aplicado. Nada de esto se borra.
      </p>
      {ticket && <DetalleDeTicket ordenId={ticket} onCerrar={() => setTicket(null)} />}
    </Modal>
  )
}

// ── Buscador de productos de inventario ─────────────────────────────────

interface Insumo { id: string; nombre: string; unidad: string | null; tipo: string | null }

export function insumosDeStock(stock: StockAlmacen[]): Insumo[] {
  const m = new Map<string, Insumo>()
  for (const s of stock) {
    if (s.insumo_id && !m.has(s.insumo_id)) {
      m.set(s.insumo_id, { id: s.insumo_id, nombre: s.insumo ?? '—', unidad: s.unidad, tipo: s.insumo_tipo })
    }
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

function Buscador({ insumos, onElegir, excluir }: {
  insumos: Insumo[]; onElegir: (i: Insumo) => void; excluir: Set<string>
}) {
  const [q, setQ] = useState('')
  const hallados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return insumos.filter((i) => !excluir.has(i.id) && i.nombre.toLowerCase().includes(t)).slice(0, 12)
  }, [q, insumos, excluir])
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto de inventario…" className={cx.input} />
      {hallados.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-sa shadow-sa-sm border border-sa-green-ink/10 max-h-64 overflow-y-auto">
          {hallados.map((i) => (
            <button key={i.id} onClick={() => { onElegir(i); setQ('') }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-sa-cream-soft">
              {i.nombre} <span className="text-sa-green-ink/40 text-xs">{i.unidad ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Registrar salida ────────────────────────────────────────────────────

interface LineaUI { insumo: Insumo; cantidad: string; motivo: MotivoSalida | ''; nota: string }

export function RegistrarSalida({ stock, almacenes, onCerrar, onHecho }: {
  stock: StockAlmacen[]; almacenes: { id: string; nombre: string }[]
  onCerrar: () => void; onHecho: (msg: string) => void
}) {
  const insumos = useMemo(() => insumosDeStock(stock), [stock])
  const hoy = hoyEnMerida()
  const [almacen, setAlmacen] = useState(almacenes.find((a) => a.nombre === 'Kiosko')?.id ?? almacenes[0]?.id ?? '')
  const [fecha, setFecha] = useState(hoy)
  const [lineas, setLineas] = useState<LineaUI[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const existencia = (insumoId: string) =>
    stock.find((s) => s.insumo_id === insumoId && s.almacen_id === almacen)?.stock_actual ?? 0

  const lista = lineas.length > 0 && lineas.every((l) =>
    Number(l.cantidad) > 0 && l.motivo !== '' && (l.motivo !== 'otro' || l.nota.trim() !== ''))

  async function guardar() {
    setGuardando(true); setError(null)
    try {
      const r = await registrarSalida(sb, almacen, lineas.map((l) => ({
        insumo_id: l.insumo.id, cantidad: Number(l.cantidad), motivo: l.motivo as MotivoSalida,
        nota: l.nota.trim() || undefined,
      })), fecha === hoy ? undefined : fecha)
      onHecho(`Se registraron ${r.lineas} salida${r.lineas === 1 ? '' : 's'} por ${mxn(r.valor)} (a costo).`)
    } catch (e) { setError(mensajeDeError(e)) } finally { setGuardando(false) }
  }

  const cambiar = (i: number, p: Partial<LineaUI>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...p } : l)))

  return (
    <Modal titulo="Registrar salida" onCerrar={onCerrar}>
      <p className="text-sm text-sa-green-ink/70">
        Lo que sale del inventario sin venderse: merma, caducado, dañado, error de preparación, consumo interno…
        Resta de la existencia y queda en el kardex con quién lo registró y cuánto costó.
      </p>
      <div className="flex gap-3 flex-wrap">
        <label className="flex flex-col gap-1">
          <span className={cx.label}>Almacén</span>
          <select value={almacen} onChange={(e) => setAlmacen(e.target.value)} className={`${cx.input} w-auto`}>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={cx.label}>Fecha</span>
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={`${cx.input} w-auto`} />
        </label>
      </div>
      <Buscador insumos={insumos} excluir={new Set(lineas.map((l) => l.insumo.id))}
        onElegir={(i) => setLineas([...lineas, { insumo: i, cantidad: '', motivo: '', nota: '' }])} />
      {lineas.length > 0 && (
        <div className="space-y-2">
          {lineas.map((l, i) => (
            <div key={l.insumo.id} className="bg-white rounded-sa p-3 border border-sa-green-ink/5 grid grid-cols-12 gap-2 items-center">
              <div className="col-span-12 md:col-span-4">
                <div className="font-medium text-sm text-sa-green-ink">{l.insumo.nombre}</div>
                <div className="text-[11px] text-sa-green-ink/50 font-mono">hay {num(existencia(l.insumo.id))} {l.insumo.unidad ?? ''}</div>
              </div>
              <input inputMode="decimal" value={l.cantidad} placeholder={`cantidad (${l.insumo.unidad ?? ''})`}
                onChange={(e) => cambiar(i, { cantidad: e.target.value.replace(',', '.') })}
                className={`${cx.input} col-span-4 md:col-span-2`} />
              <select value={l.motivo} onChange={(e) => cambiar(i, { motivo: e.target.value as MotivoSalida })}
                className={`${cx.input} col-span-8 md:col-span-2`}>
                <option value="">— motivo —</option>
                {MOTIVOS.map((m) => <option key={m.id} value={m.id}>{m.texto}</option>)}
              </select>
              <input value={l.nota} onChange={(e) => cambiar(i, { nota: e.target.value })}
                placeholder={l.motivo === 'otro' ? 'nota (obligatoria)' : 'nota (opcional)'}
                className={`${cx.input} col-span-10 md:col-span-3`} />
              <button onClick={() => setLineas(lineas.filter((_, j) => j !== i))} className="col-span-2 md:col-span-1 text-sa-strawberry">✕</button>
            </div>
          ))}
        </div>
      )}
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <div className="flex justify-end">
        <button onClick={() => void guardar()} disabled={!lista || guardando} className={cx.btnPrimary}>
          {guardando ? 'Guardando…' : 'Registrar salida'}
        </button>
      </div>
    </Modal>
  )
}

// ── Reiniciar inventario ────────────────────────────────────────────────

type Alcance = 'todo' | 'categoria' | 'productos'

export function ReiniciarInventario({ stock, almacenes, onCerrar, onHecho }: {
  stock: StockAlmacen[]; almacenes: { id: string; nombre: string }[]
  onCerrar: () => void; onHecho: (msg: string) => void
}) {
  const insumos = useMemo(() => insumosDeStock(stock), [stock])
  const [ubic, setUbic] = useState<string[]>(almacenes.filter((a) => a.nombre === 'Kiosko').map((a) => a.id))
  const [alcance, setAlcance] = useState<Alcance>('todo')
  const [tipo, setTipo] = useState('shake')
  const [elegidos, setElegidos] = useState<Insumo[]>([])
  const [motivo, setMotivo] = useState('Reinicio general de inventario')
  const [pin, setPin] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const afectados = useMemo(() => stock.filter((s) =>
    s.almacen_id && ubic.includes(s.almacen_id) && Number(s.stock_actual ?? 0) !== 0 &&
    (alcance !== 'categoria' || s.insumo_tipo === tipo) &&
    (alcance !== 'productos' || elegidos.some((e) => e.id === s.insumo_id))), [stock, ubic, alcance, tipo, elegidos])

  async function ejecutar() {
    setTrabajando(true); setError(null)
    try {
      const r = await reiniciarInventario(sb, {
        almacenes: ubic,
        tipos: alcance === 'categoria' ? [tipo] : null,
        insumos: alcance === 'productos' ? elegidos.map((e) => e.id) : null,
        motivo: motivo.trim(), pin,
      })
      onHecho(`Inventario reiniciado: ${r.renglones} existencias quedaron en 0. Autorizó ${r.autorizo}.`)
    } catch (e) { setError(mensajeDeError(e)); setPin('') } finally { setTrabajando(false) }
  }

  const listo = ubic.length > 0 && motivo.trim() !== '' && afectados.length > 0 &&
    (alcance !== 'productos' || elegidos.length > 0)

  return (
    <Modal titulo="Reiniciar inventario" onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="text-sm text-sa-green-ink/70">
        Pone en 0 las existencias que elijas, para empezar de nuevo desde un conteo físico. <b>No borra nada</b>:
        compras, ventas, conteos y el kardex se conservan, y cada existencia que cambia deja su renglón
        «Reinicio» con lo que había, quién lo autorizó y por qué.
      </p>
      {/* Costeos manda la DIFERENCIA contra su propio número anterior, no la
          existencia: si aquí queda en 0 y Costeos sigue diciendo 10, capturar
          12 allá suma 2. El reinicio de Costeos pone en 0 las dos cosas. */}
      <p className="text-sm rounded-lg bg-amber-50 border border-amber-300 text-amber-900 px-3 py-2">
        ¿Vas a capturar el inventario en <b>Costeos</b>? Entonces reinicia desde <b>Costeos → Inventario →
        «Reiniciar inventario a 0»</b>. Este botón no toca los números de Costeos, y lo que captures allá
        entraría descontado.
      </p>
      <div>
        <div className={cx.label}>Ubicación</div>
        <div className="flex gap-2 mt-1">
          {almacenes.map((a) => (
            <label key={a.id} className="flex items-center gap-2 bg-white rounded-sa px-3 py-2 border border-sa-green-ink/10">
              <input type="checkbox" checked={ubic.includes(a.id)}
                onChange={(e) => setUbic(e.target.checked ? [...ubic, a.id] : ubic.filter((x) => x !== a.id))} />
              {a.nombre}
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className={cx.label}>Qué reiniciar</div>
        <div className="flex gap-2 mt-1 flex-wrap">
          {([['todo', 'Todo el inventario'], ['categoria', 'Una categoría'], ['productos', 'Productos seleccionados']] as const).map(([id, t]) => (
            <button key={id} onClick={() => setAlcance(id)} className={alcance === id ? cx.btnPrimary : cx.btnSec}>{t}</button>
          ))}
        </div>
        {alcance === 'categoria' && (
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${cx.input} mt-2`}>
            {Object.entries(TIPOS_INSUMO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        {alcance === 'productos' && (
          <div className="mt-2 space-y-2">
            <Buscador insumos={insumos} excluir={new Set(elegidos.map((e) => e.id))} onElegir={(i) => setElegidos([...elegidos, i])} />
            <div className="flex flex-wrap gap-1">
              {elegidos.map((e) => (
                <button key={e.id} onClick={() => setElegidos(elegidos.filter((x) => x.id !== e.id))}
                  className="px-2 py-1 rounded-full bg-white border border-sa-green-ink/15 text-xs">{e.nombre} ✕</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className={cx.label}>Motivo</span>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={cx.input} />
      </label>
      <p className="text-sm font-medium text-sa-green-ink">
        {afectados.length === 0 ? 'Con esta selección no hay existencias distintas de 0.' :
          `Se van a poner en 0: ${afectados.length} existencia${afectados.length === 1 ? '' : 's'}.`}
      </p>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {!confirmando ? (
        <div className="flex justify-end">
          <button onClick={() => setConfirmando(true)} disabled={!listo} className={cx.btnPrimary}>Continuar</button>
        </div>
      ) : (
        <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa p-4 space-y-3">
          <div className="font-semibold text-sa-strawberry">¿Confirmar reinicio de inventario?</div>
          <p className="text-sm text-sa-green-ink">
            Esta acción establecerá en 0 las {afectados.length} existencias seleccionadas. Los movimientos anteriores no se
            eliminarán y quedará registrado quién realizó el reinicio, la fecha y la hora.
          </p>
          <label className="flex flex-col gap-1">
            <span className={cx.label}>PIN de gerencia para autorizar</span>
            <input type="password" inputMode="numeric" autoComplete="off" value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={`${cx.input} w-40 font-mono`} />
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setConfirmando(false); setPin('') }} className={cx.btnSec}>Cancelar</button>
            <button onClick={() => void ejecutar()} disabled={pin.length < 4 || trabajando}
              className="bg-sa-strawberry text-white px-5 py-2.5 rounded-sa font-medium text-sm disabled:opacity-50">
              {trabajando ? 'Reiniciando…' : 'Reiniciar a 0'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

