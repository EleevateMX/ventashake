import { useEffect, useState } from 'react'
import {
  checar, estadoChecador,
  type Checada, type EstadoChecador, type TipoChecada,
} from '@shake/supabase'
import { idDePantalla, mensajeDeError } from '@shake/utils'
import { sb } from './lib/sb'
import { pedirUbicacion, type Ubicacion } from './lib/ubicacion'

/**
 * El checador desde el teléfono.
 *
 * **No es lo mismo que el de la barra, y la pantalla no finge que sí.**
 * El kiosko está clavado en la barra: que alguien cheque ahí prueba que
 * estuvo ahí. Un teléfono no prueba nada por sí solo — manda las
 * coordenadas que quiera. Por eso aquí:
 *
 * - La geocerca **la decide el servidor**. Esta pantalla solo entrega la
 *   lectura cruda del GPS; si se aprobara sola, no sería un control.
 * - Se dice **en la cara** que la ubicación queda guardada. Pedir el GPS
 *   de alguien sin decirle para qué es cómo se pierde la confianza del
 *   equipo, y este trato tiene que sostenerse todos los días.
 * - La hora que se muestra es **la que devolvió el servidor**. Si la
 *   pusiera el teléfono, cambiarle el reloj bastaría para falsear un turno.
 *
 * El PIN es la credencial, igual que en la barra, y reusa el mismo freno
 * de 15 intentos en 15 minutos.
 */

const ETIQUETAS: Record<TipoChecada, { boton: string; hecho: string }> = {
  entrada: { boton: 'Entré a trabajar', hecho: 'Entrada registrada' },
  inicio_comida: { boton: 'Salgo a comer', hecho: 'Que aproveche' },
  fin_comida: { boton: 'Regresé de comer', hecho: 'De vuelta' },
  salida: { boton: 'Me voy, salida', hecho: 'Salida registrada' },
}

const ESTADOS: Record<EstadoChecador['estado'], string> = {
  fuera: 'Ahorita estás fuera de turno',
  dentro: 'Tienes tu turno abierto',
  comiendo: 'Estás en tu comida',
}

export default function App() {
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<EstadoChecador | null>(null)
  const [hecho, setHecho] = useState<Checada | null>(null)
  const [donde, setDonde] = useState<Ubicacion | null>(null)
  const [buscando, setBuscando] = useState(false)

  /**
   * La ubicación se pide **en cuanto se sabe quién eres**, no al apretar
   * el botón: un GPS bajo techo tarda hasta quince segundos, y esos
   * quince segundos con el dedo en el aire se sienten como una pantalla
   * colgada. Así, para cuando lee los botones ya dice «ubicación lista».
   */
  useEffect(() => {
    if (!estado || donde || buscando) return
    setBuscando(true)
    pedirUbicacion()
      .then(setDonde)
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setBuscando(false))
  }, [estado, donde, buscando])

  async function preguntar(completo: string) {
    setEnviando(true); setError(null)
    try {
      setEstado(await estadoChecador(sb, completo))
    } catch (e) {
      setError(mensajeDeError(e)); setPin('')
    } finally { setEnviando(false) }
  }

  async function mandar(tipo: TipoChecada) {
    // Si el GPS aún no contesta, se vuelve a pedir en vez de mandar sin
    // ubicación: sin ella el servidor rechaza, y un rebote que se podía
    // evitar es un rebote que el equipo lee como «esto no sirve».
    let u = donde
    if (!u) {
      setBuscando(true)
      try { u = await pedirUbicacion(); setDonde(u) }
      catch (e) { setError(mensajeDeError(e)); setBuscando(false); return }
      setBuscando(false)
    }
    setEnviando(true); setError(null)
    try {
      setHecho(await checar(sb, pin, idDePantalla('telefono'), tipo, u))
    } catch (e) {
      setError(mensajeDeError(e)); setEstado(null); setPin('')
    } finally { setEnviando(false) }
  }

  function teclear(d: string) {
    const nuevo = (pin + d).slice(0, 6)
    setPin(nuevo)
    setError(null)
    if (nuevo.length === 6) void preguntar(nuevo)
  }

  function empezarDeNuevo() {
    setPin(''); setEstado(null); setHecho(null); setError(null)
  }

  // ------------------------------------------------------------- listo
  if (hecho) {
    const horas = hecho.minutos != null ? Math.floor(hecho.minutos / 60) : 0
    const mins = hecho.minutos != null ? hecho.minutos % 60 : 0
    return (
      <Marco>
        <div className="text-center py-10">
          <p className="text-6xl mb-4">{hecho.repetida ? '👌' : '✓'}</p>
          <p className="font-display text-4xl text-sa-cream leading-tight">
            {hecho.repetida ? 'Ya estaba' : ETIQUETAS[hecho.tipo].hecho}
          </p>
          <p className="text-xl text-sa-cream/80 mt-2">{hecho.nombre}</p>
          <p className="font-mono text-7xl text-sa-banana mt-6 tracking-tight">{hecho.hora}</p>
          {hecho.minutos != null && (
            <p className="text-sa-cream/70 mt-3">
              {hecho.tipo === 'salida' ? 'Turno de ' : 'Comida de '}
              {horas > 0 && `${horas} h `}{mins} min
            </p>
          )}
          {hecho.distancia_m != null && (
            <p className="font-mono text-xs text-sa-cream/45 mt-6 uppercase tracking-wide">
              Registrado a {hecho.distancia_m} m de la tienda
            </p>
          )}
          <button
            onClick={empezarDeNuevo}
            className="mt-10 px-8 py-4 rounded-sa-lg border border-sa-cream/25 text-sa-cream/80"
          >
            Listo
          </button>
        </div>
      </Marco>
    )
  }

  // ------------------------------------------------------- qué puedes hacer
  if (estado) {
    return (
      <Marco>
        <p className="font-display text-4xl text-sa-cream leading-tight">{estado.nombre}</p>
        <p className="text-sa-cream/70 mt-1">
          {ESTADOS[estado.estado]}
          {estado.desde_hora && ` desde las ${estado.desde_hora}`}
        </p>

        <div className="mt-4 mb-6">
          {donde ? (
            <p className="font-mono text-[11px] text-sa-mint uppercase tracking-wide">
              ● Ubicación lista{donde.precision_m != null && ` · ±${Math.round(donde.precision_m)} m`}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-sa-banana uppercase tracking-wide">
              ○ {buscando ? 'Buscando dónde estás…' : 'Sin ubicación todavía'}
            </p>
          )}
        </div>

        {error && <Aviso>{error}</Aviso>}

        <div className="space-y-3">
          {estado.puede.map((t) => (
            <button
              key={t}
              disabled={enviando}
              onClick={() => void mandar(t)}
              className="w-full py-6 rounded-sa-lg bg-sa-cream text-sa-green-ink font-display text-2xl disabled:opacity-40"
            >
              {ETIQUETAS[t].boton}
            </button>
          ))}
        </div>

        <button
          onClick={empezarDeNuevo}
          className="w-full mt-6 py-4 text-sa-cream/50 font-mono text-xs uppercase tracking-wide"
        >
          No soy yo
        </button>
      </Marco>
    )
  }

  // --------------------------------------------------------------- PIN
  return (
    <Marco>
      <p className="font-display text-4xl text-sa-cream leading-tight">Checar</p>
      <p className="text-sa-cream/60 mt-1 mb-6 text-sm leading-relaxed">
        Tu PIN, el mismo de siempre. Al checar se guarda <b>dónde estás</b>{' '}
        y la hora la pone el sistema.
      </p>

      <div className="flex justify-center gap-3 mb-7 h-6 items-center">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full transition-colors ${
              i < pin.length ? 'bg-sa-banana' : 'bg-sa-cream/15'
            }`}
          />
        ))}
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Tecla key={d} onClick={() => teclear(d)} disabled={enviando}>{d}</Tecla>
        ))}
        <Tecla onClick={() => setPin(pin.slice(0, -1))} disabled={enviando}>←</Tecla>
        <Tecla onClick={() => teclear('0')} disabled={enviando}>0</Tecla>
        <Tecla
          onClick={() => pin.length >= 4 && void preguntar(pin)}
          disabled={enviando || pin.length < 4}
        >
          ✓
        </Tecla>
      </div>

      <p className="text-center text-sa-cream/35 text-[11px] mt-7 leading-relaxed">
        Hay PIN de 4 y de 6 dígitos: con 6 entra solo, con 4 usa el ✓.
      </p>
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 max-w-md mx-auto">
      {children}
    </div>
  )
}

function Tecla({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="py-6 rounded-sa-lg bg-sa-cream/10 border border-sa-cream/10 text-sa-cream font-mono text-3xl active:bg-sa-cream/20 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-sa-strawberry/15 border border-sa-strawberry/40 rounded-sa px-4 py-3 mb-5">
      <p className="text-sa-cream text-sm leading-relaxed">{children}</p>
    </div>
  )
}
