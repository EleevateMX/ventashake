import { useEffect, useMemo, useState } from 'react'
import { botesAbribles, abrirBoteParaBarra } from '@shake/supabase'
import type { BotesAbribles, BoteAbrible, ResultadoAbrirBote } from '@shake/supabase'
import { botesYScoops, mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * «¿Abriste un bote para la barra?» (10/10/26, pedido por Perla).
 *
 * En el kiosko hay dos inventarios de la misma proteína: los botes cerrados
 * que se venden («Chai 960gr», se cuentan por bote) y la de la barra que se
 * sirve por scoop («Chai»). Cuando se acaba la de la barra se abre uno de
 * venta, y eso hay que registrarlo: si no, el bote sigue contado en el
 * anaquel y la barra se va a negativo.
 *
 * El servidor dice cuál es de venta y cuál de barra (los precios de
 * Costeos) y sugiere a dónde va cada bote. Aquí solo se elige y se confirma.
 * Lo que viaja es el MOVIMIENTO —como en «¿Llegó mercancía?»—, no un total.
 */
export function AbrirBote() {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<BotesAbribles | null>(null)
  const [cargando, setCargando] = useState(false)
  const [busca, setBusca] = useState('')
  const [elegido, setElegido] = useState<BoteAbrible | null>(null)
  const [destino, setDestino] = useState('')
  const [botes, setBotes] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState<ResultadoAbrirBote | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || datos) return
    setCargando(true)
    botesAbribles(sb)
      .then((d) => { setDatos(d); setError(null) })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [abierto, datos])

  /** Sin búsqueda: los que sí hay en el anaquel. Con búsqueda: por nombre. */
  const lista = useMemo(() => {
    const v = datos?.venta ?? []
    const q = busca.trim().toLowerCase()
    if (q.length >= 2) return v.filter((b) => b.nombre.toLowerCase().includes(q)).slice(0, 12)
    return v.filter((b) => Number(b.en_kiosko) > 0).slice(0, 8)
  }, [datos, busca])

  const barra = datos?.barra ?? []
  const nombreDestino = barra.find((b) => b.insumo_id === destino)?.nombre

  function elegir(b: BoteAbrible) {
    setElegido(b)
    setDestino(b.destino_id ?? '')
    setBotes(1)
    setError(null)
  }

  function cerrar() {
    setAbierto(false); setElegido(null); setListo(null); setBusca(''); setError(null)
  }

  async function confirmar() {
    if (!elegido || !destino) return
    setGuardando(true)
    setError(null)
    try {
      const r = await abrirBoteParaBarra(sb, elegido.insumo_id, destino, botes)
      setListo(r)
      setElegido(null)
      setDatos(null) // los números cambiaron: la próxima vez se vuelven a pedir
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full mt-3 border border-dashed border-sa-green-ink/20 text-sa-green-ink/60 py-3 rounded-sa font-mono text-[11px] uppercase tracking-wider hover:border-sa-green-ink/40 transition-colors"
      >
        ¿Abriste un bote de venta para la barra?
      </button>
    )
  }

  if (listo) {
    const porBote = Number(listo.scoops_por_bote) || 0
    return (
      <div className="mt-3 bg-sa-mint/25 rounded-sa p-4">
        <p className="font-display text-lg text-sa-green-ink text-center">
          {listo.botes === 1 ? 'Bote abierto' : `${listo.botes} botes abiertos`}
        </p>
        <div className="mt-2 space-y-1 text-xs text-sa-green-ink/80">
          <div className="flex justify-between gap-3">
            <span>{listo.origen}</span>
            <span className="font-mono">quedan {botesYScoops(listo.origen_queda, porBote).texto}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>{listo.destino} (barra)</span>
            <span className="font-mono">+{Number(listo.scoops)} scoops</span>
          </div>
        </div>
        <button
          onClick={cerrar}
          className="w-full mt-3 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50"
        >
          Listo
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 bg-white rounded-sa p-4 shadow-sa-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg text-sa-green-ink">Abrir un bote para la barra</p>
        <button onClick={cerrar} className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40">
          Cerrar
        </button>
      </div>

      {!elegido && (
        <>
          <p className="text-xs text-sa-green-ink/60 mt-1 leading-relaxed">
            Elige el bote cerrado que abriste. Sale de los de venta y entra a la barra en scoops.
          </p>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={cargando ? 'Cargando…' : 'Busca: chai, vainilla, cbum…'}
            disabled={cargando}
            className="w-full mt-3 px-3 py-3 border border-sa-green-ink/15 rounded-sa text-base bg-white focus:outline-none focus:ring-2 focus:ring-sa-green/40"
          />
          {!cargando && lista.length === 0 && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40 mt-2 text-center">
              {busca.trim().length >= 2 ? 'Nada con ese nombre' : 'Escribe el nombre del bote'}
            </p>
          )}
          {lista.map((b) => (
            <button
              key={b.insumo_id}
              onClick={() => elegir(b)}
              className="w-full text-left border-b border-sa-green-ink/5 py-2.5 flex items-baseline justify-between gap-2"
            >
              <span className="text-sm text-sa-green-ink">{b.nombre}</span>
              <span className="font-mono text-[10px] text-sa-green-ink/50 whitespace-nowrap">
                hay {botesYScoops(b.en_kiosko, b.scoops_por_bote).texto}
              </span>
            </button>
          ))}
        </>
      )}

      {elegido && (
        <div className="mt-3">
          <p className="text-sm text-sa-green-ink font-medium">{elegido.nombre}</p>
          <p className="font-mono text-[10px] text-sa-green-ink/50">
            {Number(elegido.scoops_por_bote)} scoops por bote · hay {botesYScoops(elegido.en_kiosko, elegido.scoops_por_bote).texto}
          </p>

          <label className="block mt-3 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
            Va a la barra como
          </label>
          {/* Lo sugiere el servidor por marca y sabor; si no empató, se elige. */}
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="w-full mt-1 px-3 py-3 border border-sa-green-ink/15 rounded-sa text-sm bg-white"
          >
            <option value="">— Elige la proteína de la barra —</option>
            {barra.map((b) => (
              <option key={b.insumo_id} value={b.insumo_id}>{b.nombre}</option>
            ))}
          </select>

          <div className="flex items-center justify-between mt-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">Botes</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBotes((n) => Math.max(1, n - 1))}
                className="w-10 h-10 rounded-sa border border-sa-green-ink/15 text-sa-green-ink text-lg"
              >−</button>
              <span className="font-display text-2xl text-sa-green-ink w-8 text-center">{botes}</span>
              <button
                onClick={() => setBotes((n) => Math.min(20, n + 1))}
                className="w-10 h-10 rounded-sa border border-sa-green-ink/15 text-sa-green-ink text-lg"
              >+</button>
            </div>
          </div>

          {destino && (
            <p className="text-xs text-sa-green-ink/70 mt-3 leading-relaxed">
              Sale {botes === 1 ? '1 bote' : `${botes} botes`} de venta y entran{' '}
              <b>{Number(elegido.scoops_por_bote) * botes} scoops</b> a {nombreDestino}.
            </p>
          )}

          <button
            onClick={() => void confirmar()}
            disabled={!destino || guardando}
            className="w-full mt-3 bg-sa-green hover:brightness-110 disabled:opacity-50 text-sa-cream py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
          >
            {guardando ? 'Guardando…' : botes === 1 ? 'Abrir 1 bote' : `Abrir ${botes} botes`}
          </button>
          <button
            onClick={() => setElegido(null)}
            className="w-full mt-2 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50"
          >
            Elegir otro
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs bg-sa-strawberry/10 text-sa-strawberry rounded-sa px-3 py-2">{error}</p>
      )}
    </div>
  )
}
