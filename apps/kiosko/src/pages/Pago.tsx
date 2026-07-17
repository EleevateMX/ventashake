import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearOrden, crearOrdenKioskoCaja, cobrarOrden, listarAlmacenes } from '@shake/supabase'
import { obtenerPaymentProvider } from '@shake/payments'
import type { Almacen } from '@shake/types'
import type { ModoPagoKiosko } from '@shake/types'
import { useCarrito } from '@/store/carritoStore'
import { sb } from '@/lib/sb'
import { resolverModoKiosko } from '@/lib/modoKiosko'

type EstadoPago = 'cargando' | 'eligiendo' | 'procesando' | 'no_disponible'

const IconCard = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
)

const IconCounter = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
  </svg>
)

function ProcesandoOverlay({ monto }: { monto: number }) {
  return (
    <div className="fixed inset-0 z-50 bg-sa-green-deep flex flex-col items-center justify-center gap-6 px-8 text-sa-cream">
      <svg className="animate-spin w-16 h-16 text-sa-banana" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="font-display text-3xl">Procesando…</p>
      <p className="font-display text-4xl">${monto.toFixed(2)}</p>
    </div>
  )
}

export function Pago() {
  const navigate = useNavigate()
  const { items, total, usuario, limpiar } = useCarrito()
  const [estado, setEstado] = useState<EstadoPago>('cargando')
  const [modo, setModo] = useState<ModoPagoKiosko | null>(null)
  const [almacen, setAlmacen] = useState<Almacen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorProveedor, setErrorProveedor] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const almacenes = await listarAlmacenes(sb)
        const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0] ?? null
        if (!kiosko) throw new Error('No hay almacén configurado para el kiosko.')
        setAlmacen(kiosko)
        const modoResuelto = await resolverModoKiosko(sb, kiosko.sucursal_id)
        setModo(modoResuelto)
        setEstado('eligiendo')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setEstado('eligiendo')
      }
    })()
  }, [])

  /**
   * Modo "pagar en caja": crea la orden en awaiting_counter_payment y
   * punto — NINGUNA venta se confirma aquí. El cliente se va a caja con
   * su folio/código; solo cuando el cajero la cobre desde POS se
   * descuenta inventario, se otorgan mancuernas y se generan comandas.
   */
  async function confirmarPagarEnCaja() {
    if (!almacen) return
    setEstado('procesando')
    setError(null)
    try {
      const orden = await crearOrdenKioskoCaja(
        sb,
        { sucursalId: almacen.sucursal_id, almacenId: almacen.id, clienteId: usuario?.clienteId ?? null },
        items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          personalizacion: i.personalizacion ?? null,
        })),
      )
      limpiar()
      navigate('/pagar-en-caja', { state: { orden } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEstado('eligiendo')
    }
  }

  /**
   * Modo "clip": SIEMPRE pasa por el proveedor de pagos real — nunca se
   * autoaprueba nada aquí. Mientras Clip no tenga credenciales
   * configuradas (ver supabase/functions/clip-crear-cobro), el proveedor
   * devuelve ok:false y se ofrece "pagar en caja" como salida segura.
   */
  async function confirmarClip() {
    if (!almacen) return
    setEstado('procesando')
    setError(null)
    setErrorProveedor(null)
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
        items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          personalizacion: i.personalizacion ?? null,
        })),
      )

      const proveedor = obtenerPaymentProvider('clip', sb)
      const resultado = await proveedor.createPayment({
        ordenId: orden.id,
        monto: orden.total,
        idempotencyKey: crypto.randomUUID(),
        sucursalId: almacen.sucursal_id,
      })

      if (!resultado.ok) {
        // La orden queda en pending_payment y expira sola (ver
        // configuracion_kiosko.expira_minutos) — no hace falta cancelarla
        // a mano. No se intenta ningún fallback automático a "aprobado".
        setErrorProveedor(resultado.error?.mensaje ?? 'Pago temporalmente no disponible.')
        setEstado('no_disponible')
        return
      }

      // A partir de aquí (cuando exista Clip real) el flujo esperado es:
      // mostrar "esperando confirmación" y depender del webhook
      // (clip-webhook) para que fn_confirmar_venta se dispare del lado
      // servidor — nunca confiar en la respuesta que ve el navegador.
      // Hoy este camino no se ejecuta porque createPayment() siempre
      // regresa ok:false sin credenciales configuradas.
      setErrorProveedor('Esperando confirmación del pago…')
      setEstado('no_disponible')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEstado('eligiendo')
    }
  }

  /**
   * Modo "demo": SOLO alcanzable si resolverModoKiosko() lo permitió (es
   * decir, nunca en un build de producción — ver lib/modoKiosko.ts). Usa
   * MockPaymentProvider (simulado, se niega a existir en build de
   * producción por su cuenta también) y crea la orden con
   * `es_demo=true`: se marca pagada para que la pantalla de confirmación
   * se vea completa, pero el trigger de inventario/cocina/mancuernas la
   * ignora por completo — cero efectos reales.
   */
  async function confirmarDemo() {
    if (!almacen) return
    setEstado('procesando')
    setError(null)
    try {
      const orden = await crearOrden(
        sb,
        {
          sucursal_id: almacen.sucursal_id,
          almacen_id: almacen.id,
          canal: 'kiosko',
          cliente_id: usuario?.clienteId ?? null,
          descuento: 0,
          es_demo: true,
        },
        items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          personalizacion: i.personalizacion ?? null,
        })),
      )

      const proveedor = obtenerPaymentProvider('demo', sb)
      const resultado = await proveedor.createPayment({
        ordenId: orden.id,
        monto: orden.total,
        idempotencyKey: crypto.randomUUID(),
        sucursalId: almacen.sucursal_id,
      })
      if (!resultado.ok) throw new Error(resultado.error?.mensaje ?? 'Fallo simulado')

      await cobrarOrden(sb, orden.id, 'clip', orden.total, { idempotencyKey: crypto.randomUUID() })

      const itemsSnapshot = [...items]
      limpiar()
      navigate('/confirmacion', {
        state: {
          folio: String(orden.folio),
          total: orden.total,
          metodo: 'terminal',
          items: itemsSnapshot,
          usuario: usuario ? { ...usuario } : null,
          demo: true,
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEstado('eligiendo')
    }
  }

  if (estado === 'cargando') {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-sa-cream-paper">
        <p className="font-mono text-sm text-sa-green-ink/50 animate-pulse">Cargando…</p>
      </div>
    )
  }

  if (estado === 'procesando') {
    return <ProcesandoOverlay monto={total()} />
  }

  if (estado === 'no_disponible') {
    return (
      <div className="flex flex-col h-screen items-center justify-center gap-6 px-8 bg-sa-cream-paper text-center">
        <div className="w-20 h-20 rounded-full bg-sa-strawberry/15 flex items-center justify-center">
          <span className="text-4xl">⚠️</span>
        </div>
        <h1 className="font-display text-3xl text-sa-green-ink">Pago temporalmente no disponible</h1>
        <p className="font-body text-sa-green-ink/60 max-w-sm">{errorProveedor}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => void confirmarPagarEnCaja()}
            className="bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-xl hover:bg-sa-green-deep transition-colors"
          >
            Pagar en caja
          </button>
          <button
            onClick={() => setEstado('eligiendo')}
            className="border border-sa-green-ink/15 text-sa-green-ink py-3 rounded-sa font-mono text-sm uppercase tracking-wide"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-sa-cream-paper">
      {modo === 'demo' && (
        <div className="bg-sa-banana text-sa-coffee text-center py-1.5 font-mono text-xs uppercase tracking-[0.3em]">
          ⚠ Modo demostración — ninguna venta es real
        </div>
      )}
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
          <p className="font-mono text-sm text-sa-green-ink/60 mt-2">MXN</p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-md">
          {modo === 'clip' && (
            <button
              onClick={() => void confirmarClip()}
              className="flex items-center gap-5 p-6 rounded-sa-lg bg-sa-cream-soft hover:bg-sa-cream shadow-sa-sm transition-all text-left"
            >
              <span className="text-sa-green-ink/70"><IconCard /></span>
              <div>
                <p className="font-display text-2xl text-sa-green-ink leading-tight">Terminal</p>
                <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                  Clip · tarjeta
                </p>
              </div>
            </button>
          )}

          {modo === 'pagar_en_caja' && (
            <button
              onClick={() => void confirmarPagarEnCaja()}
              className="flex items-center gap-5 p-6 rounded-sa-lg bg-sa-cream-soft hover:bg-sa-cream shadow-sa-sm transition-all text-left"
            >
              <span className="text-sa-green-ink/70"><IconCounter /></span>
              <div>
                <p className="font-display text-2xl text-sa-green-ink leading-tight">Pagar en caja</p>
                <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                  Toma tu folio y paga con el cajero
                </p>
              </div>
            </button>
          )}

          {modo === 'demo' && (
            <button
              onClick={() => void confirmarDemo()}
              className="flex items-center gap-5 p-6 rounded-sa-lg bg-sa-banana/20 hover:bg-sa-banana/30 shadow-sa-sm transition-all text-left border-2 border-dashed border-sa-banana"
            >
              <span className="text-sa-coffee"><IconCard /></span>
              <div>
                <p className="font-display text-2xl text-sa-green-ink leading-tight">Confirmar pago (demo)</p>
                <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                  Simulado — no descuenta inventario ni imprime nada real
                </p>
              </div>
            </button>
          )}
        </div>

        {error && (
          <p className="font-mono text-sm text-sa-strawberry text-center max-w-md">{error}</p>
        )}
      </main>
    </div>
  )
}
