import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import QRCode from 'qrcode'
import { imprimirTicket, type TicketData } from '@shake/ui'
import { cerrarSesion } from '@shake/supabase'
import { sb } from '@/lib/sb'
import type { ItemCarrito, UsuarioKiosko } from '@/store/carritoStore'

interface EstadoConfirmacion {
  folio?: string | null
  total?: number
  metodo?: 'terminal' | 'efectivo'
  items?: ItemCarrito[]
  usuario?: UsuarioKiosko | null
}

export function Confirmacion() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as EstadoConfirmacion | null) ?? {}

  const folioReal  = state.folio  ?? null
  const totalOrden = state.total  ?? 0
  const metodo     = state.metodo ?? 'efectivo'
  const items      = state.items  ?? []
  const usuario    = state.usuario ?? null

  const [segundos, setSegundos] = useState(15)
  const [qrUrl, setQrUrl] = useState<string>('')
  const [mostrarQr, setMostrarQr] = useState(false)

  const fallbackNumero = useMemo(
    () => Math.floor(100 + Math.random() * 900).toString().padStart(3, '0'),
    [],
  )
  const numeroOrden   = folioReal ?? fallbackNumero
  const puntosGanados = usuario?.clienteId ? Math.floor(totalOrden / 10) : 0

  useEffect(() => {
    const data = JSON.stringify({
      folio: numeroOrden,
      tienda: 'Shake Aholic',
      total: totalOrden,
      fecha: new Date().toISOString().slice(0, 10),
      ...(usuario ? { cliente: usuario.nombre } : {}),
    })
    QRCode.toDataURL(data, { width: 240, margin: 2, color: { dark: '#14241D', light: '#F8F4EC' } })
      .then(setQrUrl)
      .catch(console.error)
  }, [numeroOrden, totalOrden, usuario])

  useEffect(() => {
    const timer = setTimeout(async () => {
      await cerrarSesion(sb).catch(console.error)
      navigate('/catalogo')
    }, 15000)
    const tick = setInterval(() => setSegundos((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => { clearTimeout(timer); clearInterval(tick) }
  }, [navigate])

  function handleImprimir() {
    const ticket: TicketData = {
      folio: numeroOrden,
      fecha: new Date(),
      canal: 'Kiosko',
      items: items.map((i) => ({
        cantidad: i.cantidad,
        nombre: i.nombre,
        precioUnitario: i.precio,
      })),
      metodoPago: metodo === 'terminal' ? 'Clip · Terminal' : 'Efectivo',
      clienteNombre: usuario?.nombre,
      mancuernasGanadas: usuario?.clienteId ? Math.floor(totalOrden / 10) : undefined,
    }
    imprimirTicket(ticket)
  }

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-sa-green-deep text-sa-cream overflow-hidden px-8">
      <span className="absolute top-10 left-10 font-mono text-xs uppercase tracking-[0.3em] text-sa-banana">
        #ORDEN {numeroOrden}
      </span>
      <span className="absolute top-10 right-10 font-mono text-xs uppercase tracking-[0.3em] text-sa-cream/60">
        Shake Aholic
      </span>

      <img src="/milo.png" alt="Milo celebrando" className="h-44 w-auto drop-shadow-2xl mb-3" />

      <h1 className="font-display text-5xl leading-none text-center text-sa-cream">
        ¡Listo, campeón!
      </h1>
      <p className="font-body text-base mt-3 text-center text-sa-cream/80 max-w-sm">
        Estamos agitando lo tuyo. Sin polvo raro, sin pose fitness.
      </p>

      {/* Loyalty earned */}
      {puntosGanados > 0 && (
        <div className="mt-3 bg-sa-banana/20 border border-sa-banana/40 rounded-sa px-5 py-2 flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <p className="font-display text-lg text-sa-banana">
            +{puntosGanados} puntos para {usuario?.nombre?.split(' ')[0]}
          </p>
        </div>
      )}

      {/* Info row */}
      <div className="mt-4 flex items-center gap-4">
        <div className="bg-sa-green-ink rounded-sa-lg px-6 py-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">Orden</p>
          <p className="font-display text-4xl text-sa-cream mt-1 leading-none">#{numeroOrden}</p>
        </div>
        <div className="bg-sa-green-ink rounded-sa-lg px-6 py-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">Listo en</p>
          <p className="font-display text-4xl text-sa-cream mt-1 leading-none">5 min</p>
        </div>
        <div className="bg-sa-green-ink rounded-sa-lg px-6 py-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">Total</p>
          <p className="font-display text-4xl text-sa-cream mt-1 leading-none">${totalOrden.toFixed(0)}</p>
        </div>
      </div>

      {/* Actions row */}
      <div className="mt-5 flex flex-col items-center gap-3 w-full max-w-xs">
        {/* Print ticket */}
        <button
          onClick={handleImprimir}
          className="w-full flex items-center justify-center gap-2 bg-sa-cream text-sa-green-ink px-6 py-3 rounded-full font-display text-xl shadow-sa active:scale-95 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Imprimir ticket
        </button>

        {/* QR digital */}
        {mostrarQr ? (
          <div className="flex flex-col items-center gap-1">
            {qrUrl && <img src={qrUrl} alt="QR recibo" className="w-36 h-36 rounded-sa shadow-lg" />}
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-cream/50">
              Recibo digital
            </p>
          </div>
        ) : (
          <button
            onClick={() => setMostrarQr(true)}
            className="flex items-center gap-2 border border-sa-cream/20 hover:border-sa-cream/50 text-sa-cream/60 hover:text-sa-cream px-5 py-2.5 rounded-sa transition-colors font-mono text-xs uppercase tracking-wide"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Ver recibo digital (QR)
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-cream/50">
          Menú en {segundos}s
        </p>
        <button
          onClick={() => navigate('/catalogo')}
          className="bg-sa-strawberry text-white px-8 h-12 rounded-full font-display text-xl shadow-sa active:scale-95 transition-transform"
        >
          Otro round
        </button>
      </div>
    </div>
  )
}
