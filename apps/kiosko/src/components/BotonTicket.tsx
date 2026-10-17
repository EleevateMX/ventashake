import React, { useEffect, useState } from 'react'
import { estadoTicketCaja, imprimirTicket } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * Ticket impreso de la caja, solo si el cliente lo pide (17/10/26).
 *
 * No sale solo en cada venta: casi nadie lo quiere y el papel se tira. El
 * botón lo manda a la impresora de tickets (`fn_ticket_imprimir`); la primera
 * vez es el ticket de siempre y después una copia marcada como reimpresión.
 * Si el ticket ya sale solo al cobrar (Admin → Ticket), el botón dice
 * «Reimprimir». Sin impresora de caja dada de alta, el botón no aparece.
 */

let estadoCache: Promise<{ hay_impresora: boolean; auto: boolean }> | null = null
function estado() {
  if (!estadoCache) {
    estadoCache = estadoTicketCaja(sb).catch(() => {
      estadoCache = null // que el siguiente intento vuelva a preguntar
      return { hay_impresora: false, auto: false }
    })
  }
  return estadoCache
}

interface Props {
  ordenId?: string | null
  folio?: number | null
  /** 'oscuro' sobre el verde de «¡Listo!»; 'claro' dentro del historial. */
  tono?: 'oscuro' | 'claro'
  compacto?: boolean
  /** En el historial ya existe un ticket (se cobró antes): siempre «Reimprimir». */
  reimprimir?: boolean
}

export function BotonTicket({ ordenId, folio, tono = 'oscuro', compacto = false, reimprimir = false }: Props) {
  const [info, setInfo] = useState<{ hay_impresora: boolean; auto: boolean } | null>(null)
  const [paso, setPaso] = useState<'listo' | 'enviando' | 'ok' | 'error'>('listo')
  const [mensaje, setMensaje] = useState('')

  useEffect(() => { void estado().then(setInfo) }, [])

  if (!info?.hay_impresora || (!ordenId && !folio)) return null

  const etiqueta = reimprimir || info.auto ? 'Reimprimir ticket' : 'Imprimir ticket'

  async function imprimir() {
    setPaso('enviando'); setMensaje('')
    try {
      const r = await imprimirTicket(sb, { ordenId, folio })
      if (r.estado === 'sin_impresora') { setPaso('error'); setMensaje('No hay impresora de tickets.'); return }
      setPaso('ok')
      setMensaje(r.estado === 'ya_en_cola' ? 'Ya va en camino' : 'Ticket en camino')
    } catch (e) {
      setPaso('error'); setMensaje(mensajeDeError(e))
    }
  }

  const base = tono === 'oscuro'
    ? 'border border-sa-cream/30 text-sa-cream hover:bg-sa-cream/10'
    : 'border border-sa-green-ink/20 text-sa-green-ink bg-white hover:bg-sa-cream-soft'
  const alto = compacto ? 'h-9 px-3 text-sm' : 'h-12 px-6 text-lg'

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void imprimir()}
        disabled={paso === 'enviando'}
        className={`${base} ${alto} rounded-full font-display active:scale-95 transition-all disabled:opacity-60`}
      >
        {paso === 'enviando' ? 'Mandando…' : paso === 'ok' ? `✓ ${mensaje}` : `🧾 ${etiqueta}`}
      </button>
      {paso === 'error' && (
        <span className={`font-mono text-[11px] max-w-[16rem] text-center ${tono === 'oscuro' ? 'text-sa-banana' : 'text-sa-strawberry'}`}>
          {mensaje}
        </span>
      )}
    </span>
  )
}
