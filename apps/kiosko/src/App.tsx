import { useEffect, useMemo, useState } from 'react'
import { sb } from './lib/sb'
import { listarAlmacenes, listarProductosParaVenta, crearOrden, cobrarOrden, identificarCliente, canjearCupon } from '@shake/supabase'
import type { ProductoVenta, ClienteConLealtad } from '@shake/supabase'
import type { Almacen } from '@shake/types'
import type { MetodoPago, Cupon } from '@shake/types'
import { mxn } from '@shake/utils'

interface LineaCarrito {
  producto: ProductoVenta
  cantidad: number
}

interface OrdenConfirmada {
  folio: string | number
}

// Autoservicio: sin efectivo ni cortesía. Solo pagos electrónicos.
const METODOS: { key: MetodoPago; label: string; pideRef?: boolean }[] = [
  { key: 'tarjeta', label: '💳 Tarjeta' },
  { key: 'clip', label: '📟 Terminal Clip', pideRef: true },
]

function grupo(p: ProductoVenta): string {
  return p.categorias?.cocinas?.nombre ?? 'General'
}

export default function App() {
  const [almacen, setAlmacen] = useState<Almacen | null>(null)
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [cobrando, setCobrando] = useState(false)
  const [metodo, setMetodo] = useState<MetodoPago>('tarjeta')
  const [referencia, setReferencia] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [confirmada, setConfirmada] = useState<OrdenConfirmada | null>(null)
  // Lealtad (opcional en autoservicio)
  const [buscarCli, setBuscarCli] = useState('')
  const [cliente, setCliente] = useState<ClienteConLealtad | null>(null)
  const [cupon, setCupon] = useState<Cupon | null>(null)

  async function bootstrap() {
    setCargando(true)
    try {
      const almacenes = await listarAlmacenes(sb)
      const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0]
      if (!kiosko) throw new Error('No hay almacenes configurados.')
      setAlmacen(kiosko)
      setProductos(await listarProductosParaVenta(sb))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void bootstrap()
  }, [])

  const total = useMemo(
    () => carrito.reduce((s, l) => s + l.producto.precio * l.cantidad, 0),
    [carrito],
  )

  // Cupón: cubre (gratis) el ítem elegible más caro (cumpleaños = shake).
  function itemsElegibles(cup: Cupon) {
    return cup.tipo === 'cumpleanos'
      ? carrito.filter((l) => l.producto.categorias?.nombre === 'Shakes')
      : carrito
  }
  const descuento = useMemo(() => {
    if (!cupon) return 0
    const eleg = itemsElegibles(cupon)
    return eleg.length ? Math.max(...eleg.map((l) => l.producto.precio)) : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupon, carrito])
  const neto = Math.max(0, total - descuento)

  const grupos = useMemo(() => {
    const m = new Map<string, ProductoVenta[]>()
    for (const p of productos) {
      const g = grupo(p)
      const arr = m.get(g) ?? []
      arr.push(p)
      m.set(g, arr)
    }
    return [...m.entries()]
  }, [productos])

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

  async function confirmarPago() {
    if (carrito.length === 0 || !almacen) return
    setProcesando(true)
    setError(null)
    try {
      // Sin corte_id: el kiosko no maneja caja/corte.
      const orden = await crearOrden(
        sb,
        {
          sucursal_id: almacen.sucursal_id,
          almacen_id: almacen.id,
          canal: 'kiosko',
          cliente_id: cliente?.id ?? null,
          descuento,
        },
        carrito.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          precio_unitario: l.producto.precio,
        })),
      )
      if (cupon) await canjearCupon(sb, cupon.id, orden.id)
      // Cobro inmediato aprobado → el trigger descuenta inventario y manda a cocina.
      await cobrarOrden(sb, orden.id, metodo, neto, {
        referencia: referencia.trim() || undefined,
      })
      setConfirmada({ folio: orden.folio })
      setCarrito([])
      setReferencia('')
      setMetodo('tarjeta')
      setCliente(null)
      setBuscarCli('')
      setCupon(null)
      setCobrando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProcesando(false)
    }
  }

  function nuevaOrden() {
    setConfirmada(null)
    setError(null)
  }

  if (cargando) return <div className="cargando">Cargando menú…</div>

  // Pantalla de confirmación con folio grande.
  if (confirmada) {
    return (
      <div className="confirm">
        <div className="confirm-card">
          <div className="confirm-check">✓</div>
          <h1>¡Pedido confirmado!</h1>
          <p className="confirm-sub">Recoge tu pedido con este número</p>
          <div className="folio">{confirmada.folio}</div>
          <button className="btn-gigante" onClick={nuevaOrden}>
            Nueva orden
          </button>
        </div>
      </div>
    )
  }

  const metodoSel = METODOS.find((m) => m.key === metodo)

  return (
    <div className="app">
      <header className="header">
        <h1>🥤 Shakeaholic · Autoservicio</h1>
        <span className="hint">Toca para armar tu pedido</span>
      </header>

      {error && <div className="error-msg">{error}</div>}

      <div className="layout">
        <div className="catalogo">
          {productos.length === 0 && (
            <p className="muted">El menú no está disponible por ahora. Pide ayuda a un colaborador.</p>
          )}
          {grupos.map(([nombre, items]) => (
            <section key={nombre} className="grupo">
              <h2 className="grupo-titulo">{nombre}</h2>
              <div className="grid-prod">
                {items.map((p) => (
                  <button key={p.id} className="card-prod" onClick={() => agregar(p)}>
                    <div className="nom">{p.nombre}</div>
                    <div className="pre">{mxn(p.precio)}</div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="panel cart">
          <h2>Tu pedido</h2>
          {carrito.length === 0 && <p className="muted">Aún no agregas productos.</p>}
          {carrito.map((l) => (
            <div key={l.producto.id} className="cart-item">
              <span className="nom">{l.producto.nombre}</span>
              <button className="qty" onClick={() => cambiar(l.producto.id, -1)}>−</button>
              <span className="cant">{l.cantidad}</span>
              <button className="qty" onClick={() => cambiar(l.producto.id, 1)}>+</button>
              <span className="sub">{mxn(l.producto.precio * l.cantidad)}</span>
            </div>
          ))}
          <div className="total">Total: {mxn(total)}</div>
          <button
            className="btn-gigante"
            disabled={carrito.length === 0}
            onClick={() => setCobrando(true)}
          >
            Pagar
          </button>
        </aside>
      </div>

      {cobrando && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget && !procesando) setCobrando(false) }}>
          <div className="modal">
            <h2>Pagar {mxn(neto)}</h2>

            {/* Lealtad opcional: identifícate para ganar mancuernas */}
            {!cliente ? (
              <div className="campo">
                <label>¿Eres miembro Rewards? Teléfono o QR (opcional)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    style={{ flex: 1 }}
                    value={buscarCli}
                    onChange={(e) => setBuscarCli(e.target.value)}
                    placeholder="Teléfono o SHK-…"
                  />
                  <button
                    className="sec"
                    onClick={async () => {
                      const c = await identificarCliente(sb, buscarCli).catch(() => null)
                      setCliente(c)
                    }}
                  >
                    Identificar
                  </button>
                </div>
              </div>
            ) : (
              <div className="instruccion">
                ¡Hola {cliente.nombre.split(' ')[0]}! Ganarás {Math.min(100, Math.floor(neto / 10))} mancuernas 🏋️
                {cliente.cupones.length > 0 && !cupon && (
                  <div style={{ marginTop: 8 }}>
                    {cliente.cupones.map((c) => (
                      <button key={c.id} className="sec" style={{ display: 'block', width: '100%', marginTop: 4 }} onClick={() => setCupon(c)}>
                        {c.tipo === 'cumpleanos' ? '🎂' : '🎁'} Usar: {c.beneficio}
                      </button>
                    ))}
                  </div>
                )}
                {cupon && (
                  <div style={{ marginTop: 8 }}>
                    Cupón aplicado: −{mxn(descuento)}{' '}
                    <button className="liga" onClick={() => setCupon(null)}>quitar</button>
                  </div>
                )}
              </div>
            )}

            <p className="muted">Elige tu forma de pago</p>
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
            {metodo === 'clip' && (
              <>
                <p className="instruccion">
                  Cobra el monto en la terminal Clip y captura la referencia del voucher
                  (puedes dejarla vacía).
                </p>
                <div className="campo">
                  <label>Referencia del voucher (opcional)</label>
                  <input
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder="Folio del voucher"
                  />
                </div>
              </>
            )}
            {!metodoSel?.pideRef && metodo === 'tarjeta' && (
              <p className="instruccion">Sigue las instrucciones de la terminal para pagar con tu tarjeta.</p>
            )}
            <div className="modal-acciones">
              <button className="sec" disabled={procesando} onClick={() => setCobrando(false)}>
                Cancelar
              </button>
              <button className="btn-gigante" disabled={procesando} onClick={() => void confirmarPago()}>
                {procesando ? 'Procesando…' : `Confirmar ${mxn(neto)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
