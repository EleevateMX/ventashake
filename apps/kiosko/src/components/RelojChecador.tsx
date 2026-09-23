import { useState } from 'react'
import {
  checar, estadoChecador,
  type Checada, type EstadoChecador, type TipoChecada,
} from '@shake/supabase'
import { idDePantalla, mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * El reloj checador: entrada y salida con el PIN de siempre.
 *
 * Va **aparte del corte de caja** a propósito. Quien está en cocina nunca
 * abre la caja, y amarrar la checada al turno de caja lo dejaría sin poder
 * checar. También por eso se puede checar sin que haya turno abierto: el
 * primero que llega checa y *luego* abre la caja.
 *
 * Con cuatro tipos de checada —entrada, comida, regreso, salida— deducir
 * sola cuál toca deja de ser seguro. Así que la pantalla **pregunta** en
 * qué estado está cada quien y solo ofrece los botones que existen: un
 * botón de «salir a comer» para alguien que ni ha entrado es un dato malo
 * esperando a que alguien lo toque. El servidor vuelve a validar la
 * transición de todos modos, porque una pantalla puede quedarse vieja.
 *
 * La hora que se muestra es la que devolvió el servidor, no la del
 * navegador: si la pantalla calculara la hora, cambiarle el reloj a la PC
 * bastaría para falsear un turno.
 */
export function RelojChecador({ onCerrar }: { onCerrar: () => void }) {
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<EstadoChecador | null>(null)
  const [hecho, setHecho] = useState<Checada | null>(null)

  /** Paso 1: el PIN solo dice quién eres y qué puedes hacer ahora. */
  async function preguntar(completo: string) {
    setEnviando(true)
    setError(null)
    try {
      setEstado(await estadoChecador(sb, completo))
    } catch (e) {
      setError(mensajeDeError(e))
      setPin('')
    } finally {
      setEnviando(false)
    }
  }

  /** Paso 2: se registra lo que el servidor dijo que se podía. */
  async function mandar(tipo: TipoChecada) {
    setEnviando(true)
    setError(null)
    try {
      setHecho(await checar(sb, pin, idDePantalla('kiosko'), tipo))
      // Se queda en pantalla un momento y se cierra solo: nadie tiene que
      // buscar el botón de cerrar con las manos ocupadas.
      setTimeout(onCerrar, 4000)
    } catch (e) {
      setError(mensajeDeError(e))
      setEstado(null)
      setPin('')
    } finally {
      setEnviando(false)
    }
  }

  function teclear(d: string) {
    const nuevo = (pin + d).slice(0, 6)
    setPin(nuevo)
    setError(null)
    // Hay PINes de 4 y de 6 dígitos: a los 6 se manda solo; con 4 o 5 se
    // usa el botón. Es la misma regla del corte, para no enseñar dos.
    if (nuevo.length === 6) void preguntar(nuevo)
  }

  if (hecho) {
    const entro = hecho.tipo === 'entrada'
    const horas = hecho.minutos != null ? Math.floor(hecho.minutos / 60) : 0
    const mins = hecho.minutos != null ? hecho.minutos % 60 : 0
    const TITULOS: Record<TipoChecada, string> = {
      entrada: 'Entrada registrada',
      salida: 'Salida registrada',
      inicio_comida: 'Buen provecho',
      fin_comida: 'De vuelta',
    }
    const SALUDOS: Record<TipoChecada, string> = {
      entrada: '¡Buen turno',
      salida: 'Hasta luego',
      inicio_comida: 'Disfruta tu comida',
      fin_comida: 'Bienvenido de vuelta',
    }
    return (
      <div className="fixed inset-0 z-50 bg-sa-green-ink/70 flex items-center justify-center p-6">
        <div className="bg-sa-cream-paper rounded-sa-lg max-w-md w-full p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-sa-green/70">
            {hecho.repetida ? 'Ya habías checado' : TITULOS[hecho.tipo]}
          </p>
          <p className="font-display text-4xl text-sa-green-ink mt-3 leading-tight">
            {SALUDOS[hecho.tipo]}, {hecho.nombre.split(' ')[0]}
            {entro ? '!' : '.'}
          </p>
          <p className="font-display text-6xl text-sa-green mt-6">{hecho.hora}</p>
          {hecho.minutos != null && (
            <p className="font-mono text-sm text-sa-green-ink/60 mt-3">
              {hecho.tipo === 'salida'
                ? `Turno de ${horas} h ${mins} min`
                : `Comiste ${hecho.minutos} min`}
            </p>
          )}
          {hecho.repetida && (
            <p className="text-sm text-sa-green-ink/60 mt-4 leading-relaxed">
              Esta es la checada que ya tenías. No se registró otra.
            </p>
          )}
          <button
            onClick={onCerrar}
            className="mt-8 w-full bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-xl"
          >
            Listo
          </button>
        </div>
      </div>
    )
  }

  // Paso 2: qué puede hacer esta persona ahora mismo. Los botones salen
  // de `estado.puede`, que lo arma el servidor — no hay uno escrito aquí
  // que pueda quedarse ofreciendo algo imposible.
  if (estado) {
    const ETIQUETAS: Record<TipoChecada, string> = {
      entrada: 'Entrada',
      salida: 'Salida',
      inicio_comida: 'Salgo a comer',
      fin_comida: 'Regresé de comer',
    }
    const CONTEXTO: Record<EstadoChecador['estado'], string> = {
      fuera: 'No tienes turno abierto',
      dentro: 'Llevas turno abierto desde las',
      comiendo: 'Saliste a comer a las',
    }
    return (
      <div className="fixed inset-0 z-50 bg-sa-green-ink/70 flex items-center justify-center p-6">
        <div className="bg-sa-cream-paper rounded-sa-lg max-w-md w-full p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-sa-green/70">
            Hola, {estado.nombre.split(' ')[0]}
          </p>
          <p className="font-display text-2xl text-sa-green-ink mt-2 leading-tight">
            {CONTEXTO[estado.estado]} {estado.desde_hora ?? ''}
          </p>

          {error && (
            <p className="bg-sa-strawberry/10 border border-sa-strawberry/30 text-sa-strawberry rounded-sa px-4 py-3 text-sm mt-4">
              {error}
            </p>
          )}

          <div className="space-y-3 mt-6">
            {estado.puede.map((t) => (
              <button
                key={t}
                onClick={() => void mandar(t)}
                disabled={enviando}
                className={`w-full py-5 rounded-sa-lg font-display text-2xl disabled:opacity-40 ${
                  t === 'salida'
                    ? 'bg-white border-2 border-sa-green text-sa-green-ink'
                    : 'bg-sa-green text-sa-cream'
                }`}
              >
                {ETIQUETAS[t]}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setEstado(null); setPin('') }}
            className="mt-5 w-full py-3 font-mono text-xs uppercase tracking-wide text-sa-green-ink/50"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-ink/70 flex items-center justify-center p-6">
      <div className="bg-sa-cream-paper rounded-sa-lg max-w-md w-full p-8">
        <div className="flex items-start justify-between gap-4 mb-1">
          <p className="font-display text-3xl text-sa-green-ink leading-tight">
            Checar
          </p>
          <button
            onClick={onCerrar}
            className="w-11 h-11 shrink-0 rounded-full bg-white border border-sa-green-ink/15 text-2xl text-sa-green-ink/60"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/50 mb-6">
          Tu PIN de personal · la hora la pone el sistema
        </p>

        <div className="flex justify-center gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full ${
                i < pin.length ? 'bg-sa-green' : 'bg-sa-green-ink/15'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="bg-sa-strawberry/10 border border-sa-strawberry/30 text-sa-strawberry rounded-sa px-4 py-3 text-sm mb-4">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => teclear(d)}
              disabled={enviando}
              className="py-5 rounded-sa-lg bg-white border border-sa-green-ink/10 font-display text-3xl text-sa-green-ink active:bg-sa-cream-soft disabled:opacity-40"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => { setPin(pin.slice(0, -1)); setError(null) }}
            disabled={enviando}
            className="py-5 rounded-sa-lg bg-white border border-sa-green-ink/10 font-mono text-sm text-sa-green-ink/60 disabled:opacity-40"
          >
            Borrar
          </button>
          <button
            onClick={() => teclear('0')}
            disabled={enviando}
            className="py-5 rounded-sa-lg bg-white border border-sa-green-ink/10 font-display text-3xl text-sa-green-ink active:bg-sa-cream-soft disabled:opacity-40"
          >
            0
          </button>
          <button
            onClick={() => pin.length >= 4 && void preguntar(pin)}
            disabled={enviando || pin.length < 4}
            className="py-5 rounded-sa-lg bg-sa-green text-sa-cream font-display text-xl disabled:opacity-40"
          >
            {enviando ? '…' : 'Checar'}
          </button>
        </div>
      </div>
    </div>
  )
}
