import { useEffect, useState } from 'react'
import { listarImpresoras, calibrarImpresora, type ImpresoraAdmin } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * Calibrar la etiquetadora tras cambiar el rollo, desde el kiosko.
 *
 * Vive aquí y no solo en el POS por una razón práctica: en la PC de la
 * tienda el POS **no queda abierto** (lo abre `abrir-caja-y-admin.bat`
 * cuando hace falta), mientras que el kiosko está encendido todo el día
 * frente a la barra. Quien cambia el rollo no debería tener que abrir otro
 * programa para arreglar lo que acaba de tocar.
 *
 * Va dentro del panel de Milo, o sea detrás del PIN: no es algo que un
 * cliente deba poder disparar desde el menú.
 */
export function CalibrarRollo() {
  const [impresoras, setImpresoras] = useState<ImpresoraAdmin[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || impresoras) return
    listarImpresoras(sb)
      .then((l) => setImpresoras(l.filter((i) => i.activa)))
      .catch((e) => setError(mensajeDeError(e)))
  }, [abierto, impresoras])

  async function calibrar(i: ImpresoraAdmin) {
    setOcupada(i.id)
    setHecho(null)
    setError(null)
    try {
      await calibrarImpresora(sb, i.id)
      setHecho(i.nombre)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupada(null)
    }
  }

  // Plegado por omisión: el 99% de las veces se entra aquí a abrir o cerrar
  // turno, y este bloque no debe estorbar ese camino.
  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full mt-5 border border-dashed border-sa-green-ink/20 text-sa-green-ink/60 py-3 rounded-sa font-mono text-[11px] uppercase tracking-wider hover:border-sa-green-ink/40 transition-colors"
      >
        ¿Cambiaste el rollo de etiquetas?
      </button>
    )
  }

  return (
    <div className="mt-5 border border-sa-green-ink/10 bg-sa-cream-soft rounded-sa p-4">
      <p className="font-display text-lg text-sa-green-ink leading-snug">
        Calibra después de cambiar el rollo
      </p>
      <p className="text-xs text-sa-green-ink/65 mt-1.5 leading-relaxed">
        La impresora tiene que volver a medir dónde termina una etiqueta y
        empieza la siguiente. Avanza dos o tres y saca una de prueba:
        <strong className="text-sa-green-ink"> si esa sale derecha, quedó.</strong>
      </p>

      {error && (
        <p className="font-mono text-xs text-sa-strawberry bg-sa-strawberry/10 rounded-sa px-3 py-2 mt-3">
          {error}
        </p>
      )}
      {hecho && (
        <p className="font-mono text-xs text-sa-green bg-sa-mint/25 rounded-sa px-3 py-2 mt-3">
          Mandada a {hecho}. En unos segundos avanza el papel.
        </p>
      )}

      <div className="flex flex-col gap-2 mt-3">
        {impresoras?.map((i) => (
          <button
            key={i.id}
            onClick={() => void calibrar(i)}
            disabled={ocupada === i.id}
            className="w-full flex items-center justify-between gap-3 bg-white border border-sa-green-ink/15 hover:border-sa-green disabled:opacity-40 text-sa-green-ink px-4 py-3 rounded-sa transition-colors"
          >
            <span className="font-display text-base truncate">{i.nombre}</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-sa-strawberry shrink-0">
              {ocupada === i.id ? 'Mandando…' : i.conectada ? 'Calibrar' : 'Sin señal'}
            </span>
          </button>
        ))}
        {impresoras?.length === 0 && (
          <p className="font-mono text-xs text-sa-green-ink/50">
            No hay impresoras activas.
          </p>
        )}
        {!impresoras && !error && (
          <p className="font-mono text-xs text-sa-green-ink/40 animate-pulse">Buscando…</p>
        )}
      </div>

      <button
        onClick={() => setAbierto(false)}
        className="w-full mt-3 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40"
      >
        Ocultar
      </button>
    </div>
  )
}
