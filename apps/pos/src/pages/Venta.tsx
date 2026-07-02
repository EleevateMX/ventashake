import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { listarProductosParaVenta, crearOrden, cobrarOrden } from '@shake/supabase'
import type { ProductoVenta } from '@shake/supabase'
import type { MetodoPago } from '@shake/types'
import { mxn } from '@shake/utils'
import type { Contexto } from '../App'

interface LineaCarrito {
  producto: ProductoVenta
  cantidad: number
}

const METODOS: { key: MetodoPago; label: string; pideRef?: boolean }[] = [
  { key: 'efectivo', label: '💵 Efectivo' },
  { key: 'tarjeta', label: '💳 Tarjeta' },
  { key: 'clip', label: '📟 Clip (Stand 2)', pideRef: true },
  { key: 'cortesia', label: '🎁 Cortesía' },
  { key: 'otro', label: '• Otro', pideRef: true },
]

export default function Venta({ ctx }: { ctx: Contexto }) {
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [referencia, setReferencia] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    listarProductosParaVenta(sb)
      .then(setProductos)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false))
  }, [])

  const total = useMemo(
    () => carrito.reduce((s, l) => s + l.producto.precio * l.cantidad, 0),
    [carrito],
  )

  function agregar(p: ProductoVenta) {
    setCarrito((prev) => {
      const i = prev.findIndex((l) => l.producto.id === p.id)
      if (i >= 0) {
        const copia = [...prev]
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 }
        return copia
      }
      return [...prev, { producto: p, cantidad: 1 }]
    })
  }

  function cambiar(id: string, delta: number) {
    setCarrito((prev) =>
      prev
        .map((l) => (l.producto.id === id ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0),
    )
  }

  async function confirmarCobro() {
    if (carrito.length === 0) return
    setProcesando(true)
    setError(null)
    try {
      const orden = await crearOrden(
        sb,
        {
          sucursal_id: ctx.sucursalId,
          almacen_id: ctx.almacenKioskoId,
          canal: 'pos',
          corte_id: ctx.corte.id,
        },
        carrito.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          precio_unitario: l.producto.precio,
        })),
      )
      // Cobro inmediato aprobado → el trigger descuenta inventario y manda a cocina.
      await cobrarOrden(sb, orden.id, metodo, total, {
        referencia: referencia.trim() || undefined,
      })
      setOk(`Orden #${orden.folio} cobrada (${metodo}). Enviada a cocina.`)
      setCarrito([])
      setReferencia('')
      setCobrando(false)
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProcesando(false)
    }
  }

  if (cargando) return <div className="cargando">Cargando catálogo…</div>

  const metodoSel = METODOS.find((m) => m.key === metodo)

  return (
    <div className="layout">
      <div>
        {error && <div className="error-msg">{error}</div>}
        {ok && <div className="ok-msg">{ok}</div>}
        <div className="panel">
          <h2>Productos</h2>
          {productos.length === 0 && (
            <p className="muted">
              No hay productos activos. Captúralos en la app de Costos (o corre el ETL) y
              aparecerán aquí.
            </p>
          )}
          <div className="grid-prod">
            {productos.map((p) => (
              <button key={p.id} className="card-prod" onClick={() => agregar(p)}>
                <div className="cat">{p.categorias?.cocinas?.nombre ?? 'General'}</div>
                <div className="nom">{p.nombre}</div>
                <div className="pre">{mxn(p.precio)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel cart">
        <h2>Ticket</h2>
        {carrito.length === 0 && <p className="muted">Toca productos para agregarlos.</p>}
        {carrito.map((l) => (
          <div key={l.producto.id} className="cart-item">
            <span className="nom">{l.producto.nombre}</span>
            <button onClick={() => cambiar(l.producto.id, -1)}>−</button>
            <span>{l.cantidad}</span>
            <button onClick={() => cambiar(l.producto.id, 1)}>+</button>
            <span style={{ width: 70, textAlign: 'right' }}>{mxn(l.producto.precio * l.cantidad)}</span>
          </div>
        ))}
        <div className="total">Total: {mxn(total)}</div>
        <button className="primario" disabled={carrito.length === 0} onClick={() => setCobrando(true)}>
          Cobrar
        </button>
      </div>

      {cobrando && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setCobrando(false) }}>
          <div className="modal">
            <h2>Cobrar {mxn(total)}</h2>
            <div className="metodos">
              {METODOS.map((m) => (
                <button
                  key={m.key}
                  className={metodo === m.key ? 'metodo sel' : 'metodo'}
                  onClick={() => setMetodo(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {metodoSel?.pideRef && (
              <div className="campo">
                <label>
                  {metodo === 'clip' ? 'Referencia / folio del voucher Clip' : 'Referencia'}
                </label>
                <input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder={metodo === 'clip' ? 'Cobra en el Stand 2 y captura el folio' : ''}
                />
              </div>
            )}
            {metodo === 'clip' && (
              <p className="muted" style={{ fontSize: '0.82rem' }}>
                Cobra el monto en la terminal Clip Stand 2 y confirma aquí con la referencia del
                voucher. (La confirmación automática por webhook se activa en una fase posterior.)
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="sec" onClick={() => setCobrando(false)}>Cancelar</button>
              <button className="primario" disabled={procesando} onClick={() => void confirmarCobro()}>
                {procesando ? 'Procesando…' : `Confirmar pago ${mxn(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
