import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { aliadosAdmin, borrarAliado, guardarAliado, subirLogoAliado, type Aliado, type AliadoInput } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { PageHeader, Panel, ErrorMsg, OkMsg, Field, Chip, cx } from '../ui'

/**
 * Aliados: las marcas con las que colaboramos y que la app de Rewards
 * enseña en «Tu tarjeta». Logo, qué son, cómo contactarlos y la promo que
 * tienen con Shakeaholic. Lo que se guarda aquí es lo que ve el cliente,
 * tal cual: sin logo sale el nombre; sin promo no sale la tarjeta amarilla.
 */

const VACIO: AliadoInput = {
  id: null, nombre: '', descripcion: '', logo_url: null, promo_titulo: '', promo_texto: '',
  web: '', whatsapp: '', instagram: '', telefono: '', direccion: '', orden: 100, activo: true,
}

export default function Aliados() {
  const [lista, setLista] = useState<Aliado[] | null>(null)
  const [form, setForm] = useState<AliadoInput | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function cargar() {
    try { setLista(await aliadosAdmin(sb)); setError(null) } catch (e) { setError(mensajeDeError(e)) }
  }
  useEffect(() => { void cargar() }, [])

  function editar(a?: Aliado) {
    setOk(null); setError(null)
    setForm(a ? { ...a } : { ...VACIO })
  }

  async function logo(archivo?: File) {
    if (!archivo || !form) return
    setSubiendo(true); setError(null)
    try {
      const url = await subirLogoAliado(sb, archivo)
      setForm({ ...form, logo_url: url })
    } catch (e) { setError(mensajeDeError(e)) } finally { setSubiendo(false) }
  }

  async function guardar() {
    if (!form) return
    setGuardando(true); setError(null)
    try {
      await guardarAliado(sb, form)
      setOk(`${form.nombre} guardado.`)
      setForm(null)
      await cargar()
    } catch (e) { setError(mensajeDeError(e)) } finally { setGuardando(false) }
  }

  async function borrar(a: Aliado) {
    if (!confirm(`¿Borrar a ${a.nombre}? Si solo quieres esconderlo, apágalo.`)) return
    try { await borrarAliado(sb, a.id); await cargar() } catch (e) { setError(mensajeDeError(e)) }
  }

  const campo = (k: keyof AliadoInput, label: string, placeholder = '', area = false) => (
    <Field label={label}>
      {area ? (
        <textarea className={cx.input} rows={3} value={(form?.[k] as string | null) ?? ''} placeholder={placeholder}
          onChange={(e) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f))} />
      ) : (
        <input className={cx.input} value={(form?.[k] as string | null) ?? ''} placeholder={placeholder}
          onChange={(e) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f))} />
      )}
    </Field>
  )

  return (
    <div>
      <PageHeader
        title="Aliados"
        subtitle="Las marcas con las que colaboramos, como las ve el cliente en la app"
        action={<button type="button" className={cx.btnPrimary} onClick={() => editar()}>Nuevo aliado</button>}
      />
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {form && (
        <Panel title={form.id ? `Editar: ${form.nombre || '…'}` : 'Nuevo aliado'} className="mb-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              {campo('nombre', 'Nombre', 'ProDetail Auto Spa')}
              {campo('descripcion', 'Qué son', 'Lavado y detallado de autos a domicilio en Mérida.', true)}
              <Field label="Logo">
                <div className="flex items-center gap-3">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="" className="w-16 h-16 rounded-sa object-contain bg-sa-cream-soft border border-sa-green-ink/10" />
                  ) : (
                    <div className="w-16 h-16 rounded-sa bg-sa-cream-soft border border-dashed border-sa-green-ink/15 flex items-center justify-center text-sa-green-ink/30">🏷️</div>
                  )}
                  <label className={cx.btnSec + ' cursor-pointer'}>
                    {subiendo ? 'Subiendo…' : form.logo_url ? 'Cambiar logo' : 'Subir logo'}
                    <input type="file" accept="image/*" className="hidden" disabled={subiendo}
                      onChange={(e) => { void logo(e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                  {form.logo_url && (
                    <button type="button" className="text-sm text-sa-strawberry hover:underline" onClick={() => setForm({ ...form, logo_url: null })}>Quitar</button>
                  )}
                </div>
                <p className={`text-xs mt-1 ${cx.muted}`}>PNG o SVG con fondo transparente se ve mejor sobre la tarjeta verde.</p>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Orden"><input className={cx.input} type="number" value={form.orden ?? 100}
                  onChange={(e) => setForm({ ...form, orden: Number(e.target.value) || 100 })} /></Field>
                <Field label="Visible en la app">
                  <label className="flex items-center gap-2 py-2.5"><input type="checkbox" checked={form.activo ?? true}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Sí</label>
                </Field>
              </div>
            </div>
            <div className="space-y-4">
              {campo('promo_titulo', 'Promo con Shakeaholic · título', '10% en tu primer lavado')}
              {campo('promo_texto', 'Promo · cómo se usa', 'Enseña tu tarjeta de Shakeaholic Rewards al pagar.', true)}
              {campo('whatsapp', 'WhatsApp (10 dígitos)', '9991234567')}
              {campo('instagram', 'Instagram (usuario)', 'prodetailmx')}
              {campo('web', 'Sitio web', 'https://prodetail.mx')}
              {campo('telefono', 'Teléfono', '9991234567')}
              {campo('direccion', 'Dirección', 'Calle 21 x 10, The Harbor')}
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button type="button" className={cx.btnPrimary} disabled={guardando || !form.nombre.trim()} onClick={() => void guardar()}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className={cx.btnSec} onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </Panel>
      )}

      {lista === null ? (
        <p className={cx.muted}>Cargando…</p>
      ) : lista.length === 0 ? (
        <Panel><p className={cx.muted}>Todavía no hay aliados. Agrega el primero con «Nuevo aliado».</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead className={cx.thead}>
              <tr><th className={cx.th}>Aliado</th><th className={cx.th}>Promo</th><th className={cx.th}>Contacto</th><th className={cx.thNum}>Orden</th><th className={cx.th}>Estado</th><th className={cx.thAcciones}></th></tr>
            </thead>
            <tbody className={cx.tbody}>
              {lista.map((a) => (
                <tr key={a.id} className={cx.tr}>
                  <td className={cx.td}>
                    <div className="flex items-center gap-3">
                      {a.logo_url ? <img src={a.logo_url} alt="" className="w-10 h-10 rounded-sa object-contain bg-sa-cream-soft" /> : <div className="w-10 h-10 rounded-sa bg-sa-cream-soft" />}
                      <div><strong>{a.nombre}</strong>{a.descripcion && <div className={`text-xs ${cx.muted}`}>{a.descripcion}</div>}</div>
                    </div>
                  </td>
                  <td className={cx.td}>{a.promo_titulo ?? <span className={cx.muted}>—</span>}</td>
                  <td className={cx.td}><span className={cx.muted}>{[a.whatsapp && 'WhatsApp', a.instagram && 'Instagram', a.web && 'Web', a.telefono && 'Tel.'].filter(Boolean).join(' · ') || '—'}</span></td>
                  <td className={cx.tdNum}>{a.orden}</td>
                  <td className={cx.td}><Chip tone={a.activo ? 'si' : 'no'}>{a.activo ? 'Visible' : 'Apagado'}</Chip></td>
                  <td className={cx.tdAcciones}>
                    <button type="button" className="text-sm text-sa-green hover:underline mr-3" onClick={() => editar(a)}>Editar</button>
                    <button type="button" className="text-sm text-sa-strawberry hover:underline" onClick={() => void borrar(a)}>Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
