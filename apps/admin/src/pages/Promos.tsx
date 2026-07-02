import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { listarPromociones, crearPromocion, actualizarPromocion } from '@shake/supabase'
import type { Promocion, TipoPromocion } from '@shake/types'
import { mxn, pct } from '@shake/utils'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const FORM_VACIO = {
  nombre: '',
  tipo: 'descuento_pct' as TipoPromocion,
  valor: '',
  categoria_gratis: '',
  vence_en: '',
  sabor_favorito: '',
  dias_semana: [] as number[],
  hora_inicio: '',
  hora_fin: '',
  min_compras_30d: '',
}

export default function Promos() {
  const [promos, setPromos] = useState<Promocion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    try {
      setPromos(await listarPromociones(sb))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { void cargar() }, [])

  function toggleDia(d: number) {
    setForm((f) => ({
      ...f,
      dias_semana: f.dias_semana.includes(d) ? f.dias_semana.filter((x) => x !== d) : [...f.dias_semana, d],
    }))
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    setError(null)
    try {
      await crearPromocion(sb, {
        nombre: form.nombre.trim(),
        descripcion: null,
        tipo: form.tipo,
        valor: form.tipo === 'descuento_pct' ? (Number(form.valor) || 0) / 100 : Number(form.valor) || 0,
        categoria_gratis: form.tipo === 'producto_gratis' ? form.categoria_gratis.trim() || null : null,
        activa: true,
        vence_en: form.vence_en || null,
        sabor_favorito: form.sabor_favorito.trim() || null,
        dias_semana: form.dias_semana.length ? form.dias_semana : null,
        hora_inicio: form.hora_inicio || null,
        hora_fin: form.hora_fin || null,
        min_compras_30d: form.min_compras_30d ? Number(form.min_compras_30d) : null,
      })
      setForm(FORM_VACIO)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActiva(p: Promocion) {
    await actualizarPromocion(sb, p.id, { activa: !p.activa })
    await cargar()
  }

  if (cargando) return <div className="cargando">Cargando promociones…</div>

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h2>Nueva promoción personalizada</h2>
        <div className="fila-form">
          <div className="campo">
            <label>Nombre</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div className="campo">
            <label>Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPromocion })}>
              <option value="descuento_pct">% descuento</option>
              <option value="descuento_monto">$ descuento</option>
              <option value="producto_gratis">Producto gratis</option>
            </select>
          </div>
          {form.tipo !== 'producto_gratis' && (
            <div className="campo">
              <label>{form.tipo === 'descuento_pct' ? 'Porcentaje (ej. 10)' : 'Monto ($)'}</label>
              <input type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
          )}
          {form.tipo === 'producto_gratis' && (
            <div className="campo">
              <label>Categoría gratis (ej. Shakes)</label>
              <input value={form.categoria_gratis} onChange={(e) => setForm({ ...form, categoria_gratis: e.target.value })} />
            </div>
          )}
          <div className="campo">
            <label>Vence (opcional)</label>
            <input type="date" value={form.vence_en} onChange={(e) => setForm({ ...form, vence_en: e.target.value })} />
          </div>
        </div>

        <h3 style={{ marginBottom: 4 }}>Segmentación (todo opcional)</h3>
        <div className="fila-form">
          <div className="campo">
            <label>Sabor favorito</label>
            <input value={form.sabor_favorito} onChange={(e) => setForm({ ...form, sabor_favorito: e.target.value })} />
          </div>
          <div className="campo">
            <label>Frecuencia mín. (compras/30 días)</label>
            <input type="number" value={form.min_compras_30d} onChange={(e) => setForm({ ...form, min_compras_30d: e.target.value })} />
          </div>
          <div className="campo">
            <label>Hora inicio</label>
            <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
          </div>
          <div className="campo">
            <label>Hora fin</label>
            <input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
          </div>
          <div className="campo">
            <label>Días</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {DIAS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={form.dias_semana.includes(i) ? 'tab activo' : 'tab'}
                  style={{ margin: 0, padding: '4px 8px' }}
                  onClick={() => toggleDia(i)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p style={{ marginTop: 12 }}>
          <button className="primario" disabled={guardando || !form.nombre.trim()} onClick={() => void guardar()}>
            Crear promoción
          </button>
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Promoción</th>
            <th>Beneficio</th>
            <th>Segmento</th>
            <th>Vence</th>
            <th>Activa</th>
          </tr>
        </thead>
        <tbody>
          {promos.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td>
              <td>
                {p.tipo === 'descuento_pct' && `−${pct(p.valor)}`}
                {p.tipo === 'descuento_monto' && `−${mxn(p.valor)}`}
                {p.tipo === 'producto_gratis' && `Gratis: ${p.categoria_gratis ?? 'ítem'}`}
              </td>
              <td className="muted" style={{ fontSize: '0.8rem' }}>
                {[
                  p.sabor_favorito && `sabor ${p.sabor_favorito}`,
                  p.dias_semana && p.dias_semana.map((d) => DIAS[d]).join('/'),
                  p.hora_inicio && `${p.hora_inicio}-${p.hora_fin ?? ''}`,
                  p.min_compras_30d && `≥${p.min_compras_30d} compras/30d`,
                ].filter(Boolean).join(' · ') || 'todos'}
              </td>
              <td>{p.vence_en ?? '—'}</td>
              <td>
                <button className="liga" onClick={() => void toggleActiva(p)}>
                  {p.activa ? '✅ sí' : '⬜ no'}
                </button>
              </td>
            </tr>
          ))}
          {promos.length === 0 && <tr><td colSpan={5}>Sin promociones aún.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
