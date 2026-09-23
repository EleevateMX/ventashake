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

  if (valor) {
    const restante = Math.max(valor.tope - valor.usado_importe, 0)
    return (
      <div className="w-full max-w-md">
        <label className="font-mono text-xs uppercase tracking-[0.25em] text-sa-green/70 block mb-2">
          Precio de personal
        </label>
        <div className="px-4 py-4 rounded-sa-lg border-2 border-sa-mint bg-sa-mint/15">
          <div className="flex items-start justify-between gap-3">
            <span>
              <span className="font-display text-2xl text-sa-green-ink leading-tight block">
                {valor.nombre}
              </span>
              {valor.motivo ? (
                <span className="font-mono text-[11px] text-sa-strawberry block mt-1">
                  {valor.motivo}
                </span>
              ) : (
                <span className="font-mono text-[11px] text-sa-green-ink/60 block mt-1">
                  Le quedan {mxn(restante)} de {mxn(valor.tope)} hoy
                </span>
              )}
            </span>
            <button
              onClick={() => { onCambio(null, null); setError(null) }}
              className="font-mono text-xs uppercase tracking-wide text-sa-strawberry underline flex-shrink-0"
            >
              Quitar
            </button>
          </div>

          {/* Lo que ya usó, por grupo. Los límites no se sustituyen entre
              sí, así que hay que verlos separados: "no pedí alimento" no
              da derecho a un segundo shake. */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {([
              ['Shake', valor.usado_shake, valor.max_shake],
              ['Alimento', valor.usado_alimento, valor.max_alimento],
              ['Bebida', valor.usado_bebida, valor.max_bebida],
            ] as const).map(([etiqueta, usado, max]) => (
              <span
                key={etiqueta}
                className={`px-3 py-1 rounded-sa font-mono text-[11px] uppercase tracking-wide ${
                  usado >= max
                    ? 'bg-sa-strawberry/20 text-sa-strawberry line-through'
                    : 'bg-white text-sa-green-ink/70'
                }`}
              >
                {etiqueta} {usado}/{max}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <label className="font-mono text-xs uppercase tracking-[0.25em] text-sa-green/70 block mb-2">
        Precio de personal
      </label>

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="w-full px-4 py-4 rounded-sa-lg border-2 border-sa-green-ink/15 bg-white text-sa-green-ink hover:border-sa-mint active:scale-95 transition-all"
        >
          <span className="font-display text-xl leading-tight">Es para personal</span>
          <span className="block font-mono text-[11px] text-sa-green-ink/50 mt-0.5 normal-case">
            Con su clave. Si no, se cobra normal
          </span>
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
