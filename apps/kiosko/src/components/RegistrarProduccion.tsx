import { useEffect, useState } from 'react'
import { opcionesProduccion, registrarProduccion } from '@shake/supabase'
import type { Faltante, OpcionProduccion, ResultadoProduccion } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'
import { TecladoBusqueda } from '@/components/TecladoBusqueda'

/**
 * «¿Preparaste algo?» (24/10/26, pedido de Perla con la salsa chipotle).
 *
 * Se elige qué se preparó y cuántos lotes; el servidor saca del kiosko lo
 * que dice la receta de Costeo Alimentos y mete lo producido («Salsa
 * Chipotle Preparada»). La pantalla no sabe la receta: la enseña tal como
 * la manda el servidor, que la lee de lo que Costeos sincronizó.
 *
 * Si no alcanza el inventario, el servidor NO mueve nada y dice qué falta;
 * se puede registrar de todos modos con una nota. Si salió distinto de lo
 * esperado, también pide nota. El id de la producción se genera al elegir:
 * un doble toque no registra dos.
 */

const num = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('es-MX')

export function RegistrarProduccion() {
  const [abierto, setAbierto] = useState(false)
  const [opciones, setOpciones] = useState<OpcionProduccion[] | null>(null)
  const [elegida, setElegida] = useState<OpcionProduccion | null>(null)
  const [lotes, setLotes] = useState(1)
  const [cantidad, setCantidad] = useState(0)
  const [cantidadTocada, setCantidadTocada] = useState(false)
  const [nota, setNota] = useState('')
  const [teclado, setTeclado] = useState(false)
  const [faltantes, setFaltantes] = useState<Faltante[] | null>(null)
  const [id, setId] = useState(() => crypto.randomUUID())
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState<Extract<ResultadoProduccion, { ok: true }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || opciones) return
    opcionesProduccion(sb)
      .then((o) => { setOpciones(o); if (o.length === 1) elegir(o[0]) })
      .catch((e) => { setError(mensajeDeError(e)); setOpciones([]) })
  }, [abierto, opciones])

  const esperado = elegida ? Math.round(elegida.rinde * lotes * 1000) / 1000 : 0
  // Mientras nadie la toque, lo que salió sigue a los lotes.
  useEffect(() => { if (!cantidadTocada) setCantidad(esperado) }, [esperado, cantidadTocada])

  const distinto = elegida != null && Math.abs(cantidad - esperado) > 0.0005
  const pideNota = distinto || faltantes != null
  const notaOk = nota.trim().length >= 3

  function elegir(o: OpcionProduccion) {
    setElegida(o); setLotes(1); setCantidadTocada(false); setNota(''); setFaltantes(null)
    setError(null); setId(crypto.randomUUID())
  }

  function cerrar() {
    setAbierto(false); setElegida(null); setListo(null); setNota(''); setFaltantes(null)
    setError(null); setTeclado(false); setOpciones(null)
  }

  async function registrar(forzar: boolean) {
    if (!elegida || guardando) return
    if (pideNota && !notaOk) { setError('Escribe una nota de por qué.'); setTeclado(true); return }
    setGuardando(true); setError(null)
    try {
      const r = await registrarProduccion(sb, {
        id, producto_id: elegida.producto_id, lotes, cantidad,
        nota: nota.trim() || null, forzar,
      })
      if (!r.ok) { setFaltantes(r.faltantes); setError(r.error); return }
      setListo(r); setElegida(null); setFaltantes(null); setOpciones(null)
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
        ¿Preparaste algo? (salsa chipotle…)
      </button>
    )
  }

  if (listo) {
    return (
      <div className="mt-3 bg-sa-mint/25 rounded-sa p-4 text-center">
        <p className="font-display text-lg text-sa-green-ink">
          {listo.repetida ? 'Ya estaba registrada' : 'Producción registrada'}
        </p>
        <p className="text-sm text-sa-green-ink/80 mt-1">
          +{num(listo.cantidad)} {listo.salida ?? ''}
          {listo.existencia != null && <> · ahora hay {num(Number(listo.existencia))}</>}
        </p>
        <button onClick={cerrar} className="w-full mt-3 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
          Listo
        </button>
      </div>
    )
  }

  return (
    <div data-no-recargar className="mt-3 bg-white rounded-sa p-4 shadow-sa-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg text-sa-green-ink">Registrar producción</p>
        <button onClick={cerrar} className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40">Cerrar</button>
      </div>

      {opciones === null && <p className="text-sm text-sa-green-ink/60 mt-2">Cargando…</p>}
      {opciones && opciones.length === 0 && !error && (
        <p className="text-sm text-sa-green-ink/60 mt-2">
          No hay nada ligado para producir. Gerencia lo liga en Admin → Inventario → Producción.
        </p>
      )}

      {!elegida && opciones && opciones.length > 1 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {opciones.map((o) => (
            <button key={o.producto_id} onClick={() => elegir(o)}
              className="text-left border border-sa-green-ink/15 rounded-sa px-3 py-2.5 text-sm text-sa-green-ink">
              {o.salida} <span className="font-mono text-[10px] text-sa-green-ink/50">· {num(o.rinde)} por lote</span>
            </button>
          ))}
        </div>
      )}

      {elegida && (
        <div className="mt-2">
          <p className="text-sm text-sa-green-ink font-medium">{elegida.salida}</p>
          <p className="font-mono text-[10px] text-sa-green-ink/50">
            Receta «{elegida.receta}» · {num(elegida.rinde)} {elegida.unidad ?? ''} por lote · hay {num(elegida.existencia)}
          </p>

          <Paso etiqueta="Lotes" valor={lotes} texto={num(lotes)}
            menos={() => setLotes((n) => Math.max(0.5, n - 0.5))}
            mas={() => setLotes((n) => Math.min(50, n + 0.5))} />
          <Paso etiqueta="Salieron" valor={cantidad} texto={num(cantidad)}
            menos={() => { setCantidadTocada(true); setCantidad((n) => Math.max(1, n - 1)) }}
            mas={() => { setCantidadTocada(true); setCantidad((n) => n + 1) }} />
          {distinto && (
            <p className="font-mono text-[10px] text-sa-strawberry text-right">se esperaban {num(esperado)} · escribe por qué</p>
          )}

          <div className="mt-3 text-xs text-sa-green-ink/80 leading-relaxed">
            <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">Sale del kiosko</p>
            {elegida.lineas.map((l) => (
              <div key={l.insumo_id} className="flex justify-between gap-2">
                <span>{l.nombre}</span>
                <span className="font-mono">{num(l.cantidad * lotes)} {l.unidad ?? ''}</span>
              </div>
            ))}
            <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mt-2">Entra</p>
            <div className="flex justify-between gap-2">
              <span>{elegida.salida}</span>
              <span className="font-mono">+{num(cantidad)} {elegida.unidad ?? ''}</span>
            </div>
          </div>

          {faltantes && (
            <div className="mt-3 bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-3 py-2 text-xs text-sa-strawberry">
              <p className="font-medium">El inventario dice que no alcanza:</p>
              {faltantes.map((f) => (
                <p key={f.nombre}>{f.nombre}: se necesitan {num(f.necesita)}, hay {num(f.hay)}</p>
              ))}
              <p className="mt-1 text-sa-green-ink/70">Si sí lo preparaste, regístralo con una nota.</p>
            </div>
          )}

          {(pideNota || teclado) && (
            <>
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onFocus={() => setTeclado(true)}
                inputMode="none"
                placeholder="Nota (por qué)"
                className="w-full mt-3 px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-base bg-white"
              />
              {teclado && <TecladoBusqueda valor={nota} onCambio={setNota} onListo={() => setTeclado(false)} maxLargo={80} />}
            </>
          )}

          <button
            onClick={() => void registrar(faltantes != null)}
            disabled={guardando || (pideNota && !notaOk)}
            className="w-full mt-3 bg-sa-green hover:brightness-110 disabled:opacity-50 text-sa-cream py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
          >
            {guardando ? 'Guardando…' : faltantes ? 'Registrar de todos modos' : `Registrar ${num(cantidad)}`}
          </button>
          {opciones && opciones.length > 1 && (
            <button onClick={() => setElegida(null)} className="w-full mt-2 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
              Elegir otra
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs bg-sa-strawberry/10 text-sa-strawberry rounded-sa px-3 py-2">{error}</p>}
    </div>
  )
}

function Paso({ etiqueta, texto, menos, mas }: { etiqueta: string; valor: number; texto: string; menos: () => void; mas: () => void }) {
  return (
    <div className="flex items-center justify-between mt-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">{etiqueta}</span>
      <div className="flex items-center gap-3">
        <button onClick={menos} className="w-10 h-10 rounded-sa border border-sa-green-ink/15 text-sa-green-ink text-lg">−</button>
        <span className="font-display text-2xl text-sa-green-ink min-w-[3rem] text-center">{texto}</span>
        <button onClick={mas} className="w-10 h-10 rounded-sa border border-sa-green-ink/15 text-sa-green-ink text-lg">+</button>
      </div>
    </div>
  )
}
