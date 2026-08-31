import { useEffect, useState } from 'react'
import {
  listarImpresoras, calibrarImpresora, probarImpresora, type ImpresoraAdmin,
} from '@shake/supabase'
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
  const [probada, setProbada] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || impresoras) return
    listarImpresoras(sb)
      .then((l) => setImpresoras(l.filter((i) => i.activa)))
      .catch((e) => setError(mensajeDeError(e)))
  }, [abierto, impresoras])

  async function calibrar(i: ImpresoraAdmin) {
    setOcupada(i.id)
    setHecho(null); setProbada(null); setError(null)
    try {
      await calibrarImpresora(sb, i.id)
      setHecho(i.nombre)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupada(null)
    }
  }

  /**
   * Una sola etiqueta, sin calibrar.
   *
   * Contesta la pregunta que de otro modo hay que adivinar: calibrar gasta
   * dos o tres etiquetas a propósito, y una impresora mal medida las escupe
   * en CADA comanda. Si esto saca una sola, lo normal está bien.
   */
  async function probar(i: ImpresoraAdmin) {
    setOcupada(i.id)
    setHecho(null); setProbada(null); setError(null)
    try {
      await probarImpresora(sb, i.id)
      setProbada(i.nombre)
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
      <p className="text-xs text-sa-green-ink/65 mt-2 leading-relaxed">
        ¿Solo quieres saber si imprime bien? Dale a <strong className="text-sa-green-ink">
        Probar</strong>: gasta <strong className="text-sa-green-ink">una</strong>. Si sale
        una sola y derecha, no hace falta calibrar.
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
      {probada && (
        <p className="font-mono text-xs text-sa-green bg-sa-mint/25 rounded-sa px-3 py-2 mt-3 leading-relaxed">
          Mandada a {probada}. Debe salir UNA sola etiqueta que dice “PRUEBA”.
          Si salen blancas antes, o sale corrida, ahí sí calibra.
        </p>
      )}

      <div className="flex flex-col gap-2 mt-3">
        {impresoras?.map((i) => (
          <div
            key={i.id}
            className="bg-white border border-sa-green-ink/15 rounded-sa px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-base truncate text-sa-green-ink">{i.nombre}</span>
              {!i.conectada && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-sa-strawberry shrink-0">
                  Sin señal
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              {/* Probar primero: gasta una etiqueta, no tres. */}
              <button
                onClick={() => void probar(i)}
                disabled={ocupada === i.id}
                className="flex-1 border border-sa-green text-sa-green-ink disabled:opacity-40 py-2 rounded-sa font-mono text-[10px] uppercase tracking-wider"
              >
                {ocupada === i.id ? 'Mandando…' : 'Probar · gasta 1'}
              </button>
              <button
                onClick={() => void calibrar(i)}
                disabled={ocupada === i.id}
                className="flex-1 bg-sa-strawberry text-white disabled:opacity-40 py-2 rounded-sa font-mono text-[10px] uppercase tracking-wider"
              >
                {ocupada === i.id ? 'Mandando…' : 'Calibrar · gasta 3'}
              </button>
            </div>
          </div>
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
