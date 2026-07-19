import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarCombos,
  listarProductos,
  listarCategorias,
  crearCombo,
  actualizarProducto,
  agregarComponenteCombo,
  quitarComponenteCombo,
} from '@shake/supabase'
import type { ComboVista, Producto, Categoria } from '@shake/types'
import { mxn } from '@shake/utils'
import { Panel, PageHeader, Field, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

interface ComponenteCombo {
  producto_id: string
  nombre: string
  cantidad: number
  activo: boolean
}

interface FormCombo {
  nombre: string
  precio: string
  categoria_id: string
}

const FORM_VACIO: FormCombo = { nombre: '', precio: '', categoria_id: '' }

function componentesDe(combo: ComboVista): ComponenteCombo[] {
  const raw = combo.componentes
  if (!Array.isArray(raw)) return []
  return raw as unknown as ComponenteCombo[]
}

export default function Combos() {
  const [combos, setCombos] = useState<ComboVista[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [form, setForm] = useState<FormCombo>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const [comboEditando, setComboEditando] = useState<string | null>(null)
  const [nuevoComponenteId, setNuevoComponenteId] = useState('')
  const [nuevaCantidad, setNuevaCantidad] = useState('1')
  const [guardandoComponente, setGuardandoComponente] = useState(false)

  const catPorId = useMemo(() => {
    const m = new Map<string, Categoria>()
    categorias.forEach((c) => m.set(c.id, c))
    return m
  }, [categorias])

  // Productos que se pueden agregar como componente: activos y que no sean
  // ellos mismos un combo (v1 no soporta combos anidados — el servidor lo
  // rechazaría de todas formas, pero no tiene caso ofrecerlos en la lista).
  const productosParaComponente = useMemo(
    () => productos.filter((p) => !p.es_combo),
    [productos],
  )

  async function cargar() {
    try {
      const [cs, ps, cats] = await Promise.all([listarCombos(sb), listarProductos(sb), listarCategorias(sb)])
      setCombos(cs)
      setProductos(ps)
      setCategorias(cats)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function guardarCombo() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    setError(null)
    try {
      await crearCombo(sb, {
        nombre: form.nombre.trim(),
        precio: Number(form.precio) || 0,
        categoria_id: form.categoria_id || null,
      })
      setForm(FORM_VACIO)
      setOk('Combo creado. Ahora agrégale sus componentes abajo.')
      await cargar()
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(combo: ComboVista) {
    if (!combo.id) return
    setError(null)
    try {
      await actualizarProducto(sb, combo.id, { activo: !combo.activo })
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function agregarComponente(comboId: string) {
    if (!nuevoComponenteId || !(Number(nuevaCantidad) > 0)) return
    setGuardandoComponente(true)
    setError(null)
    try {
      await agregarComponenteCombo(sb, comboId, nuevoComponenteId, Number(nuevaCantidad))
      setNuevoComponenteId('')
      setNuevaCantidad('1')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardandoComponente(false)
    }
  }

  async function quitarComponente(comboId: string, productoId: string) {
    setError(null)
    try {
      await quitarComponenteCombo(sb, comboId, productoId)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (cargando) return <Loading>Cargando combos…</Loading>

  const combo = combos.find((c) => c.id === comboEditando) ?? null

  return (
    <div>
      <PageHeader
        title="Combos"
        subtitle="Productos que agrupan otros productos ya existentes con un precio propio — se venden y descuentan de inventario exactamente igual que cualquier producto."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <div className="space-y-6">
        <Panel title="Nuevo combo">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Nombre">
              <input className={cx.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Precio ($)">
              <input className={cx.input} type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
            </Field>
            <Field label="Categoría">
              <select className={cx.input} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">— Sin categoría (se fija con el primer componente) —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className={`${cx.muted} text-xs mt-2`}>
            Todos los componentes de un combo deben ser de la misma estación (cocina) — no se puede mezclar, por
            ejemplo, un shake con un alimento en el mismo combo.
          </p>
          <div className="flex gap-2 mt-4">
            <button className={cx.btnPrimary} disabled={guardando || !form.nombre.trim()} onClick={() => void guardarCombo()}>
              {guardando ? 'Guardando…' : 'Crear combo'}
            </button>
          </div>
        </Panel>

        <div>
          <h3 className={`${cx.h3} mb-4`}>Combos existentes</h3>
          {combos.length === 0 ? (
            <Panel><p className={cx.muted}>No hay combos todavía.</p></Panel>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Nombre</th>
                    <th className={cx.th}>Categoría</th>
                    <th className={cx.thNum}>Precio</th>
                    <th className={cx.thNum}>Costo</th>
                    <th className={cx.thNum}>Margen</th>
                    <th className={cx.th}>Componentes</th>
                    <th className={cx.th}>Activo</th>
                    <th className={cx.thNum}>Acciones</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {combos.map((c) => {
                    const comps = componentesDe(c)
                    return (
                      <tr key={c.id} className={cx.tr}>
                        <td className={`${cx.td} font-medium`}>{c.nombre}</td>
                        <td className={cx.td}>{c.categoria_id ? catPorId.get(c.categoria_id)?.nombre ?? '—' : '—'}</td>
                        <td className={cx.tdNum}>{mxn(c.precio ?? 0)}</td>
                        <td className={cx.tdNum}>{c.costo_total != null ? mxn(c.costo_total) : '—'}</td>
                        <td className={cx.tdNum}>
                          {c.margen != null ? mxn(c.margen) : '—'}
                          {c.margen_pct != null && <span className={`${cx.muted} ml-1`}>({(c.margen_pct * 100).toFixed(0)}%)</span>}
                        </td>
                        <td className={cx.td}>
                          {comps.length === 0 ? (
                            <span className={cx.muted}>Sin componentes</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {comps.map((comp) => (
                                <span key={comp.producto_id} className={comp.activo ? '' : 'text-sa-strawberry'}>
                                  {comp.cantidad}× {comp.nombre}{!comp.activo && ' (inactivo)'}
                                </span>
                              ))}
                            </div>
                          )}
                          {c.todos_componentes_activos === false && (
                            <div className="mt-1"><Chip tone="no">⚠ tiene un componente inactivo</Chip></div>
                          )}
                        </td>
                        <td className={cx.td}><Chip tone={c.activo ? 'si' : 'no'}>{c.activo ? 'Sí' : 'No'}</Chip></td>
                        <td className={cx.tdNum}>
                          <div className="flex items-center justify-end gap-2">
                            <button className={cx.btnSec} onClick={() => setComboEditando(comboEditando === c.id ? null : c.id)}>
                              {comboEditando === c.id ? 'Cerrar' : 'Componentes'}
                            </button>
                            <button className={cx.btnSec} onClick={() => void toggleActivo(c)}>
                              {c.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {combo && combo.id && (
          <Panel title={`Componentes de "${combo.nombre}"`}>
            <div className="space-y-2 mb-4">
              {componentesDe(combo).length === 0 && <p className={cx.muted}>Este combo todavía no tiene componentes.</p>}
              {componentesDe(combo).map((comp) => (
                <div key={comp.producto_id} className="flex items-center justify-between gap-3 py-1.5 border-b border-sa-green-ink/5 last:border-0">
                  <span>{comp.cantidad}× {comp.nombre}{!comp.activo && <span className="text-sa-strawberry"> (inactivo)</span>}</span>
                  <button className={cx.btnSec} onClick={() => void quitarComponente(combo.id as string, comp.producto_id)}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Agregar producto">
                <select className={cx.input} value={nuevoComponenteId} onChange={(e) => setNuevoComponenteId(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {productosParaComponente.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad">
                <input className={cx.input} style={{ width: 90 }} type="number" min="1" value={nuevaCantidad} onChange={(e) => setNuevaCantidad(e.target.value)} />
              </Field>
              <button
                className={cx.btnPrimary}
                disabled={guardandoComponente || !nuevoComponenteId}
                onClick={() => void agregarComponente(combo.id as string)}
              >
                {guardandoComponente ? 'Agregando…' : '+ Agregar'}
              </button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
