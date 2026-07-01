import { useEffect, useState } from 'react'
import { getSupabase, obtenerParametros, actualizarParametros } from '@shake/supabase'

export default function ParametrosPage() {
  const sb = getSupabase()
  const [form, setForm] = useState({ iva: '', food_cost_meta: '', merma_default: '', mano_obra: '' })
  const [cargando, setCargando] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerParametros(sb)
      .then((p) =>
        setForm({
          iva: String(p.iva),
          food_cost_meta: String(p.food_cost_meta),
          merma_default: String(p.merma_default),
          mano_obra: String(p.mano_obra),
        }),
      )
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false))
  }, [])

  async function guardar() {
    setMsg(null)
    setError(null)
    try {
      await actualizarParametros(sb, {
        iva: Number(form.iva),
        food_cost_meta: Number(form.food_cost_meta),
        merma_default: Number(form.merma_default),
        mano_obra: Number(form.mano_obra),
      })
      setMsg('Parámetros guardados. El costeo de todos los productos se recalcula automáticamente.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (cargando) return <div className="cargando">Cargando parámetros…</div>

  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <h2>Parámetros globales de costeo</h2>
      {error && <div className="error-msg">{error}</div>}
      {msg && <p className="ok">{msg}</p>}
      <div className="fila-form">
        <div className="campo">
          <label>IVA (fracción, ej. 0.16)</label>
          <input type="number" step="0.01" value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })} />
        </div>
        <div className="campo">
          <label>Food cost objetivo (ej. 0.30)</label>
          <input type="number" step="0.01" value={form.food_cost_meta} onChange={(e) => setForm({ ...form, food_cost_meta: e.target.value })} />
        </div>
        <div className="campo">
          <label>Merma default (ej. 0.02)</label>
          <input type="number" step="0.01" value={form.merma_default} onChange={(e) => setForm({ ...form, merma_default: e.target.value })} />
        </div>
        <div className="campo">
          <label>Mano de obra default ($)</label>
          <input type="number" step="0.5" value={form.mano_obra} onChange={(e) => setForm({ ...form, mano_obra: e.target.value })} />
        </div>
      </div>
      <p style={{ marginTop: 16 }}>
        <button className="primario" onClick={() => void guardar()}>Guardar</button>
      </p>
    </div>
  )
}
