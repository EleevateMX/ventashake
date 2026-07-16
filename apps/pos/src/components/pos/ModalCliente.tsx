import React, { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { sb } from '../../lib/sb'
import { identificarCliente, promosParaCliente } from '@shake/supabase'
import type { ClienteConLealtad } from '@shake/supabase'
import type { Promocion } from '@shake/types'

interface Props {
  open: boolean
  onClose: () => void
  onCliente: (cliente: ClienteConLealtad, promos: Promocion[]) => void
  onQuitar: () => void
}

export function ModalCliente({ open, onClose, onCliente, onQuitar }: Props) {
  const clienteActivo = usePosStore((s) => s.cliente)
  const [busqueda, setBusqueda] = useState('')
  const [encontrado, setEncontrado] = useState<ClienteConLealtad | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  if (!open) return null

  async function buscar() {
    setMsg(null)
    setEncontrado(null)
    setBuscando(true)
    try {
      const c = await identificarCliente(sb, busqueda)
      if (!c) setMsg('Cliente no encontrado.')
      else setEncontrado(c)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBuscando(false)
    }
  }

  async function seleccionar(c: ClienteConLealtad) {
    const promos = await promosParaCliente(sb, c.id).catch(() => [])
    onCliente(c, promos)
    setBusqueda('')
    setEncontrado(null)
    setMsg(null)
    onClose()
  }

  function quitar() {
    onQuitar()
    setBusqueda('')
    setEncontrado(null)
    setMsg(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-sa-green-deep/60" onClick={onClose} />
      <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-sm">
        <div className="px-5 py-4 border-b border-sa-green-ink/10 flex items-center justify-between">
          <h3 className="font-display text-2xl text-sa-green-ink">Identificar cliente</h3>
          {clienteActivo && (
            <button
              onClick={quitar}
              className="font-mono text-xs uppercase tracking-wide text-sa-strawberry hover:brightness-110"
            >
              Quitar
            </button>
          )}
        </div>

        <div className="p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }}
              placeholder="Teléfono o QR (SHK-…)"
              className="flex-1 px-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-body text-sm text-sa-green-ink placeholder:font-mono placeholder:text-sa-green-ink/40 focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              autoFocus
            />
            <button
              onClick={() => void buscar()}
              disabled={buscando || !busqueda.trim()}
              className="px-4 py-2 bg-sa-green disabled:opacity-40 text-sa-cream rounded-sa font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
            >
              {buscando ? '…' : 'Buscar'}
            </button>
          </div>
          {msg && <p className="font-mono text-xs text-sa-strawberry mt-2">{msg}</p>}
        </div>

        {encontrado && (
          <div className="px-4 pb-4">
            <button
              onClick={() => void seleccionar(encontrado)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-sa bg-white border-2 border-sa-green hover:bg-sa-cream-warm/40 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-sa-green flex items-center justify-center text-sa-cream font-display text-xl flex-shrink-0">
                {encontrado.nombre[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base text-sa-green-ink leading-tight">{encontrado.nombre}</p>
                <div className="flex gap-3 mt-1">
                  <span className="font-mono text-xs text-sa-green-ink/60">🏋️ {encontrado.mancuernas} mancuernas</span>
                  {encontrado.cupones.length > 0 && (
                    <span className="font-mono text-xs text-sa-blueberry">
                      🎁 {encontrado.cupones.length} cupón{encontrado.cupones.length === 1 ? '' : 'es'}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sa-green text-lg flex-shrink-0">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
