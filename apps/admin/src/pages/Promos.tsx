import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { listarPromociones, crearPromocion, actualizarPromocion, listarProductos } from '@shake/supabase'
import type { Producto, Promocion, TipoPromocion } from '@shake/types'
import { mxn, pct, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, Field, cx } from '../ui'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/**
 * Hay DOS cosas distintas en esta pantalla y antes se llamaban igual.
 *
 * - Una promo **que cobra**: baja el total en la caja y en el kiosko. Tiene
 *   que decir a qué productos alcanza; sin eso no hay forma de cobrarla.
 * - Una **sugerencia**: no toca ningún precio, solo aparece en Rewards para
 *   ese cliente. Es lo único que existía, y por eso lo que se capturaba
 *   aquí nunca se veía en el sistema.
 *
 * Se separan a propósito, con su nombre, para que nadie vuelva a capturar
 * un 2x25 esperando que cobre.
 */
type Modo = 'cobra' | 'sugerencia'

const FORM_VACIO = {
  nombre: '',
  tipo: 'n_x_precio' as TipoPromocion,
  valor: '',
  cantidad: '2',
  productos: [] as string[],
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
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>('cobra')
  const [form, setForm] = useState(FORM_VACIO)
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    try {
      const [p, prods] = await Promise.all([listarPromociones(sb), listarProductos(sb)])
      setPromos(p)
      setProductos(prods.filter((x) => !x.es_extra && (x.precio ?? 0) > 0))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { void cargar() }, [])

  const nombreDe = useMemo(() => {
    const m = new Map(productos.map((p) => [p.id, p.nombre]))
    return (id: string) => m.get(id) ?? '(producto que ya no existe)'
  }, [productos])

  /**
   * El buscador solo aparece cuando hay algo escrito. El catálogo tiene
   * cientos de renglones: una lista completa sería scroll infinito, y una
   * lista corta arbitraria escondería justo el que se busca.
   */
  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length < 2) return []
    return productos
      .filter((p) => p.nombre.toLowerCase().includes(q) && !form.productos.includes(p.id))
      .slice(0, 12)
  }, [busqueda, productos, form.productos])

  function toggleDia(d: number) {
    setForm((f) => ({
      ...f,
      dias_semana: f.dias_semana.includes(d) ? f.dias_semana.filter((x) => x !== d) : [...f.dias_semana, d],
    }))
  }

  /** Lo que impide guardar algo que no haría nada. El servidor lo repite. */
  const problema = (() => {
    if (!form.nombre.trim()) return 'Ponle nombre: es lo que va a ver el cliente en el carrito.'
    if (modo === 'sugerencia') return null
    if (form.productos.length === 0) return 'Elige a qué productos alcanza, o la promo no puede cobrar nada.'
    if (form.tipo === 'n_x_precio') {
      if ((Number(form.cantidad) || 0) < 2) return 'Un paquete es de 2 piezas para arriba.'
      if (form.valor === '' || Number(form.valor) < 0) return 'Falta el precio del paquete.'
    }
    if (form.tipo === 'descuento_pct' && !(Number(form.valor) > 0)) return 'Falta el porcentaje.'
    return null
  })()

  async function guardar() {
    if (problema) return
    setGuardando(true)
    setError(null)
    try {
      const automatica = modo === 'cobra'
      await crearPromocion(sb, {
        nombre: form.nombre.trim(),
        descripcion: null,
        tipo: form.tipo,
        valor: form.tipo === 'descuento_pct' ? (Number(form.valor) || 0) / 100 : Number(form.valor) || 0,
        cantidad: automatica && form.tipo === 'n_x_precio' ? Number(form.cantidad) : null,
        productos: automatica ? form.productos : null,
        automatica,
        categoria_gratis: form.tipo === 'producto_gratis' ? form.categoria_gratis.trim() || null : null,
        activa: true,
        vence_en: form.vence_en || null,
        // La segmentación por cliente solo tiene sentido en las sugerencias:
        // una promo del mostrador no sabe quién está enfrente.
        sabor_favorito: automatica ? null : form.sabor_favorito.trim() || null,
        min_compras_30d: automatica ? null : form.min_compras_30d ? Number(form.min_compras_30d) : null,
        dias_semana: form.dias_semana.length ? form.dias_semana : null,
        hora_inicio: form.hora_inicio || null,
        hora_fin: form.hora_fin || null,
      })
      setForm(FORM_VACIO)
      setBusqueda('')
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActiva(p: Promocion) {
    await actualizarPromocion(sb, p.id, { activa: !p.activa })
    await cargar()
  }

  if (cargando) return <Loading>Cargando promociones…</Loading>

  return (
    <div>
      <PageHeader title="Promociones" subtitle="Las que cobran solas y las que solo se sugieren" />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="space-y-6">
        <Panel title="Nueva promoción">
          <div className="flex gap-2 mb-6">
            {([
              { v: 'cobra' as Modo, t: 'Que cobre sola', s: 'Baja el total en caja y en el kiosko' },
              { v: 'sugerencia' as Modo, t: 'Solo sugerirla', s: 'Aparece en Rewards; no cambia precios' },
            ]).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => { setModo(o.v); setForm({ ...form, tipo: o.v === 'cobra' ? 'n_x_precio' : 'descuento_pct' }) }}
                className={`flex-1 text-left px-4 py-3 rounded-sa border-2 transition-colors ${
                  modo === o.v
                    ? 'border-sa-green bg-sa-mint/20'
                    : 'border-sa-green-ink/15 bg-white hover:border-sa-green-ink/30'
                }`}
              >
                <span className="block font-medium text-sa-green-ink">{o.t}</span>
                <span className="block text-xs text-sa-green-ink/60 mt-0.5">{o.s}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Nombre (lo ve el cliente)">
              <input className={cx.input} placeholder="Cookies 2 x $25" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <select className={cx.input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPromocion })}>
                {modo === 'cobra' ? (
                  <>
                    <option value="n_x_precio">N piezas por un precio</option>
                    <option value="descuento_pct">% de descuento</option>
                  </>
                ) : (
                  <>
                    <option value="descuento_pct">% descuento</option>
                    <option value="descuento_monto">$ descuento</option>
                    <option value="producto_gratis">Producto gratis</option>
                  </>
                )}
              </select>
            </Field>
            {form.tipo === 'n_x_precio' && (
              <Field label="¿Cuántas piezas?">
                <input className={cx.input} type="number" min={2} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
              </Field>
            )}
            {form.tipo !== 'producto_gratis' && (
              <Field label={
                form.tipo === 'n_x_precio' ? 'Precio del paquete ($)'
                : form.tipo === 'descuento_pct' ? 'Porcentaje (ej. 10)'
                : 'Monto ($)'
              }>
                <input className={cx.input} type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </Field>
            )}
            {form.tipo === 'producto_gratis' && (
              <Field label="Categoría gratis (ej. Shakes)">
                <input className={cx.input} value={form.categoria_gratis} onChange={(e) => setForm({ ...form, categoria_gratis: e.target.value })} />
              </Field>
            )}
            <Field label="Vence (opcional)">
              <input className={cx.input} type="date" value={form.vence_en} onChange={(e) => setForm({ ...form, vence_en: e.target.value })} />
            </Field>
          </div>

          {modo === 'cobra' && (
            <>
              <h4 className="text-sm font-mono uppercase tracking-wide text-sa-green-ink/60 mt-6 mb-3">
                ¿A qué productos alcanza?
              </h4>
              {form.productos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {form.productos.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setForm({ ...form, productos: form.productos.filter((x) => x !== id) })}
                      className="px-3 py-1.5 rounded-full text-sm bg-sa-green-ink text-sa-cream"
                    >
                      {nombreDe(id)} <span className="opacity-60 ml-1">×</span>
                    </button>
                  ))}
                </div>
              )}
              <input
                className={cx.input}
                placeholder="Busca un producto por nombre…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {resultados.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {resultados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setForm({ ...form, productos: [...form.productos, p.id] }); setBusqueda('') }}
                      className="px-3 py-1.5 rounded-full text-sm bg-white border border-sa-green-ink/15 hover:border-sa-green text-sa-green-ink"
                    >
                      {p.nombre} <span className="font-mono text-xs text-sa-green-ink/50">{mxn(p.precio)}</span>
                    </button>
                  ))}
                </div>
              )}
              {form.tipo === 'n_x_precio' && form.productos.length > 1 && (
                <p className="text-xs text-sa-green-ink/60 mt-3">
                  Con varios productos, el paquete se puede armar mezclándolos —
                  dos cookies de sabores distintos cuentan como un 2x25.
                </p>
              )}
            </>
          )}

          <h4 className="text-sm font-mono uppercase tracking-wide text-sa-green-ink/60 mt-6 mb-3">
            {modo === 'cobra' ? 'Cuándo aplica (opcional)' : 'Segmentación (todo opcional)'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {modo === 'sugerencia' && (
              <>
                <Field label="Sabor favorito">
                  <input className={cx.input} value={form.sabor_favorito} onChange={(e) => setForm({ ...form, sabor_favorito: e.target.value })} />
                </Field>
                <Field label="Frecuencia mín. (compras/30 días)">
                  <input className={cx.input} type="number" value={form.min_compras_30d} onChange={(e) => setForm({ ...form, min_compras_30d: e.target.value })} />
                </Field>
              </>
            )}
            <Field label="Hora inicio">
              <input className={cx.input} type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            </Field>
            <Field label="Hora fin">
              <input className={cx.input} type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4">
            <span className={cx.label}>Días</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {DIAS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDia(i)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    form.dias_semana.includes(i)
                      ? 'bg-sa-green-ink text-sa-cream'
                      : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:border-sa-green-ink/30'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* El motivo por el que no se puede guardar, dicho antes de
              intentarlo. Un botón apagado sin explicación es una pared. */}
          {problema && <p className="text-sm text-sa-strawberry mt-5">{problema}</p>}

          <button className={`${cx.btnPrimary} mt-4`} disabled={guardando || !!problema} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : modo === 'cobra' ? 'Crear y empezar a cobrarla' : 'Crear sugerencia'}
          </button>
        </Panel>

        <div>
          <h3 className={`${cx.h3} mb-4`}>Promociones</h3>
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Promoción</th>
                  <th className={cx.th}>¿Cobra?</th>
                  <th className={cx.th}>Beneficio</th>
                  <th className={cx.th}>Alcance</th>
                  <th className={cx.th}>Vence</th>
                  <th className={cx.th}>Activa</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {promos.map((p) => (
                  <tr key={p.id} className={cx.tr}>
                    <td className={`${cx.td} font-medium`}>{p.nombre}</td>
                    <td className={cx.td}>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        p.automatica ? 'bg-sa-mint/30 text-sa-green-ink' : 'bg-sa-cream-warm text-sa-green-ink/60'
                      }`}>
                        {p.automatica ? 'Cobra sola' : 'Solo se sugiere'}
                      </span>
                    </td>
                    <td className={`${cx.td} font-mono`}>
                      {p.tipo === 'n_x_precio' && `${p.cantidad ?? '?'} x ${mxn(p.valor)}`}
                      {p.tipo === 'descuento_pct' && `−${pct(p.valor)}`}
                      {p.tipo === 'descuento_monto' && `−${mxn(p.valor)}`}
                      {p.tipo === 'producto_gratis' && `Gratis: ${p.categoria_gratis ?? 'ítem'}`}
                    </td>
                    <td className={`${cx.td} text-xs text-sa-green-ink/60`}>
                      {p.automatica
                        ? (p.productos ?? []).map(nombreDe).join(', ') || '—'
                        : [
                            p.sabor_favorito && `sabor ${p.sabor_favorito}`,
                            p.min_compras_30d && `≥${p.min_compras_30d} compras/30d`,
                          ].filter(Boolean).join(' · ') || 'todos'}
                      {(p.dias_semana || p.hora_inicio) && (
                        <span className="block mt-0.5">
                          {[
                            p.dias_semana && p.dias_semana.map((d) => DIAS[d]).join('/'),
                            p.hora_inicio && `${p.hora_inicio}-${p.hora_fin ?? ''}`,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className={cx.td}>{p.vence_en ?? '—'}</td>
                    <td className={cx.td}>
                      <button
                        onClick={() => void toggleActiva(p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                          p.activa ? 'bg-sa-mint/30 text-sa-green-ink hover:bg-sa-mint/40' : 'bg-sa-cream-warm text-sa-green-ink/60 hover:bg-sa-cream-warm/70'
                        }`}
                      >
                        {p.activa ? '● Sí' : '○ No'}
                      </button>
                    </td>
                  </tr>
                ))}
                {promos.length === 0 && (
                  <tr><td className={cx.td} colSpan={6}><span className={cx.muted}>Sin promociones aún.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
