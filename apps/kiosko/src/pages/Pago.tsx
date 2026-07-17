import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearOrden, cobrarOrden, listarAlmacenes } from '@shake/supabase'
import type { Almacen } from '@shake/types'
import { useCarrito } from '@/store/carritoStore'
import { sb } from '@/lib/sb'
import { displayOrderPaid, kdsNewOrder } from '@/sync'

type MetodoPago = 'terminal' | 'efectivo'
type EstadoPago = 'eligiendo' | 'terminal_tap' | 'terminal_procesando' | 'terminal_ok'

const IconCard = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
)

const IconCash = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2"/>
    <circle cx="12" cy="12" r="3"/>
    <path d="M6 12h.01M18 12h.01"/>
  </svg>
)

function TerminalOverlay({ estado, monto }: { estado: EstadoPago; monto: number }) {
  const montoFmt = `$${monto.toFixed(2)}`

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-deep flex flex-col items-center justify-center gap-6 px-8 text-sa-cream">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-sa-banana absolute top-10 left-10">
        #TERMINAL · MP
      </p>

      {estado === 'terminal_tap' && (
        <>
          {/* Terminal illustration */}
          <div className="relative flex flex-col items-center">
            {/* Device body */}
            <div className="w-32 h-48 rounded-2xl border-4 border-sa-cream/30 bg-sa-green-ink flex flex-col items-center justify-center gap-3 shadow-2xl">
              <div className="w-20 h-12 rounded-lg bg-sa-cream/10 border border-sa-cream/20 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#88C0A0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
              </div>
              <div className="w-20 h-1.5 rounded bg-sa-cream/20" />
              <div className="flex gap-1.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-4 h-4 rounded bg-sa-cream/10 border border-sa-cream/20" />
                ))}
              </div>
            </div>
            {/* Slot */}
            <div className="w-32 h-3 bg-sa-green-ink rounded-b-xl border-x-4 border-b-4 border-sa-cream/30" />
            {/* Animated card approaching */}
            <div className="absolute -right-16 top-14 animate-bounce">
              <div className="w-24 h-14 rounded-lg bg-gradient-to-br from-sa-banana to-sa-mango shadow-lg border border-white/20 flex flex-col justify-between p-2">
                <div className="w-6 h-4 rounded bg-white/40" />
                <div className="space-y-1">
                  <div className="w-16 h-1 rounded bg-white/30" />
                  <div className="w-10 h-1 rounded bg-white/20" />
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-2">
            <p className="font-display text-3xl text-sa-cream">Acerque su tarjeta</p>
            <p className="font-mono text-sm text-sa-cream/60 mt-2 uppercase tracking-wider">
              o insértela en la ranura
            </p>
          </div>

          <div className="bg-sa-green-ink rounded-sa-lg px-8 py-4 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">Total a cobrar</p>
            <p className="font-display text-5xl text-sa-cream mt-1 leading-none">{montoFmt}</p>
            <p className="font-mono text-xs text-sa-cream/50 mt-1">MXN</p>
          </div>

          <div className="flex gap-1 mt-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-sa-cream/30 animate-pulse"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            ))}
          </div>
        </>
      )}

      {estado === 'terminal_procesando' && (
        <>
          <svg className="animate-spin w-16 h-16 text-sa-banana" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <div className="text-center">
            <p className="font-display text-3xl text-sa-cream">Procesando...</p>
            <p className="font-mono text-sm text-sa-cream/60 mt-2 uppercase tracking-wider">
              No retire la tarjeta
            </p>
          </div>
          <p className="font-display text-4xl text-sa-cream">{montoFmt}</p>
        </>
      )}

      {estado === 'terminal_ok' && (
        <>
          <div className="w-28 h-28 rounded-full bg-emerald-500 flex items-center justify-center shadow-2xl animate-pulse">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="font-display text-4xl text-sa-cream">¡Pago aprobado!</p>
            <p className="font-mono text-sm text-emerald-400 mt-2 uppercase tracking-wider">
              Transacción autorizada
            </p>
          </div>
          <p className="font-display text-5xl text-sa-cream">{montoFmt}</p>
          <p className="font-mono text-xs text-sa-cream/40 uppercase tracking-widest">
            Mercado Pago · Terminal
          </p>
        </>
      )}
    </div>
  )
}

export function Pago() {
  const navigate = useNavigate()
  const { items, total, usuario, limpiar } = useCarrito()
  const [metodo, setMetodo] = useState<MetodoPago | null>(null)
  const [estado, setEstado] = useState<EstadoPago>('eligiendo')
  const [error, setError] = useState<string | null>(null)
  const [almacen, setAlmacen] = useState<Almacen | null>(null)
  const folioRef = useRef<string | null>(null)

  // Fetch the kiosko warehouse once (for orders)
  useEffect(() => {
    listarAlmacenes(sb)
      .then((almacenes) => {
        const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0] ?? null
        setAlmacen(kiosko)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  // Run terminal animation sequence
  useEffect(() => {
    if (estado !== 'terminal_tap') return
    const t1 = setTimeout(() => setEstado('terminal_procesando'), 3000)
    const t2 = setTimeout(() => setEstado('terminal_ok'), 5500)
    const t3 = setTimeout(() => {
      const folio = folioRef.current ?? String(Math.floor(100 + Math.random() * 900))
      displayOrderPaid(folio)
      kdsNewOrder({
        id: `kiosko-${Date.now()}`,
        folio,
        canal: 'kiosko',
        created_at: new Date().toISOString(),
        items: items.map((i) => ({
          id: i.producto_id,
          nombre: i.nombre,
          cantidad: i.cantidad,
          personalizacion: i.personalizacion,
        })),
      })
      limpiar()
      navigate('/confirmacion', {
        state: {
          folio: folioRef.current,
          total: total(),
          metodo: 'terminal',
          items: [...items],
          usuario: usuario ? { ...usuario } : null,
        },
      })
    }, 7200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado])

  async function confirmarPago() {
    if (!metodo) return
    const totalOrden = total()
    const itemsSnapshot = [...items]
    setError(null)

    try {
      if (!almacen) throw new Error('No hay almacén configurado para el kiosko.')

      if (metodo === 'terminal') {
        setEstado('terminal_tap')
        // Create + charge the order in the background while animation plays.
        // SEAM Clip: aquí se conectará la edge function clip-cobro. Por ahora
        // registra el pago aprobado igual que caja manual.
        ;(async () => {
          try {
            const orden = await crearOrden(
              sb,
              {
                sucursal_id: almacen.sucursal_id,
                almacen_id: almacen.id,
                canal: 'kiosko',
                cliente_id: usuario?.clienteId ?? null,
                descuento: 0,
              },
              itemsSnapshot.map((i) => ({
                producto_id: i.producto_id,
                cantidad: i.cantidad,
                precio_unitario: i.precio,
                personalizacion: i.personalizacion ?? null,
              })),
            )
            await cobrarOrden(sb, orden.id, 'clip', totalOrden, { idempotencyKey: crypto.randomUUID() })
            folioRef.current = String(orden.folio)
          } catch (e) {
            console.error('[Kiosko] Error cobrando (terminal):', e)
            setError(e instanceof Error ? e.message : String(e))
          }
        })()
        return
      }

      // Efectivo: process inline
      setEstado('terminal_procesando' as EstadoPago)
      let folio: string | null = null
      try {
        const orden = await crearOrden(
          sb,
          {
            sucursal_id: almacen.sucursal_id,
            almacen_id: almacen.id,
            canal: 'kiosko',
            cliente_id: usuario?.clienteId ?? null,
            descuento: 0,
          },
          itemsSnapshot.map((i) => ({
            producto_id: i.producto_id,
            cantidad: i.cantidad,
            precio_unitario: i.precio,
            personalizacion: i.personalizacion ?? null,
          })),
        )
        await cobrarOrden(sb, orden.id, 'efectivo', totalOrden, { idempotencyKey: crypto.randomUUID() })
        folio = String(orden.folio)
      } catch (e) {
        console.error('[Kiosko] Error guardando orden:', e)
        setError(e instanceof Error ? e.message : String(e))
      }

      const folioFinal = folio ?? String(Math.floor(100 + Math.random() * 900))
      displayOrderPaid(folioFinal)
      kdsNewOrder({
        id: `kiosko-${Date.now()}`,
        folio: folioFinal,
        canal: 'kiosko',
        created_at: new Date().toISOString(),
        items: itemsSnapshot.map((i) => ({
          id: i.producto_id,
          nombre: i.nombre,
          cantidad: i.cantidad,
          personalizacion: i.personalizacion,
        })),
      })
      limpiar()
      navigate('/confirmacion', {
        state: {
          folio: folioFinal,
          total: totalOrden,
          metodo: 'efectivo',
          items: itemsSnapshot,
          usuario: usuario ? { ...usuario } : null,
        },
      })
    } catch (e) {
      console.error('[Kiosko] Error en confirmarPago:', e)
      setEstado('eligiendo')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      {estado !== 'eligiendo' && <TerminalOverlay estado={estado} monto={total()} />}

      <div className="flex flex-col h-screen bg-sa-cream-paper">
        <header className="flex items-center gap-4 px-8 py-6 bg-sa-green-deep text-sa-cream">
          <button
            onClick={() => navigate('/carrito')}
            className="w-12 h-12 rounded-full bg-sa-green-ink hover:bg-sa-green flex items-center justify-center text-2xl"
            aria-label="Volver"
          >
            ←
          </button>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">#PAGO</p>
            <h1 className="font-display text-3xl mt-1">¿Cómo lo pagas?</h1>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center gap-8 px-8 py-10">
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-green/70">
              Total a soltar
            </p>
            <p className="font-display text-7xl text-sa-green-ink leading-none mt-2">
              ${total().toFixed(2)}
            </p>
            <p className="font-mono text-sm text-sa-green-ink/60 mt-2">MXN · sin pelos en la lengua</p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-md">
            <button
              onClick={() => setMetodo('terminal')}
              className={`flex items-center gap-5 p-6 rounded-sa-lg transition-all text-left ${
                metodo === 'terminal'
                  ? 'bg-sa-cream-soft ring-4 ring-sa-green shadow-sa'
                  : 'bg-sa-cream-soft hover:bg-sa-cream shadow-sa-sm'
              }`}
            >
              <span className="text-sa-green-ink/70"><IconCard /></span>
              <div>
                <p className="font-display text-2xl text-sa-green-ink leading-tight">Terminal</p>
                <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                  Mercado Pago · tarjeta
                </p>
              </div>
            </button>

            <button
              onClick={() => setMetodo('efectivo')}
              className={`flex items-center gap-5 p-6 rounded-sa-lg transition-all text-left ${
                metodo === 'efectivo'
                  ? 'bg-sa-cream-soft ring-4 ring-sa-green shadow-sa'
                  : 'bg-sa-cream-soft hover:bg-sa-cream shadow-sa-sm'
              }`}
            >
              <span className="text-sa-green-ink/70"><IconCash /></span>
              <div>
                <p className="font-display text-2xl text-sa-green-ink leading-tight">Efectivo</p>
                <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                  Paga en caja · billete en mano
                </p>
              </div>
            </button>
          </div>

          {error && (
            <p className="font-mono text-sm text-sa-strawberry text-center max-w-md">{error}</p>
          )}
        </main>

        <footer className="px-8 py-6 bg-sa-cream-paper">
          <button
            onClick={confirmarPago}
            disabled={!metodo}
            className="w-full bg-sa-strawberry disabled:bg-sa-cream-warm disabled:text-sa-green-ink/40 text-white py-5 rounded-full font-display text-3xl shadow-sa-sm active:scale-[0.98] transition-transform"
          >
            Confirmar pago
          </button>
        </footer>
      </div>
    </>
  )
}
