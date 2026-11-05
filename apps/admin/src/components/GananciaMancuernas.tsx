import { useEffect, useMemo, useState } from 'react'
import {
  reglasMancuernas, guardarGananciaRewards, listarNoAcumulan, ponerSumaMancuernas,
  listarCategorias, listarProductos,
  type NoAcumulan, type RewardsParametros,
} from '@shake/supabase'
import type { Categoria, Producto } from '@shake/types'
import { mancuernasPorCompra, mensajeDeError, mxn, type ReglasMancuernas } from '@shake/utils'
import { sb } from '../lib/sb'
import { cx } from '../ui'

/** $125 en vez de $125.00 cuando el monto es cerrado. */
const cifra = (n: number) => mxn(n).replace(/\.00$/, '')

/**
 * Cómo se ganan las mancuernas, y qué no suma (05/11/26, pedido de gerencia).
 *
 * Antes la tasa y el tope vivían escritos dentro del trigger del cobro y
 * todo producto sumaba. Ahora son una fila de `rewards_ganancia` y una
 * lista `rewards_no_acumulan`, que el trigger lee en cada cobro y el
 * kiosko y la caja leen para prometer lo mismo. Lo que se cambia aquí
 * aplica desde la siguiente venta: lo ya ganado no se toca.
 *
 * Se saca por **categoría** (un clic para todo «Bebidas») o por
 * **producto**, igual que las observaciones: las dos formas existen.
 */
export function GananciaMancuernas({ pm, alGuardar }: { pm: RewardsParametros; alGuardar: () => void }) {
  const [reglas, setReglas] = useState<ReglasMancuernas | null>(null)
  const [fuera, setFuera] = useState<NoAcumulan | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [err, setErr] = useState<string | null>(null)

  async function cargar() {
    try {
      const [r, f, c, p] = await Promise.all([
        reglasMancuernas(sb), listarNoAcumulan(sb), listarCategorias(sb), listarProductos(sb),
      ])
      setReglas(r); setFuera(f); setCategorias(c); setProductos(p); setErr(null)
    } catch (e) {
      setErr(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  return (
    <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5 mb-6">
      <h2 className="font-display text-xl text-sa-green-ink mb-1">Cómo se ganan las mancuernas</h2>
      <p className="text-xs text-sa-green-ink/55 mb-4">
        Lo que cambies aquí aplica desde la siguiente venta, en el kiosko y en la caja. Lo que
        cada cliente ya ganó no se toca.
      </p>
      {err && <p className="text-sm text-sa-strawberry mb-3">{err}</p>}
      {!reglas || !fuera ? (
        !err && <p className="text-sm text-sa-green-ink/50">Cargando…</p>
      ) : (
        <>
          <Ganancia
            reglas={reglas}
            canje={pm.canje.mancuernas_por_peso}
            alGuardar={(r) => { setReglas(r); alGuardar() }}
          />
          <LoQueNoSuma
            fuera={fuera}
            categorias={categorias}
            productos={productos}
            alCambiar={(f) => { setFuera(f); void reglasMancuernas(sb).then(setReglas) }}
          />
        </>
      )}
    </section>
  )
}

function Ganancia({
  reglas, canje, alGuardar,
}: {
  reglas: ReglasMancuernas
  canje: number
  alGuardar: (r: ReglasMancuernas) => void
}) {
  const [pesos, setPesos] = useState(String(reglas.pesos_por_mancuerna))
  const [tope, setTope] = useState(String(reglas.tope_por_orden))
  const [activo, setActivo] = useState(reglas.activo)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const nPesos = Number(pesos) || 0
  const nTope = Math.floor(Number(tope) || 0)
  const valido = nPesos >= 1 && nPesos <= 10000 && nTope >= 1 && nTope <= 100000
  const cambio = nPesos !== Number(reglas.pesos_por_mancuerna) || nTope !== reglas.tope_por_orden || activo !== reglas.activo
  const borrador: ReglasMancuernas = { ...reglas, activo, pesos_por_mancuerna: nPesos, tope_por_orden: nTope }
  const deVuelta = nPesos > 0 && canje > 0 ? 100 / nPesos / canje : 0

  async function guardar() {
    setGuardando(true); setErr(null); setOk(false)
    try {
      const r = await guardarGananciaRewards(sb, { pesos_por_mancuerna: nPesos, tope_por_orden: nTope, activo })
      alGuardar(r)
      setOk(true)
      setTimeout(() => setOk(false), 3000)
    } catch (e) {
      setErr(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-sa border border-sa-green-ink/10 p-4 mb-5">
      <label className="flex items-center gap-3 mb-4 cursor-pointer select-none">
        <input type="checkbox" className="w-5 h-5 accent-sa-green" checked={activo}
               onChange={(e) => setActivo(e.target.checked)} />
        <span className="text-sm font-medium text-sa-green-ink">Las compras suman mancuernas</span>
        {!activo && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-sa-strawberry">
            Apagado: ninguna compra suma
          </span>
        )}
      </label>

      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <div>
          <label className={cx.label}>Pesos de compra por 1 mancuerna</label>
          <input className={cx.input} type="number" inputMode="decimal" min={1} value={pesos}
                 disabled={!activo} onChange={(e) => setPesos(e.target.value)} />
        </div>
        <div>
          <label className={cx.label}>Tope por ticket</label>
          <input className={cx.input} type="number" inputMode="numeric" min={1} value={tope}
                 disabled={!activo} onChange={(e) => setTope(e.target.value)} />
        </div>
      </div>

      {/* La cuenta a la vista antes de guardar: así se lee, no se imagina. */}
      <div className="rounded-sa bg-sa-cream-soft px-4 py-3 mb-3 text-sm text-sa-green-ink/80 leading-relaxed">
        {!activo ? (
          <>Con el programa apagado nadie suma mancuernas al comprar. Los canjes y los cupones siguen funcionando.</>
        ) : !valido ? (
          <>Los pesos van de $1 a $10,000 y el tope de 1 a 100,000.</>
        ) : (
          <>
            Un shake de {cifra(125)} suma <b>{mancuernasPorCompra(125, borrador)}</b> · un ticket de {cifra(300)} suma{' '}
            <b>{mancuernasPorCompra(300, borrador)}</b>. Equivale a <b>{deVuelta.toFixed(1)}%</b> de vuelta
            ({canje} mancuernas = $1). El tope se alcanza con {cifra(nTope * nPesos)}.
          </>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button className={cx.btnPrimary} disabled={!cambio || !valido || guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {cambio && valido && (
          <button className={cx.btnSec} onClick={() => {
            setPesos(String(reglas.pesos_por_mancuerna)); setTope(String(reglas.tope_por_orden)); setActivo(reglas.activo)
          }}>Deshacer</button>
        )}
        {ok && <span className="text-sm text-sa-green">✓ Guardado. Aplica desde la siguiente venta.</span>}
        {err && <span className="text-sm text-sa-strawberry">{err}</span>}
      </div>
    </div>
  )
}

function LoQueNoSuma({
  fuera, categorias, productos, alCambiar,
}: {
  fuera: NoAcumulan
  categorias: Categoria[]
  productos: Producto[]
  alCambiar: (f: NoAcumulan) => void
}) {
  const [catElegida, setCatElegida] = useState('')
  const [buscar, setBuscar] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const catFuera = new Set(fuera.categorias.map((c) => c.categoria_id))
  const prodFuera = new Set(fuera.productos.map((p) => p.producto_id))
  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias])
  const catDisponibles = categorias.filter((c) => !catFuera.has(c.id))

  const q = buscar.trim().toLowerCase()
  const encontrados = q.length < 2 ? [] : productos
    .filter((p) => !prodFuera.has(p.id) && p.nombre.toLowerCase().includes(q))
    .slice(0, 8)

  async function poner(cual: { categoria_id?: string; producto_id?: string }, suma: boolean) {
    const clave = cual.categoria_id ?? cual.producto_id ?? ''
    setTrabajando(clave); setErr(null)
    try {
      alCambiar(await ponerSumaMancuernas(sb, cual, suma))
      if (cual.categoria_id) setCatElegida('')
    } catch (e) {
      setErr(mensajeDeError(e))
    } finally {
      setTrabajando(null)
    }
  }

  const nada = fuera.categorias.length === 0 && fuera.productos.length === 0

  return (
    <div className="rounded-sa border border-sa-green-ink/10 p-4">
      <h3 className="font-display text-lg text-sa-green-ink mb-1">Lo que no suma mancuernas</h3>
      <p className="text-xs text-sa-green-ink/55 mb-4 leading-relaxed">
        Todo suma salvo lo que pongas aquí. Sus extras tampoco suman (si un shake no suma, su leche
        de almendras tampoco). Las recargas de saldo nunca suman.
      </p>

      {nada && (
        <p className="rounded-sa bg-sa-mint/15 px-4 py-3 mb-4 text-sm text-sa-green-ink">
          Hoy <b>todos los productos suman</b>.
        </p>
      )}

      {/* Por categoría */}
      <p className={`${cx.label} mb-2`}>Categorías completas</p>
      {fuera.categorias.length > 0 && (
        <ul className="divide-y divide-sa-green-ink/10 mb-3 rounded-sa border border-sa-green-ink/10">
          {fuera.categorias.map((c) => (
            <li key={c.categoria_id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 min-w-0 text-sm text-sa-green-ink">
                <b>{c.nombre}</b>
                <span className="text-sa-green-ink/50"> · {c.productos} producto{c.productos === 1 ? '' : 's'}</span>
              </span>
              <button className="text-xs font-medium text-sa-green underline underline-offset-4 disabled:opacity-50"
                      disabled={trabajando === c.categoria_id}
                      onClick={() => void poner({ categoria_id: c.categoria_id }, true)}>
                Que vuelva a sumar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 mb-5 flex-wrap">
        <select className={cx.input} style={{ maxWidth: 320 }} value={catElegida}
                onChange={(e) => setCatElegida(e.target.value)}>
          <option value="">Elige una categoría…</option>
          {catDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button className={cx.btnSec} disabled={!catElegida || trabajando !== null}
                onClick={() => void poner({ categoria_id: catElegida }, false)}>
          No suma
        </button>
      </div>

      {/* Por producto */}
      <p className={`${cx.label} mb-2`}>Productos sueltos</p>
      {fuera.productos.length > 0 && (
        <ul className="divide-y divide-sa-green-ink/10 mb-3 rounded-sa border border-sa-green-ink/10">
          {fuera.productos.map((p) => (
            <li key={p.producto_id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 min-w-0 text-sm text-sa-green-ink truncate">
                <b>{p.nombre}</b>
                <span className="text-sa-green-ink/50"> · {cifra(p.precio)}{p.categoria ? ` · ${p.categoria}` : ''}</span>
              </span>
              <button className="text-xs font-medium text-sa-green underline underline-offset-4 shrink-0 disabled:opacity-50"
                      disabled={trabajando === p.producto_id}
                      onClick={() => void poner({ producto_id: p.producto_id }, true)}>
                Que vuelva a sumar
              </button>
            </li>
          ))}
        </ul>
      )}
      <input className={cx.input} style={{ maxWidth: 640 }} placeholder="Busca un producto por nombre…"
             value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      {encontrados.length > 0 && (
        <ul className="mt-2 divide-y divide-sa-green-ink/10 rounded-sa border border-sa-green-ink/10" style={{ maxWidth: 640 }}>
          {encontrados.map((p) => {
            const porCategoria = p.categoria_id != null && catFuera.has(p.categoria_id)
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 min-w-0 text-sm text-sa-green-ink truncate">
                  {p.nombre}
                  <span className="text-sa-green-ink/50"> · {cifra(p.precio)}{p.categoria_id ? ` · ${nombreCat.get(p.categoria_id) ?? ''}` : ''}</span>
                </span>
                {porCategoria ? (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/45 shrink-0">Ya no suma por su categoría</span>
                ) : (
                  <button className={`${cx.btnSec} !py-1.5 !px-3 shrink-0`} disabled={trabajando !== null}
                          onClick={() => void poner({ producto_id: p.id }, false)}>
                    No suma
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {err && <p className="text-sm text-sa-strawberry mt-3">{err}</p>}
    </div>
  )
}
