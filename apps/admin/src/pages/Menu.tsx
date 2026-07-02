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

  if (cargando) return <div className="cargando">Cargando menú…</div>

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}
      {ok && <div className="ok-msg">{ok}</div>}

      <div className="panel">
        <h2>{editId ? 'Editar producto' : 'Nuevo producto'}</h2>
        <div className="form-grid">
          <div className="campo">
            <label>Nombre</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div className="campo">
            <label>Precio ($)</label>
            <input
              type="number"
              value={form.precio}
              onChange={(e) => setForm({ ...form, precio: e.target.value })}
            />
          </div>
          <div className="campo">
            <label>Categoría</label>
            <select
              value={form.categoria_id}
              onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
            >
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>IVA</label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.iva_incluido}
                onChange={(e) => setForm({ ...form, iva_incluido: e.target.checked })}
              />
              IVA incluido en el precio
            </label>
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 4 }}>
          <button className="primario" disabled={guardando || !form.nombre.trim()} onClick={() => void guardarProducto()}>
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear producto'}
          </button>
          {editId && <button className="sec" onClick={cancelarEdicion}>Cancelar</button>}
        </div>
      </div>

      <div className="panel">
        <h2>Productos</h2>
        {productos.length === 0 && <p className="muted">No hay productos activos.</p>}
        {productos.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th className="num">Precio</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.categoria_id ? catPorId.get(p.categoria_id)?.nombre ?? '—' : '—'}</td>
                  <td className="num">{mxn(p.precio)}</td>
                  <td>
                    <span className={p.activo ? 'chip si' : 'chip no'}>{p.activo ? 'Sí' : 'No'}</span>
                  </td>
                  <td>
                    <button className="link" onClick={() => editar(p)}>Editar</button>
                    <button className="link danger" onClick={() => void handleDesactivar(p)}>Desactivar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Nueva categoría</h2>
        <div className="form-grid">
          <div className="campo">
            <label>Nombre</label>
            <input value={catNombre} onChange={(e) => setCatNombre(e.target.value)} />
          </div>
          <div className="campo">
            <label>Cocina / estación</label>
            <select value={catCocinaId} onChange={(e) => setCatCocinaId(e.target.value)}>
              <option value="">— Elige cocina —</option>
              {cocinas.map((k) => (
                <option key={k.id} value={k.id}>{k.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          className="primario"
          disabled={guardandoCat || !catNombre.trim() || !catCocinaId}
          onClick={() => void guardarCategoria()}
        >
          {guardandoCat ? 'Guardando…' : 'Crear categoría'}
        </button>
      </div>
    </div>
  )
}
