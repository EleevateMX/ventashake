import { useEffect, useMemo, useState } from 'react'
import { insumosParaCargar, cargarInventario } from '@shake/supabase'
import type { InsumoParaCargar, ResultadoEntrada } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * Cargar inventario desde la barra, por caja o por pieza.
 *
 * Existe porque hasta ahora la única forma de meter existencias era
 * Costeos, que es una hoja de costeo: se escribe el número final y el
 * sistema deduce la diferencia. Eso está bien para costear y es pésimo
 * para recibir mercancía — se ve en el historial del agua Kirkland del
 * 06/09: +10, +7, +3, -20, +21 en veinte minutos, que es alguien
 * tecleando mientras el guardado automático rebota. Nadie se estaba
 * equivocando: la herramienta no era para eso.
 *
 * Aquí se cuenta como se cuenta en la barra: «llegaron 2 cajas» y se
 * suma. Lo que viaja es el movimiento, no el total, así que teclear no
 * puede dejar el inventario en un número raro.
 *
 * Va plegado, igual que Pedir cambio: quien abre el panel de Milo viene a
 * abrir la caja, no a cargar cajas. Pero cuando llega el proveedor, está
 * a un toque.
 */

interface Linea { insumo: InsumoParaCargar; piezas: number }

export function CargarInventario() {
  const [abierto, setAbierto] = useState(false)
  const [origen, setOrigen] = useState<'bodega' | 'directa'>('bodega')
  const [catalogo, setCatalogo] = useState<InsumoParaCargar[]>([])
  const [cargandoCat, setCargandoCat] = useState(false)
  const [busca, setBusca] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState<ResultadoEntrada | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || catalogo.length > 0) return
    setCargandoCat(true)
    insumosParaCargar(sb)
      .then((c) => { setCatalogo(c); setError(null) })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargandoCat(false))
  }, [abierto, catalogo.length])

  /**
   * La búsqueda no lista nada con el campo vacío: son más de mil insumos y
   * una lista larguísima al abrir hace que nadie la lea. Se escribe y
   * aparecen los pocos que importan.
   */
  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q.length < 2) return []
    return catalogo
      .filter((i) => i.nombre.toLowerCase().includes(q))
      .slice(0, 12)
  }, [busca, catalogo])

  function sumar(insumo: InsumoParaCargar, piezas: number) {
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.insumo.id === insumo.id)
      if (i === -1) return [...prev, { insumo, piezas }]
      const copia = [...prev]
      copia[i] = { ...copia[i], piezas: copia[i].piezas + piezas }
      return copia
    })
    setBusca('')
  }

  function quitar(id: string) {
    setLineas((prev) => prev.filter((l) => l.insumo.id !== id))
  }

  const totalPiezas = lineas.reduce((s, l) => s + l.piezas, 0)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const r = await cargarInventario(
        sb,
        lineas.map((l) => ({ insumoId: l.insumo.id, piezas: l.piezas })),
        origen,
      )
      setListo(r)
      setLineas([])
      // El catálogo que quedó en memoria ya trae los números viejos.
      setCatalogo([])
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
        ¿Llegó mercancía? Cargar inventario
      </button>
    )
  }

  if (listo) {
    return (
      <div className="mt-3 bg-sa-mint/25 rounded-sa p-4">
        <p className="font-display text-lg text-sa-green-ink text-center">
          Cargadas {listo.piezas} piezas
        </p>
        <div className="mt-2 space-y-0.5">
          {listo.detalle.map((d) => (
            <div key={d.insumo} className="flex justify-between gap-3">
              <span className="text-xs text-sa-green-ink/80">{d.insumo}</span>
              <span className="font-mono text-xs text-sa-green-ink">+{d.piezas}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-sa-green-ink/60 mt-3 leading-relaxed text-center">
          {listo.origen === 'bodega'
            ? 'Salieron de bodega y entraron al kiosko.'
            : 'Entraron al kiosko como mercancía nueva.'}
        </p>
        <button
          onClick={() => { setListo(null); setAbierto(false) }}
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
        <p className="font-display text-lg text-sa-green-ink">Cargar inventario</p>
        <button
          onClick={() => setAbierto(false)}
          className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40"
        >
          Cerrar
        </button>
      </div>

      {/* De dónde viene. No es un detalle: si vino de bodega hay que
          restarlo allá, o bodega se queda diciendo que todavía lo tiene. */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        {([
          { id: 'bodega' as const, tit: 'Vino de bodega', pie: 'Se resta allá' },
          { id: 'directa' as const, tit: 'Llegó a la barra', pie: 'Mercancía nueva' },
        ]).map((o) => (
          <button
            key={o.id}
            onClick={() => setOrigen(o.id)}
            className={`py-2.5 rounded-sa text-center transition-colors ${
              origen === o.id
                ? 'bg-sa-green text-sa-cream'
                : 'border border-sa-green-ink/15 text-sa-green-ink/70'
            }`}
          >
            <span className="block font-body text-sm">{o.tit}</span>
            <span className="block font-mono text-[9px] uppercase tracking-wider opacity-70">
              {o.pie}
            </span>
          </button>
        ))}
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={cargandoCat ? 'Cargando lista…' : 'Busca: agua, barra, proteína…'}
        disabled={cargandoCat}
        className="w-full mt-3 px-3 py-3 border border-sa-green-ink/15 rounded-sa text-base bg-white focus:outline-none focus:ring-2 focus:ring-sa-green/40"
      />

      {busca.trim().length >= 2 && resultados.length === 0 && !cargandoCat && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40 mt-2 text-center">
          Nada con ese nombre
        </p>
      )}

      {resultados.map((i) => (
        <div key={i.id} className="border-b border-sa-green-ink/5 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-sa-green-ink">{i.nombre}</span>
            <span className="font-mono text-[10px] text-sa-green-ink/50 whitespace-nowrap">
              hay {i.en_kiosko ?? 0}
              {origen === 'bodega' ? ` · bodega ${i.en_bodega ?? 0}` : ''}
            </span>
          </div>
          <div className="flex gap-2 mt-1.5">
            {/* La caja solo aparece si se pudo leer de la presentación.
                Sin número, mejor sin atajo que con un atajo que miente. */}
            {i.por_caja && i.por_caja > 1 && (
              <button
                onClick={() => sumar(i, i.por_caja as number)}
                className="flex-1 bg-sa-green text-sa-cream py-2 rounded-sa font-body text-sm"
              >
                + 1 caja ({i.por_caja})
              </button>
            )}
            {[1, 6].map((n) => (
              <button
                key={n}
                onClick={() => sumar(i, n)}
                className="flex-1 border border-sa-green-ink/15 text-sa-green-ink py-2 rounded-sa font-body text-sm"
              >
                + {n} pz
              </button>
            ))}
          </div>
        </div>
      ))}

      {lineas.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
            Por cargar
          </p>
          {lineas.map((l) => (
            <div key={l.insumo.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-sm text-sa-green-ink flex-1">{l.insumo.nombre}</span>
              <span className="font-mono text-sm text-sa-green-ink">+{l.piezas}</span>
              <button
                onClick={() => quitar(l.insumo.id)}
                className="font-mono text-[10px] uppercase tracking-wider text-sa-strawberry px-2"
              >
                Quitar
              </button>
            </div>
          ))}

          <button
            onClick={() => void guardar()}
            disabled={guardando}
            className="w-full mt-3 bg-sa-green hover:brightness-110 disabled:opacity-50 text-sa-cream py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
          >
            {guardando ? 'Cargando…' : `Cargar ${totalPiezas} piezas`}
          </button>
          <p className="font-mono text-[9px] uppercase tracking-wider text-sa-green-ink/40 mt-2 text-center">
            Se suma a lo que hay · no toca costos ni precios
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs bg-sa-strawberry/10 text-sa-strawberry rounded-sa px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
