import { useEffect, useState } from 'react'
import {
  getSupabase,
  listarInsumos,
  crearInsumo,
  actualizarInsumo,
  desactivarInsumo,
} from '@shake/supabase'
import type { Insumo, TipoInsumo } from '@shake/types'
import { mxn } from '@shake/utils'
import { Constants } from '@shake/types'

const FORM_VACIO = {
  nombre: '',
  tipo: 'shake' as TipoInsumo,
  unidad: 'g',
  contenido: '',
  costo_compra: '',
  marca: '',
  proveedor: '',
  presentacion: '',
}

export default function InsumosPage() {
  const sb = getSupabase()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    try {
      setInsumos(await listarInsumos(sb))
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

  async function guardar() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        unidad: form.unidad,
        contenido: Number(form.contenido) || 0,
        costo_compra: Number(form.costo_compra) || 0,
        marca: form.marca.trim() || null,
        proveedor: form.proveedor.trim() || null,
        presentacion: form.presentacion.trim() || null,
      }
      if (editandoId) {
        await actualizarInsumo(sb, editandoId, payload)
      } else {
        await crearInsumo(sb, payload)
      }
      setForm(FORM_VACIO)
      setEditandoId(null)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  function editar(i: Insumo) {
    setEditandoId(i.id)
    setForm({
      nombre: i.nombre,
      tipo: i.tipo,
      unidad: i.unidad,
      contenido: String(i.contenido ?? ''),
      costo_compra: String(i.costo_compra ?? ''),
      marca: i.marca ?? '',
      proveedor: i.proveedor ?? '',
      presentacion: i.presentacion ?? '',
    })
  }

  async function desactivar(id: string) {
    if (!confirm('¿Desactivar este insumo? No se borra, solo deja de aparecer.')) return
    await desactivarInsumo(sb, id)
    await cargar()
  }

  if (cargando) return <div className="cargando">Cargando insumos…</div>

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h2>{editandoId ? 'Editar insumo' : 'Nuevo insumo'}</h2>
        <div className="fila-form">
          <div className="campo">
            <label>Nombre</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div className="campo">
            <label>Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoInsumo })}>
              {Constants.public.Enums.tipo_insumo.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Unidad (g, ml, pza, scoop)</label>
            <input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} />
          </div>
          <div className="campo">
            <label>Contenido por compra</label>
            <input type="number" value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })} />
          </div>
          <div className="campo">
            <label>Costo de compra ($)</label>
            <input type="number" value={form.costo_compra} onChange={(e) => setForm({ ...form, costo_compra: e.target.value })} />
          </div>
          <div className="campo">
            <label>Marca</label>
            <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
          </div>
          <div className="campo">
            <label>Proveedor</label>
            <input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
          </div>
          <div className="campo">
            <label>Presentación</label>
            <input value={form.presentacion} onChange={(e) => setForm({ ...form, presentacion: e.target.value })} />
          </div>
          <button className="primario" onClick={() => void guardar()} disabled={guardando || !form.nombre.trim()}>
            {editandoId ? 'Guardar cambios' : 'Agregar'}
          </button>
          {editandoId && (
            <button className="liga" onClick={() => { setEditandoId(null); setForm(FORM_VACIO) }}>
              Cancelar
            </button>
          )}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Marca</th>
            <th className="num">Contenido</th>
            <th>Unidad</th>
            <th className="num">Costo compra</th>
            <th className="num">Costo unitario</th>
            <th>Proveedor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {insumos.map((i) => (
            <tr key={i.id}>
              <td>{i.nombre}</td>
              <td>{i.tipo}</td>
              <td>{i.marca ?? '—'}</td>
              <td className="num">{i.contenido}</td>
              <td>{i.unidad}</td>
              <td className="num">{mxn(i.costo_compra)}</td>
              <td className="num">{i.costo_unitario != null ? `$${i.costo_unitario.toFixed(4)}` : '—'}</td>
              <td>{i.proveedor ?? '—'}</td>
              <td>
                <button className="liga" onClick={() => editar(i)}>Editar</button>
                <button className="liga peligro" onClick={() => void desactivar(i.id)}>Baja</button>
              </td>
            </tr>
          ))}
          {insumos.length === 0 && (
            <tr><td colSpan={9}>Sin insumos aún. Corre el ETL (supabase/seed) o crea el primero arriba.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
