import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { getResumenTurno, guardarCorte, isSupabaseConfigured } from '@pos/supabase'
import type { ResumenTurno } from '@pos/supabase'

const RESUMEN_VACIO: ResumenTurno = {
  efectivo: 0,
  tarjeta_credito: 0,
  tarjeta_debito: 0,
  qr: 0,
  wallet: 0,
  total: 0,
  ordenes: 0,
  ticket_promedio: 0,
}

export function CorteCaja() {
  const navigate = useNavigate()
  const { empleadoActivo, turnoInicio, sucursalId, cerrarSesion } = usePosStore()
  const [cortado, setCortado] = useState(false)
  const [notas, setNotas] = useState('')
  const [resumen, setResumen] = useState<ResumenTurno>(RESUMEN_VACIO)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCargando(false)
      return
    }
    const desde = turnoInicio ?? new Date().toISOString()
    getResumenTurno(sucursalId, desde)
      .then(setResumen)
      .catch(console.error)
      .finally(() => setCargando(false))
  }, [sucursalId, turnoInicio])

  async function realizarCorte() {
    if (!empleadoActivo) return
    setGuardando(true)
    try {
      if (isSupabaseConfigured) {
        await guardarCorte({
          sucursal_id: sucursalId,
          empleado_id: empleadoActivo.id,
          fecha_inicio: turnoInicio ?? new Date().toISOString(),
          fecha_fin: new Date().toISOString(),
          resumen,
          notas: notas.trim() || undefined,
        })
      }
    } catch (err) {
      console.error('Error guardando corte:', err)
    } finally {
      setGuardando(false)
      setCortado(true)
    }
  }

  if (cortado) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-sa-green-deep text-sa-cream gap-6 px-6">
        <img
          src="/milo-transparent.png"
          alt="Milo"
          className="w-48 h-48 drop-shadow-2xl"
        />
        <div className="text-center">
          <h1 className="font-display text-5xl text-sa-cream leading-tight">
            Buen turno, campeón
          </h1>
          <p className="font-mono text-sm uppercase tracking-widest text-sa-cream/60 mt-3">
            Total del turno
          </p>
          <p className="font-display text-4xl text-sa-banana mt-1">
            ${resumen.total.toFixed(2)}
          </p>
        </div>
        <button
          onClick={() => { cerrarSesion(); navigate('/login') }}
          className="bg-sa-strawberry hover:brightness-110 text-white px-10 py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all mt-4"
        >
          Cerrar sesión
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sa-cream-paper">
      {/* Hero */}
      <div className="bg-sa-green-deep text-sa-cream px-6 py-6">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-sa-cream/70 hover:text-sa-cream text-2xl"
          >
            ←
          </button>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">
              Cajero: {empleadoActivo?.nombre}
            </p>
            <h1 className="font-display text-3xl text-sa-cream leading-tight">
              Corte de caja
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {cargando ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-sa h-28" />
              <div className="bg-white rounded-sa h-28" />
            </div>
            <div className="bg-white rounded-sa h-48" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-sa p-5 shadow-sa-sm">
                <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">
                  Órdenes del turno
                </p>
                <p className="font-display text-5xl text-sa-green-ink mt-1">
                  {resumen.ordenes}
                </p>
              </div>
              <div className="bg-white rounded-sa p-5 shadow-sa-sm">
                <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">
                  Ticket promedio
                </p>
                <p className="font-display text-5xl text-sa-strawberry mt-1">
                  ${resumen.ticket_promedio.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Breakdown by method */}
            <div className="mb-6">
              <h3 className="font-display text-xl text-sa-green-ink mb-3">
                Desglose por método
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Efectivo', icon: '💵', value: resumen.efectivo },
                  { label: 'Tarjeta crédito', icon: '💳', value: resumen.tarjeta_credito },
                  { label: 'Tarjeta débito', icon: '💳', value: resumen.tarjeta_debito },
                  { label: 'QR', icon: '📱', value: resumen.qr },
                  { label: 'Wallet', icon: '💰', value: resumen.wallet },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center bg-sa-cream-soft rounded-sa px-5 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{row.icon}</span>
                      <span className="font-display text-base text-sa-green-ink">{row.label}</span>
                    </div>
                    <span
                      className={`font-mono text-lg ${
                        row.value > 0 ? 'text-sa-green-ink' : 'text-sa-green-ink/30'
                      }`}
                    >
                      ${row.value.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total block */}
            <div className="bg-sa-green-deep rounded-sa-lg px-6 py-5 mb-6 flex justify-between items-baseline">
              <span className="font-display text-2xl text-sa-cream">Total</span>
              <span className="font-display text-4xl text-sa-cream">
                ${resumen.total.toFixed(2)}
              </span>
            </div>

            {/* Notes */}
            <div className="bg-sa-cream-soft rounded-sa p-4 mb-6">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Notas del turno (opcional)
              </label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Incidencias, observaciones…"
                rows={3}
                className="w-full bg-white border border-sa-green-ink/10 rounded-sa px-3 py-2 text-sm text-sa-green-ink resize-none focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pb-6">
              <button
                onClick={() => navigate('/')}
                className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink py-4 rounded-sa-lg font-display text-base hover:bg-sa-cream-soft transition-colors"
              >
                Seguir agitando
              </button>
              <button
                onClick={realizarCorte}
                disabled={guardando}
                className="flex-1 bg-sa-strawberry disabled:opacity-50 hover:brightness-110 text-white py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
              >
                {guardando ? 'Guardando…' : 'Confirmar corte'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
