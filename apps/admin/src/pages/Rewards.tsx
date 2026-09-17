import { useEffect, useState } from 'react'
import {
  rewardsAdmin, generarTarjetas, rewardsParametros, guardarConfigSellos,
  type RewardsAdmin, type TarjetaGenerada, type RewardsParametros,
} from '@shake/supabase'
import { mensajeDeError, mxn } from '@shake/utils'
import { sb } from '../lib/sb'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * Rewards visto desde gerencia.
 *
 * El número que manda es el **saldo en la calle**: las mancuernas
 * compradas son dinero que ya entró a la caja pero que todavía se debe en
 * producto. Es un pasivo, y por eso se muestra aparte de las ganadas, que
 * son promoción y no le deben nada a nadie. Sumarlas en un solo total
 * escondería justo el dato que le importa al negocio.
 */
export default function Rewards() {
  const [dx, setDx] = useState<RewardsAdmin | null>(null)
  const [pm, setPm] = useState<RewardsParametros | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    try {
      const [a, b] = await Promise.all([rewardsAdmin(sb), rewardsParametros(sb)])
      setDx(a)
      setPm(b)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  if (!dx && !error) return <Loading>Contando mancuernas…</Loading>

  return (
    <div>
      <PageHeader
        title="Rewards"
        subtitle="Saldo en la calle, tarjetas de regalo y movimientos"
        action={<button className={cx.btnPrimary} onClick={() => void cargar()}>Actualizar</button>}
      />
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {dx && (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Tarjeta
              titulo="Saldo comprado en la calle"
              dato={mxn(dx.en_la_calle.compradas_pesos)}
              pie={`${dx.en_la_calle.compradas.toLocaleString('es-MX')} mancuernas · ${dx.en_la_calle.clientes_con_saldo} clientes`}
              nota="Dinero que ya cobraste y debes en producto."
              alerta
            />
            <Tarjeta
              titulo="Mancuernas ganadas"
              dato={mxn(dx.en_la_calle.ganadas_pesos)}
              pie={`${dx.en_la_calle.ganadas.toLocaleString('es-MX')} mancuernas`}
              nota="Promoción. No le debes dinero a nadie por esto."
            />
            <Tarjeta
              titulo="Tarjetas de sellos llenas"
              dato={String(dx.sellos.bebida_listas + dx.sellos.alimento_listas)}
              pie={`${dx.sellos.bebida_listas} de bebidas · ${dx.sellos.alimento_listas} de comida`}
              nota={`${dx.sellos.con_sellos} clientes juntando.`}
            />
          </div>

          {pm && <ComoEstaArmado pm={pm} />}
          {pm && <TarjetasDeSellos pm={pm} alGuardar={() => void cargar()} />}

          <GenerarLote alGenerar={() => void cargar()} />

          {dx.tarjetas.length > 0 && (
            <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5 mb-6">
              <h2 className="font-display text-xl text-sa-green-ink mb-1">Lotes de tarjetas</h2>
              <p className="text-xs text-sa-green-ink/55 mb-3">
                Una tarjeta impresa no vale nada hasta que alguien la canjea: nace en
                <b> nueva</b> y solo entonces se vuelve saldo.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
                      <th className="py-2">Lote</th><th>Valor</th><th>Total</th>
                      <th>Sin usar</th><th>Canjeadas</th><th className="text-right">Por canjear</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sa-green-ink/10">
                    {dx.tarjetas.map((t) => (
                      <tr key={t.lote + t.mancuernas}>
                        <td className="py-2 font-mono text-xs">{t.lote}</td>
                        <td className="font-mono text-xs">{t.mancuernas.toLocaleString('es-MX')}</td>
                        <td>{t.total}</td>
                        <td>{t.nuevas}</td>
                        <td>{t.canjeadas}</td>
                        <td className="text-right font-mono">{mxn(t.pendiente_pesos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {dx.ultimos_movimientos.length > 0 && (
            <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5">
              <h2 className="font-display text-xl text-sa-green-ink mb-3">Últimos movimientos de saldo</h2>
              <div className="divide-y divide-sa-green-ink/10">
                {dx.ultimos_movimientos.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{m.cliente}</p>
                      <p className="font-mono text-[11px] text-sa-green-ink/50">
                        {m.descripcion ?? m.tipo} · {m.cuando}
                      </p>
                    </div>
                    <span className={`font-mono text-sm shrink-0 ${m.mancuernas > 0 ? 'text-sa-green' : 'text-sa-strawberry'}`}>
                      {m.mancuernas > 0 ? '+' : ''}{m.mancuernas.toLocaleString('es-MX')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Tarjeta({
  titulo, dato, pie, nota, alerta,
}: { titulo: string; dato: string; pie: string; nota: string; alerta?: boolean }) {
  return (
    <div className={`rounded-sa-lg border p-5 ${alerta ? 'bg-sa-banana/15 border-sa-banana/50' : 'bg-white border-sa-green-ink/10'}`}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">{titulo}</p>
      <p className="font-display text-3xl text-sa-green-ink leading-none mt-1">{dato}</p>
      <p className="font-mono text-[11px] text-sa-green-ink/55 mt-1.5">{pie}</p>
      <p className="text-[12px] text-sa-green-ink/65 mt-2 leading-snug">{nota}</p>
    </div>
  )
}

const VALORES = [
  { mancuernas: 2200, etiqueta: '$200 → 2,200' },
  { mancuernas: 5750, etiqueta: '$500 → 5,750' },
  { mancuernas: 12000, etiqueta: '$1,000 → 12,000' },
]

function GenerarLote({ alGenerar }: { alGenerar: () => void }) {
  const [cantidad, setCantidad] = useState('25')
  const [valor, setValor] = useState(2200)
  const [lote, setLote] = useState('')
  const [generando, setGenerando] = useState(false)
  const [salida, setSalida] = useState<TarjetaGenerada[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generar() {
    const n = Number(cantidad) || 0
    if (n < 1 || n > 500) { setError('Entre 1 y 500 por lote.'); return }
    if (!lote.trim()) { setError('Ponle nombre al lote para poder rastrearlo después.'); return }
    if (!confirm(`¿Generar ${n} tarjetas de ${valor.toLocaleString('es-MX')} mancuernas?`)) return
    setGenerando(true); setError(null)
    try {
      setSalida(await generarTarjetas(sb, n, valor, lote.trim()))
      alGenerar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGenerando(false)
    }
  }

  return (
    <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5 mb-6">
      <h2 className="font-display text-xl text-sa-green-ink mb-1">Generar tarjetas de regalo</h2>
      <p className="text-xs text-sa-green-ink/55 mb-4">
        Los códigos no son secuenciales a propósito: con lotes numerados, quien compra
        una tarjeta podría adivinar las de al lado.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mb-1">Cuántas</span>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))}
                 inputMode="numeric"
                 className="w-24 rounded-sa border border-sa-green-ink/15 px-3 py-2 font-mono" />
        </label>
        <label className="block">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mb-1">Valor</span>
          <select value={valor} onChange={(e) => setValor(Number(e.target.value))}
                  className="rounded-sa border border-sa-green-ink/15 px-3 py-2 text-sm">
            {VALORES.map((v) => <option key={v.mancuernas} value={v.mancuernas}>{v.etiqueta}</option>)}
          </select>
        </label>
        <label className="block flex-1 min-w-[180px]">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mb-1">Lote</span>
          <input value={lote} onChange={(e) => setLote(e.target.value.toUpperCase())}
                 placeholder="NAVIDAD-2026"
                 className="w-full rounded-sa border border-sa-green-ink/15 px-3 py-2 font-mono uppercase" />
        </label>
        <button className={cx.btnPrimary} onClick={() => void generar()} disabled={generando}>
          {generando ? 'Generando…' : 'Generar'}
        </button>
      </div>

      {error && <p className="text-sa-strawberry text-sm mt-3">{error}</p>}

      {salida && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm text-sa-green-ink/80">
              <b>{salida.length} tarjetas generadas.</b> Cópialas y mándalas a imprimir —
              esta lista no se vuelve a mostrar.
            </p>
            <button
              className={cx.btnSec}
              onClick={() => void navigator.clipboard.writeText(salida.map((t) => t.codigo).join('\n'))}
            >
              Copiar códigos
            </button>
          </div>
          <textarea
            readOnly
            value={salida.map((t) => t.codigo).join('\n')}
            rows={Math.min(12, salida.length)}
            className="w-full rounded-sa border border-sa-green-ink/15 p-3 font-mono text-xs bg-sa-cream-paper"
          />
        </div>
      )}
    </section>
  )
}

/**
 * Cómo está armado Rewards: todos los números que gobiernan el programa,
 * en un solo lugar, con **dónde vive cada uno**.
 *
 * Esa última columna no es adorno. La tasa de canje se cambia en una
 * función, lo que se gana por peso vive dentro del trigger que corre en
 * cada cobro, y los paquetes son filas de una tabla. Un panel que los
 * mostrara todos como si fueran lo mismo haría creer que se tocan igual —
 * y el del trigger es el que ya dejó a la tienda sin poder cobrar una vez.
 */
function ComoEstaArmado({ pm }: { pm: RewardsParametros }) {
  const [cuantas, setCuantas] = useState('1000')
  const n = Math.max(0, Number(cuantas) || 0)
  const enPesos = n / pm.canje.mancuernas_por_peso

  return (
    <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5 mb-6">
      <h2 className="font-display text-xl text-sa-green-ink mb-1">Cómo está armado Rewards</h2>
      <p className="text-xs text-sa-green-ink/55 mb-4">
        Los números que definen el programa, y en qué parte del sistema vive cada uno.
      </p>

      {/* Lo que hay que poder contestar sin abrir nada: cuánto vale esto. */}
      <div className="rounded-sa bg-sa-cream-soft p-4 mb-5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/55 mb-2">
          Cuánto vale una mancuerna
        </p>
        <p className="font-display text-2xl text-sa-green-ink leading-tight">
          {pm.canje.mancuernas_por_peso} mancuernas = $1
        </p>
        <p className="text-xs text-sa-green-ink/60 mt-1 mb-3">
          Se recorre el punto decimal: {(1000).toLocaleString('es-MX')} mancuernas son {mxn(1000 / pm.canje.mancuernas_por_peso)}.
          Es lo que se le dice al cliente.
        </p>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className={cx.label}>Mancuernas</label>
            <input
              className={cx.input}
              style={{ maxWidth: 160 }}
              type="number"
              inputMode="numeric"
              value={cuantas}
              onChange={(e) => setCuantas(e.target.value)}
            />
          </div>
          <div className="pb-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">Equivalen a</p>
            <p className="font-display text-2xl text-sa-green leading-tight">{mxn(enPesos)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
              <th className="py-2">Parámetro</th>
              <th>Valor</th>
              <th>Qué significa</th>
              <th>Dónde vive</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sa-green-ink/10">
            <tr>
              <td className="py-2">Tasa de canje</td>
              <td className="font-mono text-xs">{pm.canje.mancuernas_por_peso} = $1</td>
              <td className="text-sa-green-ink/70">Lo que valen al gastarlas</td>
              <td className="font-mono text-[11px] text-sa-green-ink/50">{pm.canje.donde}</td>
            </tr>
            <tr>
              <td className="py-2">Se gana</td>
              <td className="font-mono text-xs">1 por cada {mxn(pm.ganancia.pesos_por_mancuerna)}</td>
              <td className="text-sa-green-ink/70">
                O sea, {(100 / pm.ganancia.pesos_por_mancuerna / pm.canje.mancuernas_por_peso).toFixed(1)}% de vuelta
              </td>
              <td className="font-mono text-[11px] text-sa-green-ink/50">{pm.ganancia.donde}</td>
            </tr>
            <tr>
              <td className="py-2">Tope por ticket</td>
              <td className="font-mono text-xs">{pm.ganancia.tope_por_orden}</td>
              <td className="text-sa-green-ink/70">
                Aunque gaste más de {mxn(pm.ganancia.tope_por_orden * pm.ganancia.pesos_por_mancuerna)}
              </td>
              <td className="font-mono text-[11px] text-sa-green-ink/50">{pm.ganancia.donde}</td>
            </tr>
            <tr>
              <td className="py-2">Cupón</td>
              <td className="font-mono text-xs">{pm.cupon.meta_mancuernas}</td>
              <td className="text-sa-green-ink/70">Mancuernas ganadas para el siguiente cupón</td>
              <td className="font-mono text-[11px] text-sa-green-ink/50">{pm.cupon.donde}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-sa-green-ink/50 mt-3 leading-relaxed">
        Lo que se <b>gana</b> por peso y el tope no se editan desde aquí: viven dentro del
        trigger que corre en cada cobro. Cambiarlos es tocar el camino del dinero y se hace
        con una migración, no con un botón.
      </p>

      {pm.paquetes.length > 0 && (
        <>
          <h3 className={`${cx.h3} mt-6 mb-2`}>Paquetes de recarga</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
                  <th className="py-2">Paquete</th><th>Paga</th><th>Recibe</th>
                  <th>Vale</th><th>Regalo</th><th>Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sa-green-ink/10">
                {pm.paquetes.map((q) => (
                  <tr key={q.id} className={q.activo ? '' : 'opacity-45'}>
                    <td className="py-2">{q.nombre}</td>
                    <td className="font-mono text-xs">{mxn(q.precio)}</td>
                    <td className="font-mono text-xs">{q.mancuernas.toLocaleString('es-MX')}</td>
                    <td className="font-mono text-xs">{mxn(q.vale_pesos)}</td>
                    <td className="font-mono text-xs text-sa-green">+{q.bono_pct}%</td>
                    <td className="font-mono text-[11px] text-sa-green-ink/55">
                      {q.activo ? 'a la venta' : 'apagado'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-sa-green-ink/50 mt-2 leading-relaxed">
            El regalo sale del margen y a cambio entra dinero por adelantado. El monedero solo
            funciona si el cliente <b>siempre gana algo</b> por adelantar: un paquete con regalo
            en cero es un paquete que nadie compra dos veces.
          </p>
        </>
      )}
    </section>
  )
}

/**
 * Las tarjetas 13 + 1: sus reglas, lo que cuestan, y **lo que la app le
 * dice al cliente**.
 *
 * Lo último es la parte que se pidió y la que no existía. El negocio no
 * quiere anunciar el premio: anunciarlo lo convierte en una deuda que el
 * cliente va tachando, y el día que la cobra no hay sorpresa que dar. Así
 * que la app calla hasta que falta poco, y entonces suelta un guiño que
 * escribe gerencia aquí.
 *
 * Por eso el panel muestra la **vista previa** al lado del campo: el texto
 * se escribe viendo cómo se va a leer, no imaginándolo. Y por eso no hay
 * ningún campo que diga "gratis" ni que pinte el número: si el texto no lo
 * dice, el cliente no lo sabe — los números ya no viajan al navegador.
 */
function TarjetasDeSellos({
  pm, alGuardar,
}: {
  pm: RewardsParametros
  alGuardar: () => void
}) {
  return (
    <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5 mb-6">
      <h2 className="font-display text-xl text-sa-green-ink mb-1">Tarjetas de sellos</h2>
      <p className="text-xs text-sa-green-ink/55 mb-4">
        Cuántas compras pide cada una, cuánto cuesta el premio, y qué le dice la app al
        cliente. Bebidas y comida cuentan por separado.
      </p>
      <div className="space-y-5">
        {pm.sellos.map((s) => (
          <FilaSellos key={s.tipo} s={s} alGuardar={alGuardar} />
        ))}
      </div>

      {pm.premios.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 hover:text-sa-green-ink">
            Catálogo de premios ({pm.premios.filter((p) => p.activo).length})
          </summary>
          <div className="grid gap-4 md:grid-cols-2 mt-3">
            {['bebida', 'alimento'].map((tipo) => {
              const suyos = pm.premios.filter((p) => p.tipo === tipo && p.activo)
              if (suyos.length === 0) return null
              return (
                <div key={tipo}>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green mb-1.5">
                    {tipo === 'bebida' ? 'Bebidas' : 'Comida'}
                  </p>
                  <div className="space-y-0.5">
                    {suyos.map((p) => (
                      <div key={p.producto_id} className="flex justify-between gap-3 text-sm">
                        <span className="truncate text-sa-green-ink/80">{p.nombre}</span>
                        <span className="font-mono text-xs shrink-0 text-sa-green-ink/55">{mxn(p.precio)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </details>
      )}
    </section>
  )
}

function FilaSellos({
  s, alGuardar,
}: {
  s: RewardsParametros['sellos'][number]
  alGuardar: () => void
}) {
  const [requeridos, setRequeridos] = useState(String(s.requeridos))
  const [minimo, setMinimo] = useState(String(s.precio_minimo))
  const [desde, setDesde] = useState(String(s.aviso_desde))
  const [texto, setTexto] = useState(s.aviso_texto ?? '')
  const [textoListo, setTextoListo] = useState(s.aviso_listo_texto ?? '')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const nReq = Number(requeridos) || 0
  const nMin = Number(minimo) || 0
  const nDesde = Number(desde) || 0

  /**
   * Lo que el cliente paga para llenar la tarjeta, contra lo que se lleva.
   * El premio es el **más caro** del catálogo, no el promedio: el cliente
   * elige, y nadie elige el barato.
   */
  const gastoMinimo = nReq * nMin
  const costoPremio = s.premio_mas_caro ?? 0
  const pierde = nMin > 0 && gastoMinimo < costoPremio

  async function guardar() {
    setGuardando(true)
    setErr(null)
    setOk(false)
    try {
      await guardarConfigSellos(sb, {
        tipo: s.tipo,
        requeridos: nReq,
        precio_minimo: nMin,
        aviso_desde: nDesde,
        aviso_texto: texto,
        aviso_listo_texto: textoListo,
        activo: s.activo,
      })
      setOk(true)
      alGuardar()
      setTimeout(() => setOk(false), 3000)
    } catch (e) {
      setErr(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-sa border border-sa-green-ink/10 p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 className="font-display text-lg text-sa-green-ink">{s.nombre}</h3>
        <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50">
          {s.clientes_juntando} juntando · {s.clientes_listos} con la tarjeta llena
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-3">
        <div>
          <label className={cx.label}>Compras para el premio</label>
          <input className={cx.input} type="number" value={requeridos}
                 onChange={(e) => setRequeridos(e.target.value)} />
        </div>
        <div>
          <label className={cx.label}>Precio mínimo que sella</label>
          <input className={cx.input} type="number" value={minimo}
                 onChange={(e) => setMinimo(e.target.value)} />
        </div>
        <div>
          <label className={cx.label}>El guiño empieza a falta de</label>
          <input className={cx.input} type="number" value={desde}
                 onChange={(e) => setDesde(e.target.value)} />
        </div>
      </div>

      {/* La cuenta que decide si la tarjeta se paga sola. */}
      <div className={`rounded-sa px-4 py-3 mb-3 text-sm leading-relaxed ${
        pierde ? 'bg-sa-strawberry/10 text-sa-green-ink' : 'bg-sa-cream-soft text-sa-green-ink/75'
      }`}>
        {nMin === 0 ? (
          <>
            Con el mínimo en <b>$0 cualquier producto sella</b>, hasta un agua. El premio más caro
            del catálogo cuesta <b>{mxn(costoPremio)}</b>: {nReq} aguas de $10 son {mxn(nReq * 10)} de
            venta por un regalo de {mxn(costoPremio)}. Subir el mínimo a <b>$89</b> hace que solo
            sellen shakes y bebidas de carta.
          </>
        ) : pierde ? (
          <>
            <b>Ojo:</b> {nReq} compras de {mxn(nMin)} son {mxn(gastoMinimo)} de venta, y el premio
            más caro cuesta {mxn(costoPremio)}. La tarjeta regala más de lo que obliga a gastar.
          </>
        ) : (
          <>
            {nReq} compras de {mxn(nMin)} o más son al menos <b>{mxn(gastoMinimo)}</b> de venta por un
            premio de hasta {mxn(costoPremio)} ({s.premios} a elegir).
          </>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={cx.label}>Qué dice la app cuando ya falta poco</label>
          <textarea className={`${cx.input} min-h-[64px]`} value={texto} maxLength={140}
                    onChange={(e) => setTexto(e.target.value)} />
          <p className="text-[11px] text-sa-green-ink/45 mt-1 leading-relaxed">
            No digas qué es ni que es gratis. Si de verdad quieres poner el número,
            escribe <code className="font-mono">{'{faltan}'}</code> y se sustituye.
          </p>
        </div>
        <div>
          <label className={cx.label}>Y cuando la tarjeta ya se llenó</label>
          <textarea className={`${cx.input} min-h-[64px]`} value={textoListo} maxLength={140}
                    onChange={(e) => setTextoListo(e.target.value)} />
          <p className="text-[11px] text-sa-green-ink/45 mt-1 leading-relaxed">
            La caja sí ve el número exacto y qué premio toca. Aquí solo se le avisa que pregunte.
          </p>
        </div>
      </div>

      {/* Vista previa: el texto se escribe viendo cómo se lee. */}
      <div className="mt-3 rounded-sa bg-sa-cream-paper p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mb-2">
          Así lo verá el cliente
        </p>
        <div className="space-y-2 max-w-sm">
          <div className="rounded-sa bg-white/70 px-4 py-3">
            <p className="text-sm text-sa-green-ink/80 leading-snug">
              {texto.replace('{faltan}', String(Math.max(1, nDesde))) || '(nada)'}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-0.5">
              {s.nombre}
            </p>
          </div>
          <div className="rounded-sa bg-sa-banana/30 px-4 py-3">
            <p className="text-sm font-semibold text-sa-green leading-snug">
              {textoListo || '(nada)'}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-0.5">
              {s.nombre}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-sa-green-ink/50 mt-2 leading-relaxed">
          Antes de la compra {Math.max(0, nReq - nDesde)} la app <b>no dice nada</b> de esta tarjeta.
          {nDesde === 0 && ' Con el guiño en 0, nunca dice nada — ni cuando se llena.'}
        </p>
      </div>

      {err && <ErrorMsg>{err}</ErrorMsg>}
      <div className="flex items-center gap-3 mt-3">
        <button className={cx.btnPrimary} disabled={guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {ok && <span className="font-mono text-xs text-sa-green">Guardado.</span>}
      </div>
    </div>
  )
}
