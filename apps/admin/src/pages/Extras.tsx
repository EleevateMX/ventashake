import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductosParaVenta,
  listarExtras,
  extrasDisponibles,
  guardarExtra,
  quitarExtra,
} from '@shake/supabase'
import type { ProductoVenta, ExtraDeProducto, IngredienteExtraible } from '@shake/supabase'
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
      const [ps, exs] = await Promise.all([listarProductosParaVenta(sb), listarExtras(sb)])
      setProductos(ps)
      setExtras(exs)
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
