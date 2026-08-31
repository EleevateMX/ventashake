import { useState } from 'react'
import { reportarSoporte } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * Pedir un cambio, o avisar de algo roto, desde la barra.
 *
 * Vive aquí —dentro del panel de Milo, detrás del PIN— porque es donde el
 * personal ya entra a diario a abrir y cerrar turno. Pedirle a alguien que
 * abra Admin para escribir una idea es pedirle que no la escriba: para
 * cuando termine el turno ya se le olvidó.
 *
 * Va plegado y al final: quien entra aquí viene a abrir la caja, no a
 * escribir. Pero cuando se acuerda de algo, está a un toque.
 */
export function PedirCambio() {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'peticion' | 'falla'>('peticion')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    setEnviando(true)
    setError(null)
    try {
      await reportarSoporte(sb, texto.trim(), null, { origen: 'Kiosko' }, tipo)
      setTexto('')
      setListo(true)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full mt-3 border border-dashed border-sa-green-ink/20 text-sa-green-ink/60 py-3 rounded-sa font-mono text-[11px] uppercase tracking-wider hover:border-sa-green-ink/40 transition-colors"
      >
        ¿Se te ocurre algo? ¿Algo no sirve?
      </button>
    )
  }

  if (listo) {
    return (
      <div className="mt-3 bg-sa-mint/25 rounded-sa p-4 text-center">
        <p className="font-display text-lg text-sa-green-ink">Anotado</p>
        <p className="text-xs text-sa-green-ink/70 mt-1 leading-relaxed">
          Queda en la lista y gerencia lo ve. Si es urgente y para la tienda
          ahora, además avisa por teléfono.
        </p>
        <button
          onClick={() => { setListo(false); setAbierto(false) }}
          className="mt-3 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50"
        >
          Cerrar
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 border border-sa-green-ink/10 bg-sa-cream-soft rounded-sa p-4">
      <div className="flex gap-2">
        {([
          { id: 'peticion' as const, label: 'Una idea' },
          { id: 'falla' as const, label: 'Algo no sirve' },
        ]).map((o) => (
          <button
            key={o.id}
            onClick={() => setTipo(o.id)}
            className={`flex-1 py-2 rounded-sa font-mono text-[11px] uppercase tracking-wider transition-colors ${
              tipo === o.id
                ? 'bg-sa-green-ink text-sa-cream'
                : 'bg-white text-sa-green-ink/60 border border-sa-green-ink/15'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <textarea
        className="w-full mt-3 rounded-sa border-2 border-sa-green-ink/15 bg-white px-4 py-3 text-sa-green-ink min-h-[90px] outline-none focus:border-sa-green"
        placeholder={
          tipo === 'peticion'
            ? 'Ej.: "Los clientes piden pagar mitad en efectivo y mitad con tarjeta."'
            : 'Ej.: "A las 2 le di cobrar y se quedó pensando, la etiqueta nunca salió."'
        }
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      {error && (
        <p className="font-mono text-xs text-sa-strawberry bg-sa-strawberry/10 rounded-sa px-3 py-2 mt-2">
          {error}
        </p>
      )}

      <p className="text-[11px] text-sa-green-ink/55 mt-2 leading-relaxed">
        Escríbelo como lo dirías. No hace falta que sepas cómo se arregla —
        para eso está del otro lado.
      </p>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => setAbierto(false)}
          className="px-4 py-3 rounded-sa font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/50"
        >
          Cancelar
        </button>
        <button
          onClick={() => void enviar()}
          disabled={enviando || texto.trim().length < 10}
          className="flex-1 bg-sa-green text-sa-cream py-3 rounded-sa font-display text-lg disabled:opacity-40 hover:brightness-110 transition-all"
        >
          {enviando ? 'Mandando…' : 'Mandar'}
        </button>
      </div>
    </div>
  )
}
