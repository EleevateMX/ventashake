import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductos,
  listarCategorias,
  listarCocinas,
  crearProducto,
  actualizarProducto,
  desactivarProducto,
  crearCategoria,
} from '@shake/supabase'
import type { Producto, Categoria, Cocina } from '@shake/types'
import { mxn } from '@shake/utils'
import { Panel, PageHeader, Field, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

interface FormProducto {
  nombre: string
  precio: string
  categoria_id: string
  iva_incluido: boolean
}

const FORM_VACIO: FormProducto = { nombre: '', precio: '', categoria_id: '', iva_incluido: true }

export default function Menu() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cocinas, setCocinas] = useState<Cocina[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // form producto (crear / editar)
  const [form, setForm] = useState<FormProducto>(FORM_VACIO)
  const [editId, setEditId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // form categoría
  const [catNombre, setCatNombre] = useState('')
  const [catCocinaId, setCatCocinaId] = useState('')
  const [guardandoCat, setGuardandoCat] = useState(false)

  const catPorId = useMemo(() => {
    const m = new Map<string, Categoria>()
    categorias.forEach((c) => m.set(c.id, c))
    return m
  }, [categorias])

  async function cargar() {
    try {
      const [ps, cs, ks] = await Promise.all([
        listarProductos(sb),
        listarCategorias(sb),
        listarCocinas(sb),
      ])
      setProductos(ps)
      setCategorias(cs)
      setCocinas(ks)
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

  function editar(p: Producto) {
    setEditId(p.id)
    setForm({
      nombre: p.nombre,
      precio: String(p.precio),
      categoria_id: p.categoria_id ?? '',
      iva_incluido: p.iva_incluido,
    })
    setOk(null)
  }

  function cancelarEdicion() {
    setEditId(null)
    setForm(FORM_VACIO)
  }

  async function guardarProducto() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    setError(null)
    try {
      const datos = {
        nombre: form.nombre.trim(),
        precio: Number(form.precio) || 0,
        categoria_id: form.categoria_id || null,
        iva_incluido: form.iva_incluido,
      }
      if (editId) {
        await actualizarProducto(sb, editId, datos)
        setOk('Producto actualizado.')
      } else {
        await crearProducto(sb, datos)
        setOk('Producto creado.')
      }
      cancelarEdicion()
      await cargar()
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  async function handleDesactivar(p: Producto) {
    if (!confirm(`¿Desactivar "${p.nombre}"?`)) return
    setError(null)
    try {
      await desactivarProducto(sb, p.id)
      if (editId === p.id) cancelarEdicion()
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function guardarCategoria() {
    if (!catNombre.trim() || !catCocinaId) return
    setGuardandoCat(true)
    setError(null)
    try {
      await crearCategoria(sb, { nombre: catNombre.trim(), cocina_id: catCocinaId })
      setCatNombre('')
      setCatCocinaId('')
      setOk('Categoría creada.')
      await cargar()
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardandoCat(false)
    }
  }

  if (cargando) return <Loading>Cargando menú…</Loading>

  return (
    <div>
      <PageHeader title="Menú" subtitle="Productos y categorías" />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <div className="space-y-6">
        {/* Form producto */}
        <Panel title={editId ? 'Editar producto' : 'Nuevo producto'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Nombre">
              <input className={cx.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Precio ($)">
              <input className={cx.input} type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
            </Field>
            <Field label="Categoría">
              <select className={cx.input} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">— Sin categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className={cx.label}>IVA</span>
              <label className="flex items-center gap-2 text-sm text-sa-green-ink h-[42px]">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-sa-green"
                  checked={form.iva_incluido}
                  onChange={(e) => setForm({ ...form, iva_incluido: e.target.checked })}
                />
                IVA incluido en el precio
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className={cx.btnPrimary} disabled={guardando || !form.nombre.trim()} onClick={() => void guardarProducto()}>
              {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear producto'}
            </button>
            {editId && <button className={cx.btnSec} onClick={cancelarEdicion}>Cancelar</button>}
          </div>
        </Panel>

        {/* Tabla productos */}
        <div>
          <h3 className={`${cx.h3} mb-4`}>Productos</h3>
          {productos.length === 0 ? (
            <Panel><p className={cx.muted}>No hay productos activos.</p></Panel>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Nombre</th>
                    <th className={cx.th}>Categoría</th>
                    <th className={cx.thNum}>Precio</th>
                    <th className={cx.th}>Activo</th>
                    <th className={cx.thNum}>Acciones</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {productos.map((p) => (
                    <tr key={p.id} className={cx.tr}>
                      <td className={`${cx.td} font-medium`}>{p.nombre}</td>
                      <td className={cx.td}>{p.categoria_id ? catPorId.get(p.categoria_id)?.nombre ?? '—' : '—'}</td>
                      <td className={cx.tdNum}>{mxn(p.precio)}</td>
                      <td className={cx.td}><Chip tone={p.activo ? 'si' : 'no'}>{p.activo ? 'Sí' : 'No'}</Chip></td>
                      <td className={cx.tdNum}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => editar(p)}
                            className="px-3 py-1.5 text-xs font-medium border border-sa-green-ink/15 rounded-lg hover:bg-sa-cream-soft text-sa-green-ink"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => void handleDesactivar(p)}
                            className="px-3 py-1.5 text-xs font-medium border border-sa-strawberry/30 rounded-lg hover:bg-sa-strawberry/10 text-sa-strawberry"
                          >
                            Desactivar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Form categoría */}
        <Panel title="Nueva categoría">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre">
              <input className={cx.input} value={catNombre} onChange={(e) => setCatNombre(e.target.value)} />
            </Field>
            <Field label="Cocina / estación">
              <select className={cx.input} value={catCocinaId} onChange={(e) => setCatCocinaId(e.target.value)}>
                <option value="">— Elige cocina —</option>
                {cocinas.map((k) => (
                  <option key={k.id} value={k.id}>{k.nombre}</option>
                ))}
              </select>
            </Field>
          </div>
          <button
            className={`${cx.btnPrimary} mt-4`}
            disabled={guardandoCat || !catNombre.trim() || !catCocinaId}
            onClick={() => void guardarCategoria()}
          >
            {guardandoCat ? 'Guardando…' : 'Crear categoría'}
          </button>
        </Panel>
      </div>
    </div>
  )
}
