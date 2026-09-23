import { useState } from 'react'
import { identificarPersonal, type IdentidadPersonal } from '@shake/supabase'
import { mensajeDeError, mxn } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * Precio de personal: la clave de quien trabaja aquí.
 *
 * **La pantalla no calcula ni un peso.** Aquí solo se teclea la clave y se
 * enseña lo que el servidor contestó. Al cobrar,
 * `fn_crear_orden_personal` vuelve a validar todo —la clave, el turno
 * abierto y los límites del día— y calcula el descuento desde el
 * catálogo. Es la misma regla de siempre: el cliente nunca manda precios,
 * y aquí el cajero tampoco.
 *
 * Lo que sí hace la pantalla es **enseñar lo que le queda ANTES de
 * capturar**. Enterarse del límite al momento de cobrar es enterarse
 * tarde, con la fila esperando: se vería como un rechazo del sistema
 * cuando en realidad es una regla del negocio que se podía haber dicho a
 * tiempo.
 */

export function ClavePersonal({
  valor,
  onCambio,
}: {
  valor: IdentidadPersonal | null
  onCambio: (id: IdentidadPersonal | null, clave: string | null) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function identificar() {
    if (clave.trim().length < 4) return
    setEnviando(true); setError(null)
    try {
      const id = await identificarPersonal(sb, clave.trim())
      onCambio(id, clave.trim())
      setAbierto(false); setClave('')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally { setEnviando(false) }
  }

  // Aplicado: cabe en media fila. Lo que de verdad hay que ver al cobrar
  // es el nombre y cuánto le queda; el desglose por grupo ya se vio al
  // teclear la clave y repetirlo aquí solo empuja el teclado de efectivo
  // fuera de la pantalla.
  if (valor) {
    const restante = Math.max(valor.tope - valor.usado_importe, 0)
    return (
      <div className="flex-1 min-w-[45%]">
        <div className="px-3 py-2.5 rounded-sa border-2 border-sa-mint bg-sa-mint/15 flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="font-body text-sm text-sa-green-ink leading-tight block truncate">
              {valor.nombre}
            </span>
            <span
              className={`font-mono text-[10px] block leading-none mt-0.5 ${
                valor.motivo ? 'text-sa-strawberry' : 'text-sa-green-ink/60'
              }`}
            >
              {valor.motivo ?? `Le quedan ${mxn(restante)}`}
            </span>
          </span>
          <button
            onClick={() => { onCambio(null, null); setError(null) }}
            className="font-mono text-[10px] uppercase tracking-wide text-sa-strawberry underline flex-shrink-0"
          >
            Quitar
          </button>
        </div>
      </div>
    )
  }

  // Igual que el de la hora: cerrado ocupa media fila, abierto se lleva el
  // renglón entero. Lo resuelve el `flex-wrap` del padre.
  return (
    <div className={abierto ? 'w-full' : 'flex-1 min-w-[45%]'}>
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="w-full px-3 py-2.5 rounded-sa border border-sa-green-ink/15 bg-white text-sa-green-ink hover:border-sa-mint active:scale-95 transition-all text-left"
        >
          <span className="font-body text-sm leading-tight">👤 Es para personal</span>
        </button>
      ) : (
        <div className="p-4 rounded-sa-lg bg-white border border-sa-green-ink/10">
          {error && (
            <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-3 py-2 mb-3">
              <p className="text-sm text-sa-strawberry leading-snug">{error}</p>
            </div>
          )}
          <input
            value={clave}
            onChange={(e) => { setClave(e.target.value.replace(/\D/g, '').slice(0, 8)); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void identificar() }}
            inputMode="numeric"
            autoFocus
            placeholder="Su clave"
            className="w-full px-4 py-3 rounded-sa border-2 border-sa-green-ink/10 font-mono text-2xl text-center tracking-widest"
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => { setAbierto(false); setClave(''); setError(null) }}
              className="px-5 py-3 rounded-sa font-mono text-xs uppercase tracking-wide text-sa-green-ink/60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void identificar()}
              disabled={enviando || clave.trim().length < 4}
              className="flex-1 py-3 rounded-sa bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40"
            >
              {enviando ? 'Viendo…' : 'Aplicar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
