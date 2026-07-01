import { useEffect, useMemo, useState } from 'react'
import {
  getSupabase,
  listarCosteo,
  listarProductos,
  listarCategorias,
  listarInsumos,
  crearProducto,
  actualizarProducto,
  obtenerReceta,
  guardarReceta,
  obtenerParametros,
} from '@shake/supabase'
import type { CosteoProducto, Producto, Categoria, Insumo, Parametros } from '@shake/types'
import { mxn, pct } from '@shake/utils'

interface LineaReceta {
  insumo_id: string
  cantidad: string
  nota: string
}

export default function ProductosPage() {
  const sb = getSupabase()
  const [costeo, setCosteo] = useState<CosteoProducto[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [params, setParams] = useState<Parametros | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // edición de producto + receta
  const [editando, setEditando] = useState<Producto | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [formProd, setFormProd] = useState({ nombre: '', categoria_id: '', precio: '', iva_incluido: true })
  const [lineas, setLineas] = useState<LineaReceta[]>([])
  const [guardando, setGuardando] = useState(false)

  const costeoPorId = useMemo(() => new Map(costeo.map((c) => [c.id, c])), [costeo])
  const insumosPorId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos])

  async function cargar() {
    try {
      const [c, p, cat, ins, par] = await Promise.all([
        listarCosteo(sb),
        listarProductos(sb),
        listarCategorias(sb),
        listarInsumos(sb),
        obtenerParametros(sb),
      ])
      setCosteo(c)
      setProductos(p)
      setCategorias(cat)
      setInsumos(ins)
      setParams(par)
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

  async function abrirEditor(p: Producto | null) {
    setNuevo(p === null)
    setEditando(p)
    if (p) {
      setFormProd({
        nombre: p.nombre,
        categoria_id: p.categoria_id ?? '',
        precio: String(p.precio),
        iva_incluido: p.iva_incluido,
      })
      const receta = await obtenerReceta(sb, p.id)
      setLineas(
        receta.map((r) => ({ insumo_id: r.insumo_id, cantidad: String(r.cantidad), nota: r.nota ?? '' })),
      )
    } else {
      setFormProd({ nombre: '', categoria_id: categorias[0]?.id ?? '', precio: '', iva_incluido: true })
      setLineas([])
    }
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const payload = {
        nombre: formProd.nombre.trim(),
        categoria_id: formProd.categoria_id || null,
        precio: Number(formProd.precio) || 0,
        iva_incluido: formProd.iva_incluido,
      }
      let productoId: string
      if (nuevo) {
        const creado = await crearProducto(sb, payload)
        productoId = creado.id
      } else {
        await actualizarProducto(sb, editando!.id, payload)
        productoId = editando!.id
      }
      await guardarReceta(
        sb,
        productoId,
        lineas
          .filter((l) => l.insumo_id)
          .map((l) => ({ insumo_id: l.insumo_id, cantidad: Number(l.cantidad) || 0, nota: l.nota || null })),
      )
      setEditando(null)
      setNuevo(false)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  // costo estimado en vivo de la receta que se está editando
  const costoRecetaVivo = lineas.reduce((acc, l) => {
    const ins = insumosPorId.get(l.insumo_id)
    return acc + (ins?.costo_unitario ?? 0) * (Number(l.cantidad) || 0)
  }, 0)

  if (cargando) return <div className="cargando">Cargando productos…</div>

  const editorAbierto = nuevo || editando !== null

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      {!editorAbierto && (
        <>
          <p>
            <button className="primario" onClick={() => void abrirEditor(null)}>+ Nuevo producto</button>
            {params && (
              <span style={{ marginLeft: 16, color: '#667085', fontSize: '0.85rem' }}>
                IVA {pct(params.iva)} · Food cost meta {pct(params.food_cost_meta)} · Merma default {pct(params.merma_default)}
              </span>
            )}
          </p>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">Precio</th>
                <th className="num">Costo receta</th>
                <th className="num">Empaque</th>
                <th className="num">Costo total</th>
                <th className="num">Food cost</th>
                <th className="num">Margen</th>
                <th className="num">Precio sugerido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const c = costeoPorId.get(p.id)
                const fc = c?.food_cost_pct ?? null
                const excedido = fc != null && params != null && fc > params.food_cost_meta
                return (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td className="num">{mxn(p.precio)}</td>
                    <td className="num">{mxn(c?.costo_receta)}</td>
                    <td className="num">{mxn(c?.costo_empaque)}</td>
                    <td className="num">{mxn(c?.costo_total)}</td>
                    <td className={excedido ? 'num alerta' : 'num ok'}>{pct(fc)}</td>
                    <td className="num">{mxn(c?.margen)}</td>
                    <td className="num">{mxn(c?.precio_sugerido)}</td>
                    <td><button className="liga" onClick={() => void abrirEditor(p)}>Editar</button></td>
                  </tr>
                )
              })}
              {productos.length === 0 && (
                <tr><td colSpan={9}>Sin productos aún. Corre el ETL (supabase/seed) o crea el primero.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {editorAbierto && (
        <div className="panel">
          <h2>{nuevo ? 'Nuevo producto' : `Editar: ${editando?.nombre}`}</h2>
          <div className="fila-form">
            <div className="campo">
              <label>Nombre</label>
              <input value={formProd.nombre} onChange={(e) => setFormProd({ ...formProd, nombre: e.target.value })} />
            </div>
            <div className="campo">
              <label>Categoría</label>
              <select value={formProd.categoria_id} onChange={(e) => setFormProd({ ...formProd, categoria_id: e.target.value })}>
                <option value="">— sin categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Precio de venta ($)</label>
              <input type="number" value={formProd.precio} onChange={(e) => setFormProd({ ...formProd, precio: e.target.value })} />
            </div>
            <div className="campo">
              <label>IVA incluido</label>
              <select
                value={formProd.iva_incluido ? 'si' : 'no'}
                onChange={(e) => setFormProd({ ...formProd, iva_incluido: e.target.value === 'si' })}
              >
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <h3 style={{ marginTop: 20 }}>Receta</h3>
          <table>
            <thead>
              <tr>
                <th>Insumo</th>
                <th className="num">Cantidad</th>
                <th>Unidad</th>
                <th className="num">Costo línea</th>
                <th>Nota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, idx) => {
                const ins = insumosPorId.get(l.insumo_id)
                const costoLinea = (ins?.costo_unitario ?? 0) * (Number(l.cantidad) || 0)
                return (
                  <tr key={idx}>
                    <td>
                      <select
                        value={l.insumo_id}
                        onChange={(e) => {
                          const copia = [...lineas]
                          copia[idx] = { ...l, insumo_id: e.target.value }
                          setLineas(copia)
                        }}
                      >
                        <option value="">— elegir —</option>
                        {insumos.map((i) => (
                          <option key={i.id} value={i.id}>{i.nombre} ({i.tipo})</option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        style={{ width: 90 }}
                        value={l.cantidad}
                        onChange={(e) => {
                          const copia = [...lineas]
                          copia[idx] = { ...l, cantidad: e.target.value }
                          setLineas(copia)
                        }}
                      />
                    </td>
                    <td>{ins?.unidad ?? ''}</td>
                    <td className="num">{mxn(costoLinea)}</td>
                    <td>
                      <input
                        value={l.nota}
                        onChange={(e) => {
                          const copia = [...lineas]
                          copia[idx] = { ...l, nota: e.target.value }
                          setLineas(copia)
                        }}
                      />
                    </td>
                    <td>
                      <button className="liga peligro" onClick={() => setLineas(lineas.filter((_, i) => i !== idx))}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p>
            <button className="liga" onClick={() => setLineas([...lineas, { insumo_id: '', cantidad: '', nota: '' }])}>
              + Agregar línea
            </button>
            <strong style={{ marginLeft: 16 }}>Costo receta en vivo: {mxn(costoRecetaVivo)}</strong>
          </p>

          <p style={{ marginTop: 16 }}>
            <button className="primario" onClick={() => void guardar()} disabled={guardando || !formProd.nombre.trim()}>
              Guardar producto y receta
            </button>
            <button className="liga" onClick={() => { setEditando(null); setNuevo(false) }}>Cancelar</button>
          </p>
        </div>
      )}
    </div>
  )
}
