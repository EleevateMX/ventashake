import milo from '@shake/brand/milo.png'
import { useEffect, useMemo, useState } from 'react'
import { sb } from './lib/sb'
import { listarAlmacenes, listarProductosParaVenta, crearOrden, cobrarOrden, identificarCliente, canjearCupon } from '@shake/supabase'
import type { ProductoVenta, ClienteConLealtad } from '@shake/supabase'
import type { Almacen, MetodoPago, Cupon } from '@shake/types'
import { mxn } from '@shake/utils'
import { imprimirTicket, type TicketData } from '@shake/ui'

interface LineaCarrito { producto: ProductoVenta; cantidad: number }

type Paso = 'menu' | 'carrito' | 'lealtad' | 'pago' | 'confirmada'

// Autoservicio: pago electrónico por terminal (Clip). El cobro real por
// terminal se conecta en la Fase C (edge function clip-cobro); hoy el "seam"
// registra el pago aprobado igual que caja manual.
const METODOS: { key: MetodoPago; label: string; sub: string }[] = [
  { key: 'clip', label: 'Terminal', sub: 'Tarjeta · Clip' },
  { key: 'tarjeta', label: 'Tarjeta', sub: 'Inserta o acerca' },
]

const catNombre = (p: ProductoVenta) => p.categorias?.nombre ?? 'General'

export default function App() {
  const [almacen, setAlmacen] = useState<Almacen | null>(null)
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [paso, setPaso] = useState<Paso>('menu')
  const [cat, setCat] = useState('TODO')
  const [metodo, setMetodo] = useState<MetodoPago>('clip')
  const [referencia, setReferencia] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [folio, setFolio] = useState<string | number | null>(null)

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
  useEffect(() => { void bootstrap() }, [])

  const total = useMemo(() => carrito.reduce((s, l) => s + l.producto.precio * l.cantidad, 0), [carrito])
  const unidades = useMemo(() => carrito.reduce((s, l) => s + l.cantidad, 0), [carrito])

  function itemsElegibles(cup: Cupon) {
    return cup.tipo === 'cumpleanos' ? carrito.filter((l) => l.producto.categorias?.nombre === 'Shakes') : carrito
  }
  const descuento = useMemo(() => {
    if (!cupon) return 0
    const eleg = itemsElegibles(cupon)
    return eleg.length ? Math.max(...eleg.map((l) => l.producto.precio)) : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupon, carrito])
  const neto = Math.max(0, total - descuento)
  const mancuernasGanadas = Math.min(100, Math.floor(neto / 10))

  const categorias = useMemo(() => {
    const set = new Set<string>()
    productos.forEach((p) => set.add(catNombre(p)))
    return ['TODO', ...[...set]]
  }, [productos])
  const visibles = cat === 'TODO' ? productos : productos.filter((p) => catNombre(p) === cat)

  function agregar(p: ProductoVenta) {
    setCarrito((prev) => {
      const i = prev.findIndex((l) => l.producto.id === p.id)
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], cantidad: c[i].cantidad + 1 }; return c }
      return [...prev, { producto: p, cantidad: 1 }]
    })
  }
  function cambiar(id: string, delta: number) {
    setCarrito((prev) => prev.map((l) => (l.producto.id === id ? { ...l, cantidad: l.cantidad + delta } : l)).filter((l) => l.cantidad > 0))
  }

  function reiniciar() {
    setCarrito([]); setReferencia(''); setMetodo('clip'); setCliente(null); setBuscarCli(''); setCupon(null)
    setFolio(null); setCat('TODO'); setPaso('menu'); setError(null)
  }

  async function cobrar() {
    if (carrito.length === 0 || !almacen) return
    setProcesando(true); setError(null)
    try {
      const orden = await crearOrden(sb, {
        sucursal_id: almacen.sucursal_id, almacen_id: almacen.id, canal: 'kiosko',
        cliente_id: cliente?.id ?? null, descuento,
      }, carrito.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad, precio_unitario: l.producto.precio })))
      if (cupon) await canjearCupon(sb, cupon.id, orden.id)
      // SEAM Clip: aquí se llamará a la edge function clip-cobro para mandar el
      // monto a la terminal pegada al kiosko. Por ahora registra aprobado.
      await cobrarOrden(sb, orden.id, metodo, neto, { referencia: referencia.trim() || undefined })

      // Ticket
      const ticket: TicketData = {
        folio: orden.folio, fecha: new Date(), canal: 'Kiosko autoservicio',
        items: carrito.map((l) => ({ cantidad: l.cantidad, nombre: l.producto.nombre, precioUnitario: l.producto.precio })),
        descuento, metodoPago: metodo === 'clip' ? 'Clip · Terminal' : 'Tarjeta',
        referenciaPago: referencia.trim() || null,
        clienteNombre: cliente?.nombre ?? null,
        mancuernasGanadas: cliente ? mancuernasGanadas : undefined,
        mancuernasSaldo: cliente ? (cliente.mancuernas ?? 0) + mancuernasGanadas : undefined,
        codigoRewards: cliente?.codigo ?? null,
      }
      imprimirTicket(ticket)
      setFolio(orden.folio)
      setPaso('confirmada')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProcesando(false)
    }
  }

  if (cargando) return <div className="cargando">Cargando menú…</div>

  // ---- CONFIRMACIÓN ----
  if (paso === 'confirmada') {
    return (
      <div className="confirm">
        <div className="confirm-card">
          <div className="confirm-check">✓</div>
          <h1>¡Listo, a agitar!</h1>
          <p className="confirm-sub">Recoge tu pedido con este número</p>
          <div className="folio">{folio}</div>
          {cliente && <p className="confirm-sub">+{mancuernasGanadas} mancuernas 🏋️ para {cliente.nombre.split(' ')[0]}</p>}
          <button className="btn-gigante" onClick={reiniciar}>Nueva orden</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1><img className="milo" src={milo} alt="" />Shake Aholic · Autoservicio</h1>
        <span className="hint">
          {paso === 'menu' ? 'Toca para armar tu pedido' :
           paso === 'carrito' ? 'Revisa tu pedido' :
           paso === 'lealtad' ? 'Rewards' : '¿Cómo lo pagas?'}
        </span>
      </header>

      {error && <div className="error-msg">{error}</div>}

      {/* ---- PASO MENÚ ---- */}
      {paso === 'menu' && (
        <>
          {productos.length === 0 && <p className="muted">El menú no está disponible por ahora. Pide ayuda a un colaborador.</p>}
          <div className="catbar">
            {categorias.map((c) => (
              <button key={c} className={cat === c ? 'catpill sel' : 'catpill'} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          <div className="grid-prod menu">
            {visibles.map((p) => (
              <button key={p.id} className="card-prod" onClick={() => agregar(p)}>
                <div className="cat">{catNombre(p)}</div>
                <div className="nom">{p.nombre}</div>
                {p.descripcion && <div className="desc">{p.descripcion}</div>}
                <div className="fila-pre"><span className="pre">{mxn(p.precio)}</span><span className="mas">+</span></div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---- PASO CARRITO ---- */}
      {paso === 'carrito' && (
        <div className="panel">
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
        </div>
      )}

      {/* ---- PASO LEALTAD ---- */}
      {paso === 'lealtad' && (
        <div className="panel lealtad-step">
          <div className="loyal-ico">★</div>
          <h2>Gana mancuernas con tu compra</h2>
          <p className="muted">1 mancuerna por cada $10. Acumula para cupones y sorpresas.</p>
          {!cliente ? (
            <>
              <div className="campo">
                <label>Teléfono o código QR (SHK-…)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ flex: 1 }} value={buscarCli} onChange={(e) => setBuscarCli(e.target.value)} placeholder="Teléfono o SHK-…" />
                  <button className="sec" onClick={async () => { const c = await identificarCliente(sb, buscarCli).catch(() => null); setCliente(c); if (!c) setError('No encontramos ese cliente. Puedes continuar sin cuenta.') }}>Identificar</button>
                </div>
              </div>
              <button className="liga" onClick={() => setPaso('pago')}>Continuar sin cuenta →</button>
            </>
          ) : (
            <div className="instruccion">
              ¡Hola {cliente.nombre.split(' ')[0]}! Ganarás <b>{mancuernasGanadas}</b> mancuernas 🏋️
              {cliente.cupones.length > 0 && !cupon && (
                <div style={{ marginTop: 10 }}>
                  {cliente.cupones.map((c) => (
                    <button key={c.id} className="sec" style={{ display: 'block', width: '100%', marginTop: 6 }} onClick={() => setCupon(c)}>
                      {c.tipo === 'cumpleanos' ? '🎂' : '🎁'} Usar: {c.beneficio}
                    </button>
                  ))}
                </div>
              )}
              {cupon && (<div style={{ marginTop: 10 }}>Cupón aplicado: −{mxn(descuento)} <button className="liga" onClick={() => setCupon(null)}>quitar</button></div>)}
            </div>
          )}
        </div>
      )}

      {/* ---- PASO PAGO ---- */}
      {paso === 'pago' && (
        <div className="panel pago-step">
          <p className="muted" style={{ textAlign: 'center' }}>Total a pagar</p>
          <div className="pago-total">{mxn(neto)}</div>
          {descuento > 0 && <p className="muted" style={{ textAlign: 'center' }}>Incluye −{mxn(descuento)} de cupón</p>}
          <div className="metodos">
            {METODOS.map((m) => (
              <button key={m.key} className={metodo === m.key ? 'metodo sel' : 'metodo'} onClick={() => setMetodo(m.key)}>
                <b>{m.label}</b><span className="metodo-sub">{m.sub}</span>
              </button>
            ))}
          </div>
          <p className="instruccion">Al confirmar, cobramos en la terminal y se imprime tu ticket. Sigue las instrucciones de la pantalla de la terminal.</p>
        </div>
      )}

      {/* ---- BARRA INFERIOR DE ACCIÓN ---- */}
      {paso !== 'menu' || carrito.length > 0 ? (
        <div className="actionbar">
          <div className="ab-info">
            {paso === 'pago' ? <><span className="ab-lbl">A cobrar</span><span className="ab-amt">{mxn(neto)}</span></>
              : <><span className="ab-lbl">{unidades} {unidades === 1 ? 'cosa' : 'cosas'} · MXN</span><span className="ab-amt">{mxn(neto)}</span></>}
          </div>
          <div className="ab-btns">
            {paso !== 'menu' && <button className="sec" disabled={procesando} onClick={() => setPaso(paso === 'carrito' ? 'menu' : paso === 'lealtad' ? 'carrito' : 'lealtad')}>Atrás</button>}
            {paso === 'menu' && <button className="btn-gigante" onClick={() => setPaso('carrito')}>Ver pedido →</button>}
            {paso === 'carrito' && <button className="btn-gigante" disabled={carrito.length === 0} onClick={() => setPaso('lealtad')}>Continuar →</button>}
            {paso === 'lealtad' && <button className="btn-gigante" onClick={() => setPaso('pago')}>Ir a pagar →</button>}
            {paso === 'pago' && <button className="btn-gigante" disabled={procesando} onClick={() => void cobrar()}>{procesando ? 'Cobrando…' : `Pagar ${mxn(neto)}`}</button>}
          </div>
        </div>
      ) : null}
    </div>
  )
}
