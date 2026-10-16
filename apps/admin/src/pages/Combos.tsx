import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  combosArmados,
  crearComboArmado,
  guardarFijoCombo,
  quitarFijoCombo,
  agregarOpcionCombo,
  ligarOpcionCombo,
  listarProductos,
  actualizarProducto,
  quitarExtra,
} from '@shake/supabase'
import type { ComboArmado, ComboOpcion } from '@shake/supabase'
import type { Producto } from '@shake/types'
import { mxn, mensajeDeError } from '@shake/utils'
import { Panel, PageHeader, Field, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

/**
 * Admin → Combos (16/10/26): el ÚNICO lugar donde se arma un combo.
 *
 * Un combo es lo que trae siempre (fijos: la chapata) más lo que el cliente
 * elige (grupos: ¿qué muffin?, ¿qué café?). Cada opción está ligada a su
 * producto REAL y al venderse descuenta la receta de ese producto, la que
 * mantiene Costeos. El semáforo lo arma el servidor (`fn_combos_admin`) con
 * la misma regla que usa el descuento: no hay una segunda copia aquí.
 */

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Buscador de productos del menú: son más de mil, un <select> no sirve. */
function ElegirProducto({
  productos,
  placeholder,
  onElegir,
  ocupado,
}: {
  productos: Producto[]
  placeholder: string
  onElegir: (p: Producto) => void
  ocupado?: boolean
}) {
  const [texto, setTexto] = useState('')
  const encontrados = useMemo(() => {
    const q = sinAcentos(texto.trim())
    if (q.length < 2) return []
    const partes = q.split(/\s+/)
    return productos.filter((p) => {
      const n = sinAcentos(p.nombre)
      return partes.every((x) => n.includes(x))
    }).slice(0, 8)
  }, [texto, productos])

  return (
    <div className="relative">
      <input
        className={cx.input}
        placeholder={placeholder}
        value={texto}
        disabled={ocupado}
        onChange={(e) => setTexto(e.target.value)}
      />
      {encontrados.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-sa-green-ink/15 rounded-sa shadow-sa-sm max-h-72 overflow-auto">
          {encontrados.map((p) => (
            <button
              key={p.id}
              type="button"
              className="block w-full text-left px-3 py-2 text-sm hover:bg-sa-cream-soft"
              onClick={() => {
                setTexto('')
                onElegir(p)
              }}
            >
              {p.nombre} <span className={cx.muted}>· {mxn(Number(p.precio))}</span>
            </button>
          ))}
        </div>
      )}
      {texto.trim().length >= 2 && encontrados.length === 0 && (
        <p className={`text-xs mt-1 ${cx.muted}`}>Nada con ese nombre entre los productos activos del menú.</p>
      )}
    </div>
  )
}

function Costo({ n }: { n: number | null }) {
  return <span className="font-mono tabular-nums">{n == null ? '—' : mxn(n)}</span>
}

function margen(c: ComboArmado): string | null {
  if (!c.precio_sin_iva || c.precio_sin_iva <= 0 || c.costo_max <= 0) return null
  const pct = (x: number) => Math.round(((c.precio_sin_iva! - x) / c.precio_sin_iva!) * 100)
  const a = pct(c.costo_max)
  const b = pct(c.costo_min)
  return a === b ? `${a}%` : `${a}–${b}%`
}

function TarjetaCombo({
  combo,
  productos,
  onCambio,
  onError,
  onOk,
}: {
  combo: ComboArmado
  productos: Producto[]
  onCambio: () => Promise<void>
  onError: (m: string | null) => void
  onOk: (m: string) => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState<{ nombre: string; precio: string } | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [ligando, setLigando] = useState<string | null>(null)
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [abierto, setAbierto] = useState(combo.activo)

  async function hacer(fn: () => Promise<unknown>, okMsg?: string) {
    setOcupado(true)
    onError(null)
    try {
      await fn()
      await onCambio()
      if (okMsg) onOk(okMsg)
    } catch (e) {
      const m = mensajeDeError(e)
      onError(
        /fn_combo_fijo_quitar|PGRST202|could not find the function/i.test(m)
          ? 'Quitar algo fijo todavía no está habilitado (falta aprobar un cambio en la base). Mientras, apaga el combo y arma uno nuevo, o avísale a soporte.'
          : m,
      )
    } finally {
      setOcupado(false)
    }
  }

  const listo = combo.avisos.length === 0
  const m = margen(combo)

  return (
    <div className={`${cx.panel} ${combo.activo ? '' : 'opacity-80'}`}>
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {editando ? (
            <div className="flex gap-2 flex-wrap items-end">
              <Field label="Nombre">
                <input className={cx.input} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
              </Field>
              <Field label="Precio">
                <input className={cx.input.replace('w-full', 'w-28')} inputMode="decimal" value={editando.precio} onChange={(e) => setEditando({ ...editando, precio: e.target.value })} />
              </Field>
              <button
                className={cx.btnPrimary}
                disabled={ocupado || editando.nombre.trim().length < 3 || !(Number(editando.precio) > 0)}
                onClick={() =>
                  hacer(async () => {
                    await actualizarProducto(sb, combo.id, { nombre: editando.nombre.trim(), precio: Number(editando.precio) })
                    setEditando(null)
                  }, 'Combo guardado')
                }
              >
                Guardar
              </button>
              <button className={cx.btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="text-left" onClick={() => setAbierto(!abierto)}>
              <h3 className={cx.h3}>
                {abierto ? '▾' : '▸'} {combo.nombre}
              </h3>
              <p className={`text-sm mt-1 ${cx.muted}`}>
                {mxn(combo.precio)} · cuesta <Costo n={combo.costo_min} />
                {combo.costo_max !== combo.costo_min && <> a <Costo n={combo.costo_max} /></>}
                {m && <> · margen {m}</>}
              </p>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {listo ? <Chip tone="si">✓ Listo</Chip> : <Chip tone="neutral">{combo.avisos.length} por revisar</Chip>}
          <Chip tone={combo.activo ? 'si' : 'no'}>{combo.activo ? 'Prendido' : 'Apagado'}</Chip>
          {!editando && (
            <button className={cx.btnSec} onClick={() => setEditando({ nombre: combo.nombre, precio: String(combo.precio) })}>
              Editar
            </button>
          )}
          <button
            className={cx.btnSec}
            disabled={ocupado}
            onClick={() =>
              hacer(
                () => actualizarProducto(sb, combo.id, { activo: !combo.activo }),
                combo.activo ? `«${combo.nombre}» ya no sale en el kiosko` : `«${combo.nombre}» ya sale en el kiosko`,
              )
            }
          >
            {combo.activo ? 'Apagar' : 'Prender'}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="mt-5 space-y-6">
          {/* Semáforo */}
          {listo ? (
            <div className="bg-sa-mint/15 border border-sa-mint/40 rounded-sa px-4 py-3 text-sm text-sa-green-deep">
              Cada parte está ligada a un producto con receta: al venderse, descuenta exactamente lo que se eligió.
            </div>
          ) : (
            <div className="bg-sa-banana/15 border border-sa-banana/50 rounded-sa px-4 py-3 text-sm text-sa-green-ink">
              <p className="font-semibold mb-1">Por revisar</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {combo.avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          )}

          {/* Siempre incluye */}
          <section>
            <p className={`${cx.label} mb-2`}>Siempre incluye</p>
            {combo.fijos.length === 0 ? (
              <p className={`text-sm ${cx.muted} mb-2`}>Nada fijo. Si el combo trae algo siempre (la chapata), agrégalo aquí para que se descuente.</p>
            ) : (
              <div className={cx.tableWrap}>
                <table className={cx.table}>
                  <tbody className={cx.tbody}>
                    {combo.fijos.map((f) => {
                      const val = cantidades[f.producto_id] ?? String(f.cantidad)
                      return (
                        <tr key={f.producto_id}>
                          <td className={cx.td}>
                            {f.nombre}
                            {!f.activo && <span className="ml-2 text-xs text-sa-strawberry">(apagado)</span>}
                            {f.recetas === 0 && <span className="ml-2 text-xs text-sa-strawberry">sin receta</span>}
                            {f.ceros && <span className="block text-xs text-sa-green-ink/60">En 0 en Costeos: {f.ceros}</span>}
                          </td>
                          <td className={cx.td}>
                            <div className="flex items-center gap-2 justify-end">
                              <input
                                className={`${cx.input.replace('w-full', 'w-20')} text-right`}
                                inputMode="decimal"
                                value={val}
                                onChange={(e) => setCantidades({ ...cantidades, [f.producto_id]: e.target.value })}
                              />
                              {Number(val) !== f.cantidad && (
                                <button
                                  className={cx.btnSec}
                                  disabled={ocupado || !(Number(val) > 0)}
                                  onClick={() => hacer(() => guardarFijoCombo(sb, combo.id, f.producto_id, Number(val)), 'Cantidad guardada')}
                                >
                                  Guardar
                                </button>
                              )}
                            </div>
                          </td>
                          <td className={cx.tdNum}><Costo n={f.costo} /></td>
                          <td className={cx.tdNum}>
                            <button
                              className="text-sa-strawberry text-sm hover:underline"
                              disabled={ocupado}
                              onClick={() => {
                                if (window.confirm(`¿Quitar «${f.nombre}» de lo fijo de ${combo.nombre}?`)) {
                                  void hacer(() => quitarFijoCombo(sb, combo.id, f.producto_id), 'Quitado')
                                }
                              }}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-2 max-w-md">
              <ElegirProducto
                productos={productos}
                ocupado={ocupado}
                placeholder="+ Agregar algo fijo (escribe el producto)"
                onElegir={(p) => hacer(() => guardarFijoCombo(sb, combo.id, p.id, 1), `«${p.nombre}» va siempre en el combo`)}
              />
            </div>
          </section>

          {/* El cliente elige */}
          <section>
            <p className={`${cx.label} mb-2`}>El cliente elige</p>
            {combo.grupos.length === 0 && (
              <p className={`text-sm ${cx.muted} mb-2`}>Sin opciones. Crea un grupo abajo («Café», «Muffin»…).</p>
            )}
            <div className="space-y-4">
              {combo.grupos.map((g) => (
                <div key={g.grupo} className="border border-sa-green-ink/10 rounded-sa p-3">
                  <p className="font-semibold text-sa-green-ink mb-2">
                    {g.grupo}{' '}
                    <span className={`text-xs font-normal ${cx.muted}`}>
                      · elige una {g.opciones.length === 1 && '— solo hay una opción'}
                    </span>
                  </p>
                  <ul className="divide-y divide-sa-green-ink/5">
                    {g.opciones.map((o: ComboOpcion) => (
                      <li key={o.extra_id} className="py-2 flex items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-[12rem]">
                          <span className={o.activo ? '' : 'line-through text-sa-green-ink/50'}>{o.nombre}</span>
                          {o.por_defecto && <span className="ml-2 text-xs">★</span>}
                          {!o.activo && <span className="ml-2 text-xs text-sa-strawberry">(apagada)</span>}
                          <span className="block text-xs text-sa-green-ink/60">
                            {o.como_id ? (
                              <>descuenta como <b>{o.como_nombre}</b>{o.como_activo === false && ' (apagado en el menú)'}</>
                            ) : o.recetas > 0 ? (
                              'descuenta su propia receta'
                            ) : (
                              <span className="text-sa-strawberry font-semibold">sin ligar: no descuenta nada</span>
                            )}
                            {o.ceros && <> · en 0 en Costeos: {o.ceros}</>}
                          </span>
                          {ligando === o.extra_id && (
                            <div className="mt-2 max-w-md flex gap-2 items-start">
                              <div className="flex-1">
                                <ElegirProducto
                                  productos={productos}
                                  ocupado={ocupado}
                                  placeholder="¿Qué producto del menú es?"
                                  onElegir={(p) =>
                                    hacer(async () => {
                                      await ligarOpcionCombo(sb, o.extra_id, p.id)
                                      setLigando(null)
                                    }, `«${o.nombre}» descuenta como «${p.nombre}»`)
                                  }
                                />
                              </div>
                              <button className={cx.btnSec} onClick={() => setLigando(null)}>Cancelar</button>
                            </div>
                          )}
                        </div>
                        <span className="text-sm"><Costo n={o.costo} /></span>
                        <div className="flex gap-3 text-sm">
                          {ligando !== o.extra_id && (
                            <button className="text-sa-green hover:underline" onClick={() => setLigando(o.extra_id)}>
                              {o.como_id ? 'Cambiar' : 'Ligar'}
                            </button>
                          )}
                          <button
                            className="text-sa-strawberry hover:underline"
                            disabled={ocupado}
                            onClick={() => {
                              if (window.confirm(`¿Quitar «${o.nombre}» de ${combo.nombre}?`)) {
                                void hacer(() => quitarExtra(sb, combo.id, o.extra_id), 'Opción quitada')
                              }
                            }}
                          >
                            Quitar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 max-w-md">
                    <ElegirProducto
                      productos={productos}
                      ocupado={ocupado}
                      placeholder={`+ Otra opción de ${g.grupo}`}
                      onElegir={(p) => hacer(() => agregarOpcionCombo(sb, combo.id, g.grupo, p.id), `«${p.nombre}» es opción de ${g.grupo}`)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 border border-dashed border-sa-green-ink/20 rounded-sa p-3">
              <p className="text-sm font-semibold text-sa-green-ink mb-2">Nuevo grupo para elegir</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  className={cx.input}
                  placeholder="Nombre del grupo (Café, Té, Muffin…)"
                  value={nuevoGrupo}
                  onChange={(e) => setNuevoGrupo(e.target.value)}
                />
                {nuevoGrupo.trim().length >= 2 ? (
                  <ElegirProducto
                    productos={productos}
                    ocupado={ocupado}
                    placeholder="Primera opción (escribe el producto)"
                    onElegir={(p) =>
                      hacer(async () => {
                        await agregarOpcionCombo(sb, combo.id, nuevoGrupo.trim(), p.id)
                        setNuevoGrupo('')
                      }, `Grupo «${nuevoGrupo.trim()}» creado con «${p.nombre}». Agrégale al menos otra opción.`)
                    }
                  />
                ) : (
                  <p className={`text-xs self-center ${cx.muted}`}>Primero el nombre del grupo.</p>
                )}
              </div>
            </div>
          </section>

          {combo.extras_sueltos > 0 && (
            <p className={`text-xs ${cx.muted}`}>
              Además tiene {combo.extras_sueltos} extra{combo.extras_sueltos === 1 ? '' : 's'} con costo que no son «elige una»
              (leches, suplementos). Se cobran aparte y se administran en Admin → Extras.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function Combos() {
  const [combos, setCombos] = useState<ComboArmado[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState({ nombre: '', precio: '' })
  const [creando, setCreando] = useState(false)
  const [verApagados, setVerApagados] = useState(false)

  async function cargar() {
    try {
      const [cs, ps] = await Promise.all([combosArmados(sb), listarProductos(sb)])
      const idsCombos = new Set(cs.map((c) => c.id))
      setCombos(cs)
      // Solo productos del menú: ni extras ni otros combos.
      setProductos(ps.filter((p) => !p.es_extra && !p.es_combo && !idsCombos.has(p.id)))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  function avisar(m: string) {
    setOk(m)
    setTimeout(() => setOk(null), 4000)
  }

  async function crear() {
    setCreando(true)
    setError(null)
    try {
      await crearComboArmado(sb, nuevo.nombre.trim(), Number(nuevo.precio))
      setNuevo({ nombre: '', precio: '' })
      setVerApagados(true)
      avisar('Combo creado APAGADO. Agrégale lo fijo y sus grupos abajo, y préndelo cuando diga «Listo».')
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCreando(false)
    }
  }

  const prendidos = combos.filter((c) => c.activo)
  const apagados = combos.filter((c) => !c.activo)

  if (cargando) return <Loading>Cargando combos…</Loading>

  return (
    <div>
      <PageHeader
        title="Combos"
        subtitle={
          <>
            Lo que trae <b>siempre</b> y lo que el cliente <b>elige</b>. Cada parte descuenta la receta de su producto
            real (la de Costeos). Los precios y recetas de cada producto se siguen cambiando en Costeos.
          </>
        }
      />
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <div className="space-y-4">
        {prendidos.map((c) => (
          <TarjetaCombo key={c.id} combo={c} productos={productos} onCambio={cargar} onError={setError} onOk={avisar} />
        ))}
        {prendidos.length === 0 && <p className={cx.muted}>No hay combos prendidos.</p>}
      </div>

      {apagados.length > 0 && (
        <div className="mt-8">
          <button className={cx.btnSec} onClick={() => setVerApagados(!verApagados)}>
            {verApagados ? 'Ocultar' : 'Ver'} apagados ({apagados.length})
          </button>
          {verApagados && (
            <div className="space-y-4 mt-4">
              {apagados.map((c) => (
                <TarjetaCombo key={c.id} combo={c} productos={productos} onCambio={cargar} onError={setError} onOk={avisar} />
              ))}
            </div>
          )}
        </div>
      )}

      <Panel title="Nuevo combo" className="mt-8">
        <p className={`text-sm mb-4 ${cx.muted}`}>
          Nace apagado, en la categoría Combos. Después le agregas lo fijo y sus grupos, y lo prendes.
        </p>
        <div className="grid sm:grid-cols-[1fr_10rem_auto] gap-3 items-end">
          <Field label="Nombre">
            <input className={cx.input} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Milo's Bagel-Americano" />
          </Field>
          <Field label="Precio">
            <input className={cx.input} inputMode="decimal" value={nuevo.precio} onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })} placeholder="99" />
          </Field>
          <button
            className={cx.btnPrimary}
            disabled={creando || nuevo.nombre.trim().length < 3 || !(Number(nuevo.precio) > 0)}
            onClick={crear}
          >
            {creando ? 'Creando…' : 'Crear combo'}
          </button>
        </div>
      </Panel>
    </div>
  )
}
