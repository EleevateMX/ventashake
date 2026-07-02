import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductosParaVenta,
  crearOrden,
  cobrarOrden,
  identificarCliente,
  buscarCupon,
  canjearCupon,
} from '@shake/supabase'
import type { ProductoVenta, ClienteConLealtad } from '@shake/supabase'
import type { MetodoPago, Cupon } from '@shake/types'
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
  // Lealtad
  const [buscarCli, setBuscarCli] = useState('')
  const [cliente, setCliente] = useState<ClienteConLealtad | null>(null)
  const [cliMsg, setCliMsg] = useState<string | null>(null)
  // Cupón
  const [cupon, setCupon] = useState<Cupon | null>(null)
  const [codigoCupon, setCodigoCupon] = useState('')
  const [cuponMsg, setCuponMsg] = useState<string | null>(null)

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

  async function buscarCliente() {
    setCliMsg(null)
    try {
      const c = await identificarCliente(sb, buscarCli)
      if (!c) {
        setCliente(null)
        setCliMsg('Cliente no encontrado.')
      } else {
        setCliente(c)
      }
    } catch (e) {
      setCliMsg(e instanceof Error ? e.message : String(e))
    }
  }

  // Ítems elegibles para un cupón: cumpleaños solo shakes; otros cualquiera.
  function itemsElegibles(cup: Cupon) {
    if (cup.tipo === 'cumpleanos') {
      return carrito.filter((l) => l.producto.categorias?.nombre === 'Shakes')
    }
    return carrito
  }

  // El cupón cubre (gratis) el ítem elegible más caro, 1 unidad.
  const descuento = useMemo(() => {
    if (!cupon) return 0
    const eleg = itemsElegibles(cupon)
    if (eleg.length === 0) return 0
    return Math.max(...eleg.map((l) => l.producto.precio))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupon, carrito])

  const neto = Math.max(0, total - descuento)

  function aplicarCupon(cup: Cupon) {
    setCuponMsg(null)
    if (itemsElegibles(cup).length === 0) {
      setCuponMsg(
        cup.tipo === 'cumpleanos'
          ? 'Agrega un shake al ticket para usar el cupón de cumpleaños.'
          : 'Agrega un producto para aplicar el cupón.',
      )
      return
    }
    setCupon(cup)
  }

  async function escanearCupon() {
    setCuponMsg(null)
    const c = await buscarCupon(sb, codigoCupon).catch(() => null)
    if (!c) return setCuponMsg('Cupón no encontrado.')
    if (c.estado !== 'activo') return setCuponMsg('El cupón no está activo.')
    if (new Date(c.vence_en).getTime() < Date.now()) return setCuponMsg('El cupón está vencido.')
    setCodigoCupon('')
    aplicarCupon(c)
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
          cliente_id: cliente?.id ?? null,
          descuento,
        },
        carrito.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          precio_unitario: l.producto.precio,
        })),
      )
      // Si hay cupón, canjearlo (marca usado + liga a la orden) antes de cobrar.
      if (cupon) await canjearCupon(sb, cupon.id, orden.id)
      // Cobro inmediato aprobado → el trigger descuenta inventario y manda a cocina.
      await cobrarOrden(sb, orden.id, metodo, neto, {
        referencia: referencia.trim() || undefined,
      })
      const gana = cliente ? Math.min(100, Math.floor(neto / 10)) : 0
      setOk(
        `Orden #${orden.folio} cobrada (${metodo}). Enviada a cocina.` +
          (cupon ? ' Cupón aplicado.' : '') +
          (cliente ? ` ${cliente.nombre} ganó ${gana} mancuernas.` : ''),
      )
      setCarrito([])
      setReferencia('')
      setCliente(null)
      setBuscarCli('')
      setCupon(null)
      setCodigoCupon('')
      setCuponMsg(null)
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

        <div style={{ marginBottom: 12 }}>
          {!cliente ? (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  style={{ flex: 1, padding: '7px 9px', border: '1px solid #d0d5dd', borderRadius: 6 }}
                  placeholder="Teléfono o QR (SHK-…)"
                  value={buscarCli}
                  onChange={(e) => setBuscarCli(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void buscarCliente() }}
                />
                <button className="sec" onClick={() => void buscarCliente()}>Buscar</button>
              </div>
              {cliMsg && <p className="muted" style={{ fontSize: '0.8rem' }}>{cliMsg}</p>}
            </>
          ) : (
            <div style={{ background: '#ecfdf3', border: '1px solid #a6f4c5', borderRadius: 8, padding: 8 }}>
              <b>{cliente.nombre}</b> · 🏋️ {cliente.mancuernas} mancuernas
              <button className="liga" style={{ padding: 0, marginLeft: 8 }} onClick={() => { setCliente(null); setBuscarCli(''); setCupon(null) }}>quitar</button>
              {cliente.cupones.length > 0 && !cupon && (
                <div style={{ marginTop: 6 }}>
                  {cliente.cupones.map((c) => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: '0.8rem' }}>{c.tipo === 'cumpleanos' ? '🎂' : '🎁'} {c.beneficio}</span>
                      <button className="sec" onClick={() => aplicarCupon(c)}>Aplicar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cupón: aplicado o escaneo manual */}
        {cupon ? (
          <div className="ok-msg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Cupón aplicado: −{mxn(descuento)}</span>
            <button className="liga" onClick={() => { setCupon(null); setCuponMsg(null) }}>quitar</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              style={{ flex: 1, padding: '7px 9px', border: '1px solid #d0d5dd', borderRadius: 6 }}
              placeholder="Escanear cupón (CUP-…)"
              value={codigoCupon}
              onChange={(e) => setCodigoCupon(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void escanearCupon() }}
            />
            <button className="sec" onClick={() => void escanearCupon()}>Canjear</button>
          </div>
        )}
        {cuponMsg && <p className="muted" style={{ fontSize: '0.8rem' }}>{cuponMsg}</p>}

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
        {descuento > 0 && (
          <>
            <div className="cart-item" style={{ border: 'none' }}><span className="nom muted">Subtotal</span><span>{mxn(total)}</span></div>
            <div className="cart-item" style={{ border: 'none' }}><span className="nom muted">Descuento cupón</span><span>−{mxn(descuento)}</span></div>
          </>
        )}
        <div className="total">Total: {mxn(neto)}</div>
        <button className="primario" disabled={carrito.length === 0} onClick={() => setCobrando(true)}>
          Cobrar
        </button>
      </div>

      {cobrando && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setCobrando(false) }}>
          <div className="modal">
            <h2>Cobrar {mxn(neto)}</h2>
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
                {procesando ? 'Procesando…' : `Confirmar pago ${mxn(neto)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
