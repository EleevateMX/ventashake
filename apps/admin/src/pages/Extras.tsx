import { Fragment, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductosParaVenta,
  listarExtras,
  extrasDisponibles,
  guardarExtra,
  quitarExtra,
  listarExtrasBebidaAdmin,
  guardarExtraBebida,
  activarExtraBebida,
  productosDeExtra,
  vincularExtraBebida,
} from '@shake/supabase'
import type {
  ProductoVenta, ExtraDeProducto, IngredienteExtraible, ExtraBebidaAdmin, ProductoDeExtra,
} from '@shake/supabase'
import { mxn } from '@shake/utils'
import { Panel, PageHeader, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

/**
 * Extras por producto: de los ingredientes de la receta de cada alimento,
 * cuáles se pueden vender como extra y a qué precio. El extra se guarda
 * como un producto propio con receta 1:1 al insumo, así que al venderlo
 * cuesta y descuenta inventario como cualquier otro producto.
 */
export default function Extras() {
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [extras, setExtras] = useState<ExtraDeProducto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // --- extras de shakes (leches, proteínas, agua) ---
  const [bebida, setBebida] = useState<ExtraBebidaAdmin[]>([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('0')
  const [nuevoAplicar, setNuevoAplicar] = useState<'shakes' | 'clasico'>('shakes')
  const [guardandoBebida, setGuardandoBebida] = useState(false)
  // Panel "dónde se ofrece": un extra abierto a la vez, con su checklist.
  const [extraAbierto, setExtraAbierto] = useState<string | null>(null)
  const [productosDelExtra, setProductosDelExtra] = useState<ProductoDeExtra[]>([])
  const [cargandoVinculos, setCargandoVinculos] = useState(false)
  const [filtroVinculos, setFiltroVinculos] = useState('')
  const [cambiandoVinculo, setCambiandoVinculo] = useState<string | null>(null)

  const [abierto, setAbierto] = useState<string | null>(null)
  const [ingredientes, setIngredientes] = useState<IngredienteExtraible[]>([])
  const [cargandoIngs, setCargandoIngs] = useState(false)
  const [precios, setPrecios] = useState<Record<string, string>>({})
  const [guardandoInsumo, setGuardandoInsumo] = useState<string | null>(null)

  // Los extras se ofrecen sobre lo que se prepara en cocina (alimentos).
  const alimentos = useMemo(
    () => productos.filter((p) => p.categorias?.cocinas?.slug === 'alimentos'),
    [productos],
  )

  const extrasPorProducto = useMemo(() => {
    const m = new Map<string, ExtraDeProducto[]>()
    for (const e of extras) {
      const lista = m.get(e.producto_id) ?? []
      lista.push(e)
      m.set(e.producto_id, lista)
    }
    return m
  }, [extras])

  async function cargar() {
    try {
      const [ps, exs, bs] = await Promise.all([
        listarProductosParaVenta(sb), listarExtras(sb), listarExtrasBebidaAdmin(sb),
      ])
      setProductos(ps)
      setExtras(exs)
      setBebida(bs)
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

  async function guardarBebida() {
    if (!nuevoNombre.trim()) return
    setGuardandoBebida(true)
    setError(null)
    try {
      await guardarExtraBebida(sb, {
        nombre: nuevoNombre.trim(),
        precio: Number(nuevoPrecio) || 0,
        aplicar: nuevoAplicar,
      })
      setOk(`"${nuevoNombre.trim()}" ya se ofrece en el kiosko.`)
      setNuevoNombre('')
      setNuevoPrecio('0')
      await cargar()
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardandoBebida(false)
    }
  }

  async function abrirVinculos(extraId: string) {
    if (extraAbierto === extraId) {
      setExtraAbierto(null)
      return
    }
    setExtraAbierto(extraId)
    setFiltroVinculos('')
    setProductosDelExtra([])
    setCargandoVinculos(true)
    try {
      setProductosDelExtra(await productosDeExtra(sb, extraId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargandoVinculos(false)
    }
  }

  async function toggleVinculo(extraId: string, prod: ProductoDeExtra) {
    setCambiandoVinculo(prod.producto_id)
    setError(null)
    try {
      await vincularExtraBebida(sb, extraId, prod.producto_id, !prod.ofrecido)
      // Se actualiza en memoria para que la palomita responda al instante;
      // el conteo de la tabla de arriba se refresca completo.
      setProductosDelExtra((prev) =>
        prev.map((p) =>
          p.producto_id === prod.producto_id ? { ...p, ofrecido: !p.ofrecido } : p,
        ),
      )
      setBebida(await listarExtrasBebidaAdmin(sb))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCambiandoVinculo(null)
    }
  }

  async function toggleBebida(e: ExtraBebidaAdmin) {
    setError(null)
    try {
      await activarExtraBebida(sb, e.id, !e.activo)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function abrir(productoId: string) {
    if (abierto === productoId) {
      setAbierto(null)
      return
    }
    setAbierto(productoId)
    setIngredientes([])
    setPrecios({})
    setCargandoIngs(true)
    try {
      setIngredientes(await extrasDisponibles(sb, productoId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargandoIngs(false)
    }
  }

  async function ofrecer(productoId: string, ing: IngredienteExtraible) {
    const precio = Number(precios[ing.insumo_id])
    if (!(precio > 0)) {
      setError(`Ponle precio de venta a "${ing.nombre}" antes de ofrecerlo como extra.`)
      return
    }
    setGuardandoInsumo(ing.insumo_id)
    setError(null)
    try {
      await guardarExtra(sb, {
        productoId,
        insumoId: ing.insumo_id,
        nombre: `Extra ${ing.nombre}`,
        precio,
      })
      setOk(`"${ing.nombre}" ya se ofrece como extra.`)
      await cargar()
      setIngredientes(await extrasDisponibles(sb, productoId))
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardandoInsumo(null)
    }
  }

  async function quitar(productoId: string, extraId: string) {
    setError(null)
    try {
      await quitarExtra(sb, productoId, extraId)
      await cargar()
      if (abierto) setIngredientes(await extrasDisponibles(sb, abierto))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (cargando) return <Loading>Cargando extras…</Loading>

  return (
    <div>
      <PageHeader
        title="Extras"
        subtitle="De los ingredientes de cada alimento, cuáles se pueden vender como extra en caja (guacamole, aderezo…). El costo sale de la receta real; tú defines el precio de venta."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {/* ------------------------------------------------------------------ */}
      {/* Extras de shakes: leches, proteínas, agua. Aquí la sucursal da de  */}
      {/* alta una leche o un sabor nuevo y aparece en el kiosko solo; y     */}
      {/* cuando un sabor se acaba, lo apaga al momento sin borrar nada.     */}
      {/* ------------------------------------------------------------------ */}
      <Panel className="mb-6">
        <h3 className={cx.h3}>Leches, proteínas y agua de los shakes</h3>
        <p className={`${cx.muted} text-sm mt-1 mb-4`}>
          El nombre decide dónde sale en el kiosko: <b>Leche …</b> entra al grupo de
          leches, <b>Proteína MARCA - Sabor</b> al de proteínas (agrupadas por marca),
          y <b>Agua</b> a la base. Todo lo demás sale como adicional.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="lg:col-span-2">
            <span className={cx.label}>Nombre</span>
            <input
              className={cx.input}
              placeholder="Proteína GHOST - Chocolate  ·  Leche light"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
          </div>
          <div>
            <span className={cx.label}>Precio extra ($)</span>
            <input
              className={cx.input}
              type="number"
              min="0"
              value={nuevoPrecio}
              onChange={(e) => setNuevoPrecio(e.target.value)}
            />
          </div>
          <div>
            <span className={cx.label}>Ofrecer en</span>
            <select
              className={cx.input}
              value={nuevoAplicar}
              onChange={(e) => setNuevoAplicar(e.target.value as 'shakes' | 'clasico')}
            >
              <option value="shakes">Todos los shakes</option>
              <option value="clasico">Solo El Clásico</option>
            </select>
          </div>
        </div>
        <button
          className={`${cx.btnPrimary} mt-4`}
          disabled={guardandoBebida || !nuevoNombre.trim()}
          onClick={() => void guardarBebida()}
        >
          {guardandoBebida ? 'Guardando…' : 'Agregar al kiosko'}
        </button>

        {bebida.length > 0 && (
          <div className={`${cx.tableWrap} mt-5`}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Extra</th>
                  <th className={cx.thNum}>Precio</th>
                  <th className={cx.th}>En cuántos productos</th>
                  <th className={cx.th}>Disponible</th>
                  <th className={cx.thNum}></th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {bebida.map((e) => (
                  <Fragment key={e.id}>
                    <tr className={cx.tr} style={{ opacity: e.activo ? 1 : 0.55 }}>
                      <td className={`${cx.td} font-medium`}>{e.nombre}</td>
                      <td className={cx.tdNum}>{e.precio > 0 ? mxn(e.precio) : 'Gratis'}</td>
                      <td className={cx.td}>
                        {e.ligado_a > 0 ? (
                          e.ligado_a
                        ) : (
                          <span className="text-sa-strawberry text-xs">
                            en ninguno — ábrelo con &quot;Dónde se ofrece&quot;
                          </span>
                        )}
                      </td>
                      <td className={cx.td}>
                        <Chip tone={e.activo ? 'si' : 'no'}>{e.activo ? 'Sí' : 'Apagado'}</Chip>
                      </td>
                      <td className={cx.tdNum}>
                        <div className="inline-flex gap-2">
                          <button className={cx.btnSec} onClick={() => void abrirVinculos(e.id)}>
                            {extraAbierto === e.id ? 'Cerrar' : 'Dónde se ofrece'}
                          </button>
                          <button className={cx.btnSec} onClick={() => void toggleBebida(e)}>
                            {e.activo ? 'Apagar' : 'Prender'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {extraAbierto === e.id && (
                      <tr>
                        <td colSpan={5} className="px-5 py-4 bg-sa-cream-soft/60">
                          {cargandoVinculos ? (
                            <p className={cx.muted}>Cargando bebidas…</p>
                          ) : (
                            <>
                              <div className="flex items-center gap-3 mb-3 flex-wrap">
                                <input
                                  className={cx.input}
                                  style={{ maxWidth: 280 }}
                                  placeholder="Filtrar… (hydration, jamaica, latte)"
                                  value={filtroVinculos}
                                  onChange={(ev) => setFiltroVinculos(ev.target.value)}
                                />
                                <span className={`${cx.muted} text-xs`}>
                                  Palomita = se ofrece en ese producto. Una bebida nueva de
                                  costeo aparece aquí sola.
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {productosDelExtra
                                  .filter((pr) =>
                                    pr.nombre.toLowerCase().includes(filtroVinculos.toLowerCase()),
                                  )
                                  .map((pr) => (
                                    <label
                                      key={pr.producto_id}
                                      className={`flex items-center gap-2.5 px-3 py-2 rounded-sa bg-white border text-sm cursor-pointer ${
                                        pr.ofrecido
                                          ? 'border-sa-green/40'
                                          : 'border-sa-green-ink/10'
                                      } ${cambiandoVinculo === pr.producto_id ? 'opacity-50' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-sa-green"
                                        checked={pr.ofrecido}
                                        disabled={cambiandoVinculo === pr.producto_id}
                                        onChange={() => void toggleVinculo(e.id, pr)}
                                      />
                                      <span className="truncate text-sa-green-ink">{pr.nombre}</span>
                                    </label>
                                  ))}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <h3 className={`${cx.h3} mb-3`}>Extras de alimentos (de la receta)</h3>

      {alimentos.length === 0 ? (
        <Panel><p className={cx.muted}>No hay alimentos activos en el catálogo.</p></Panel>
      ) : (
        <div className="space-y-4">
          {alimentos.map((p) => {
            const misExtras = extrasPorProducto.get(p.id) ?? []
            const estaAbierto = abierto === p.id
            return (
              <Panel key={p.id}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className={cx.h3}>{p.nombre}</h3>
                    <p className={`${cx.muted} text-sm mt-1`}>
                      {misExtras.length === 0
                        ? 'Sin extras configurados'
                        : `${misExtras.length} extra${misExtras.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <button className={cx.btnSec} onClick={() => void abrir(p.id)}>
                    {estaAbierto ? 'Cerrar' : 'Configurar extras'}
                  </button>
                </div>

                {misExtras.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {misExtras.map((e) => (
                      <span
                        key={e.extra_id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sa-mint/20 text-sa-green-ink text-sm"
                      >
                        {e.nombre} · {mxn(e.precio)}
                        <button
                          onClick={() => void quitar(p.id, e.extra_id)}
                          className="text-sa-strawberry hover:brightness-110"
                          title="Dejar de ofrecerlo en este producto"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {estaAbierto && (
                  <div className="mt-4 border-t border-sa-green-ink/10 pt-4">
                    {cargandoIngs ? (
                      <p className={cx.muted}>Cargando ingredientes…</p>
                    ) : ingredientes.length === 0 ? (
                      <p className={cx.muted}>
                        Este producto no tiene ingredientes en su receta todavía.
                      </p>
                    ) : (
                      <div className={cx.tableWrap}>
                        <table className={cx.table}>
                          <thead>
                            <tr className={cx.thead}>
                              <th className={cx.th}>Ingrediente</th>
                              <th className={cx.thNum}>Lleva en receta</th>
                              <th className={cx.thNum}>Costo</th>
                              <th className={cx.thNum}>Precio de venta</th>
                              <th className={cx.thNum}></th>
                            </tr>
                          </thead>
                          <tbody className={cx.tbody}>
                            {ingredientes.map((ing) => (
                              <tr key={ing.insumo_id} className={cx.tr}>
                                <td className={`${cx.td} font-medium`}>{ing.nombre}</td>
                                <td className={cx.tdNum}>
                                  {ing.cantidad_receta} {ing.unidad}
                                </td>
                                <td className={cx.tdNum}>{mxn(ing.costo_en_receta)}</td>
                                <td className={cx.tdNum}>
                                  {ing.ya_es_extra ? (
                                    <Chip tone="si">Ya se ofrece</Chip>
                                  ) : (
                                    <input
                                      className={cx.input}
                                      style={{ width: 110, textAlign: 'right' }}
                                      type="number"
                                      min="0"
                                      placeholder="0.00"
                                      value={precios[ing.insumo_id] ?? ''}
                                      onChange={(e) =>
                                        setPrecios((prev) => ({
                                          ...prev,
                                          [ing.insumo_id]: e.target.value,
                                        }))
                                      }
                                    />
                                  )}
                                </td>
                                <td className={cx.tdNum}>
                                  {!ing.ya_es_extra && (
                                    <button
                                      className={cx.btnSec}
                                      disabled={guardandoInsumo === ing.insumo_id}
                                      onClick={() => void ofrecer(p.id, ing)}
                                    >
                                      {guardandoInsumo === ing.insumo_id ? 'Guardando…' : 'Ofrecer'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
