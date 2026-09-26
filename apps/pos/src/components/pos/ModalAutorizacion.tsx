import React, { useState } from 'react'
import { sb } from '../../lib/sb'
import { autorizarConPin, type Permiso } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'

interface Props {
  open: boolean
  /** Qué se está autorizando, p. ej. "aplicar un descuento" */
  accion: string
  /**
   * El permiso que tiene que tener quien autoriza (Admin → Personal →
   * Permisos). Antes se revisaba el ROL en esta pantalla —gerente o admin—,
   * así que no había forma de confiarle un descuento a un cajero de
   * confianza sin hacerlo gerente de todo.
   */
  permiso?: Permiso
  onClose: () => void
  /** Se entrega el PIN porque hay acciones que el servidor vuelve a validar con él (el corte). */
  onAutorizado: (nombreAutorizador: string, pin: string) => void
}

/**
 * Candado: pide un PIN y solo deja pasar si pertenece a un empleado activo
 * con ESE permiso. La comparación la hace el servidor (`fn_autorizar_con_pin`,
 * con el mismo freno de intentos que el checador) — el PIN nunca se compara
 * en el navegador ni sale el hash a la app.
 */
export function ModalAutorizacion({ open, accion, permiso = 'descuento_manual', onClose, onAutorizado }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [validando, setValidando] = useState(false)

  if (!open) return null

  async function autorizar() {
    if (pin.length < 4 || validando) return
    setValidando(true)
    setError(null)
    try {
      const quien = await autorizarConPin(sb, pin, permiso)
      const tecleado = pin
      setPin('')
      onAutorizado(quien.nombre, tecleado)
    } catch (e) {
      setError(mensajeDeError(e))
      setPin('')
    } finally {
      setValidando(false)
    }
  }

  function cerrar() {
    setPin('')
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-sa-green-deep/60" onClick={cerrar} />
      <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-xs p-6">
        <h3 className="font-display text-2xl text-sa-green-ink leading-tight">Autorización</h3>
        <p className="font-body text-sm text-sa-green-ink/60 mt-1 mb-4">
          Pide a quien tenga permiso su PIN para {accion}.
        </p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') void autorizar() }}
          placeholder="••••"
          maxLength={8}
          className="w-full px-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-center tracking-[0.5em] text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
          autoFocus
        />
        {error && <p className="font-mono text-xs text-sa-strawberry mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={cerrar}
            className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink/70 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-cream-warm"
          >
            Cancelar
          </button>
          <button
            onClick={() => void autorizar()}
            disabled={pin.length < 4 || validando}
            className="flex-1 bg-sa-green disabled:opacity-40 text-sa-cream py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
          >
            {validando ? 'Validando…' : 'Autorizar'}
          </button>
        </div>
      </div>
    </div>
  )
}
