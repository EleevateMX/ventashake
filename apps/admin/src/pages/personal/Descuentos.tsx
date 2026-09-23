import { useCallback, useEffect, useState } from 'react'
import {
  catalogoPersonal, guardarPrecioPersonal, quienesUsanBeneficio, guardarClavePersonal,
  historialPersonal, configBeneficio, guardarConfigBeneficio,
  type ProductoConPrecioPersonal, type QuienUsaBeneficio,
  type ConsumoDePersonal, type ConfigBeneficio,
} from '@shake/supabase'
import { mxn, mensajeDeError, hoyEnMerida, diasAntesEnMerida } from '@shake/utils'
import { sb } from '../../lib/sb'
import { Panel, Loading, ErrorMsg, OkMsg, Chip, cx } from '../../ui'

/**
 * El descuento de personal: quién lo tiene, qué cuesta y qué se consumió.
 *
 * **El motor vive en el servidor.** Esta pantalla configura y consulta;
 * no calcula un peso. Al cobrar, `fn_crear_orden_personal` valida la
 * clave, el turno y los límites, saca el descuento de
 * `productos.precio_personal` y se lo pasa a `fn_crear_orden`. El cajero
 * manda una clave, nunca un precio — que es la misma regla de siempre.
 *
 * Dos cosas que conviene tener presentes al tocar precios aquí:
 *
 * - **Sin precio de personal, se cobra completo.** Ese es el valor por
 *   omisión de todo el catálogo. Por eso los boosters, extras, leches
 *   vegetales y combos quedan fuera sin tener que enumerarlos, y un
 *   producto nuevo no nace regalado.
 * - **El grupo es lo que consume el lugar del día**, y va aparte del
 *   precio. Un producto puede tener precio y no consumir lugar.
 */

const GRUPOS = [
  { id: 'shake', label: 'Shake / Clásico' },
  { id: 'alimento', label: 'Alimento' },
  { id: 'bebida', label: 'Bebida' },
] as const

const PESTANAS = [
  { id: 'quienes', label: 'Quién lo tiene' },
  { id: 'precios', label: 'Precios' },
  { id: 'historial', label: 'Historial' },
  { id: 'reglas', label: 'Reglas' },
] as const

type Sub = (typeof PESTANAS)[number]['id']

export default function Descuentos() {
  const [sub, setSub] = useState<Sub>('quienes')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const avisar = (m: string) => { setOk(m); setTimeout(() => setOk(null), 6000) }

  return (
    <div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <div className="flex gap-2 flex-wrap mb-5">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => { setSub(p.id); setError(null) }}
            className={`px-4 py-2 rounded-full text-sm border transition-colors ${
              sub === p.id
                ? 'bg-sa-green text-sa-cream border-sa-green'
                : 'bg-white border-sa-green-ink/15 text-sa-green-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {sub === 'quienes' && <Quienes onError={setError} onOk={avisar} />}
      {sub === 'precios' && <Precios onError={setError} onOk={avisar} />}
      {sub === 'historial' && <Historial onError={setError} />}
      {sub === 'reglas' && <Reglas onError={setError} onOk={avisar} />}
    </div>
  )
}

// ------------------------------------------------------------- quiénes
function Quienes({ onError, onOk }: { onError: (m: string) => void; onOk: (m: string) => void }) {
  const [filas, setFilas] = useState<QuienUsaBeneficio[] | null>(null)
  const [editando, setEditando] = useState<QuienUsaBeneficio | null>(null)
  const [clave, setClave] = useState('')

  const cargar = useCallback(async () => {
    try { setFilas(await quienesUsanBeneficio(sb)) } catch (e) { onError(mensajeDeError(e)) }
  }, [onError])

  useEffect(() => { void cargar() }, [cargar])

  async function guardar() {
    if (!editando) return
    try {
      await guardarClavePersonal(sb, editando.empleado_id, clave.trim() || null, null)
      onOk(`Clave guardada para ${editando.nombre}. Dísela en persona: aquí ya no se puede volver a ver.`)
      setEditando(null); setClave('')
      await cargar()
    } catch (e) { onError(mensajeDeError(e)) }
  }

  async function prender(f: QuienUsaBeneficio, activo: boolean) {
    try {
      await guardarClavePersonal(sb, f.empleado_id, null, activo)
      await cargar()
    } catch (e) { onError(mensajeDeError(e)) }
  }

  if (!filas) return <Loading>Cargando…</Loading>

  return (
    <div>
      <Panel className="mb-4">
        <p className="text-sm text-sa-green-ink/75 leading-relaxed">
          La clave es <b>de cada quien y distinta del PIN de caja</b>. Se guarda
          cifrada: después de escribirla aquí <b>ya no se puede volver a ver</b>,
          solo cambiar — igual que el PIN, y por la misma razón. El servidor
          rechaza una clave repetida, porque dos personas con la misma clave
          rompen lo único que sostiene el «personal e intransferible»: el
          historial diría que consumió quien no fue.
        </p>
      </Panel>

      <div className={cx.tableWrap}>
        <table className={cx.table}>
          <thead>
            <tr className={cx.thead}>
              <th className={cx.th}>Quién</th>
              <th className={cx.th}>Clave</th>
              <th className={cx.th}>Hoy</th>
              <th className={cx.thNum}>Lleva</th>
              <th className={cx.thNum}></th>
            </tr>
          </thead>
          <tbody className={cx.tbody}>
            {filas.map((f) => (
              <tr key={f.empleado_id} className={`${cx.tr} ${f.activo ? '' : 'opacity-50'}`}>
                <td className={`${cx.td} font-medium`}>{f.nombre}</td>
                <td className={cx.td}>
                  {f.tiene_clave ? <Chip tone="si">puesta</Chip> : <Chip tone="no">sin clave</Chip>}
                  {!f.activo && <Chip tone="no">apagado</Chip>}
                </td>
                <td className={`${cx.td} font-mono text-xs`}>
                  {f.usado_shake}/{f.max_shake} shake · {f.usado_alimento}/{f.max_alimento} alimento ·{' '}
                  {f.usado_bebida}/{f.max_bebida} bebida
                </td>
                <td className={cx.tdNum}>
                  {mxn(f.usado_importe)}
                  <span className={`${cx.muted} font-mono text-[10px]`}> de {mxn(f.tope)}</span>
                </td>
                <td className={cx.tdNum}>
                  <button
                    onClick={() => { setEditando(f); setClave('') }}
                    className="text-xs text-sa-green underline mr-3"
                  >
                    {f.tiene_clave ? 'Cambiar clave' : 'Dar clave'}
                  </button>
                  <button
                    onClick={() => void prender(f, !f.activo)}
                    className="text-xs text-sa-green-ink/60 underline"
                  >
                    {f.activo ? 'Apagar' : 'Prender'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-center justify-center p-6">
          <div className="bg-sa-cream-paper rounded-sa-lg max-w-sm w-full p-7">
            <p className="font-display text-3xl text-sa-green-ink leading-tight">
              Clave de {editando.nombre}
            </p>
            <input
              value={clave}
              onChange={(e) => setClave(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              placeholder="4 a 8 dígitos"
              className={`${cx.input} w-full mt-4 font-mono text-2xl text-center tracking-widest`}
            />
            <p className="text-[11px] text-sa-green-ink/50 mt-2 leading-snug">
              Anótala y dásela en persona. No se puede volver a leer desde aquí.
            </p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setEditando(null); setClave('') }} className={cx.btnSec}>
                Cancelar
              </button>
              <button
                onClick={() => void guardar()}
                disabled={clave.trim().length < 4}
                className="flex-1 bg-sa-green text-sa-cream py-3 rounded-sa-lg font-display text-lg disabled:opacity-40"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------- precios
function Precios({ onError, onOk }: { onError: (m: string) => void; onOk: (m: string) => void }) {
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<ProductoConPrecioPersonal[] | null>(null)
  const [soloConPrecio, setSoloConPrecio] = useState(true)

  const cargar = useCallback(async (q: string) => {
    setFilas(null)
    try { setFilas(await catalogoPersonal(sb, q)) } catch (e) { onError(mensajeDeError(e)) }
  }, [onError])

  useEffect(() => { void cargar('') }, [cargar])

  async function guardar(p: ProductoConPrecioPersonal, precio: number | null, grupo: string | null) {
    try {
      await guardarPrecioPersonal(sb, p.id, precio, grupo)
      onOk(`${p.nombre}: ${precio == null ? 'sin precio de personal, se cobra completo' : `precio de personal ${mxn(precio)}`}`)
      await cargar(texto)
    } catch (e) { onError(mensajeDeError(e)) }
  }

  const visibles = (filas ?? []).filter((f) => !soloConPrecio || f.precio_personal != null)

  return (
    <div>
      <Panel className="mb-4">
        <p className="text-sm text-sa-green-ink/75 leading-relaxed">
          Lo que <b>no</b> tiene precio aquí se cobra completo — así quedan fuera
          los boosters, extras, leches vegetales y combos sin tener que
          enumerarlos, y un producto nuevo no nace regalado. El <b>grupo</b> es
          lo que consume el lugar del día, y va aparte del precio.
        </p>
      </Panel>

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void cargar(texto) }}
          placeholder="Buscar producto o categoría…"
          className={`${cx.input} !py-2 w-64`}
        />
        <button onClick={() => void cargar(texto)} className={cx.btnPrimary}>Buscar</button>
        <label className="flex items-center gap-2 text-sm text-sa-green-ink/70">
          <input
            type="checkbox"
            checked={soloConPrecio}
            onChange={(e) => setSoloConPrecio(e.target.checked)}
            className="w-4 h-4 accent-sa-green"
          />
          Solo los que tienen beneficio
        </label>
      </div>

      {!filas ? <Loading>Cargando…</Loading> : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Producto</th>
                <th className={cx.th}>Categoría</th>
                <th className={cx.thNum}>Público</th>
                <th className={cx.thNum}>Personal</th>
                <th className={cx.th}>Consume</th>
                <th className={cx.thNum}></th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {visibles.map((p) => (
                <FilaPrecio key={p.id} p={p} onGuardar={guardar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilaPrecio({
  p, onGuardar,
}: {
  p: ProductoConPrecioPersonal
  onGuardar: (p: ProductoConPrecioPersonal, precio: number | null, grupo: string | null) => void
}) {
  const [precio, setPrecio] = useState(p.precio_personal?.toString() ?? '')
  const [grupo, setGrupo] = useState<string>(p.grupo_personal ?? '')
  const cambio = precio !== (p.precio_personal?.toString() ?? '') || grupo !== (p.grupo_personal ?? '')

  return (
    <tr className={cx.tr}>
      <td className={`${cx.td} font-medium`}>
        {p.nombre}
        {p.es_extra && <Chip tone="neutral">extra</Chip>}
      </td>
      <td className={cx.td}>{p.categoria ?? '—'}</td>
      <td className={cx.tdNum}>{mxn(p.precio)}</td>
      <td className={cx.tdNum}>
        <input
          type="number" step="1" min="0"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="—"
          className={`${cx.input} !py-1.5 w-24 text-right font-mono text-xs`}
        />
      </td>
      <td className={cx.td}>
        <select
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className={`${cx.input} !py-1.5 text-xs`}
        >
          <option value="">— nada —</option>
          {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </td>
      <td className={cx.tdNum}>
        {cambio && (
          <button
            onClick={() => onGuardar(p, precio.trim() === '' ? null : Number(precio), grupo || null)}
            className="text-xs text-sa-green underline"
          >
            Guardar
          </button>
        )}
      </td>
    </tr>
  )
}

// ----------------------------------------------------------- historial
function Historial({ onError }: { onError: (m: string) => void }) {
  const [desde, setDesde] = useState(diasAntesEnMerida(29))
  const [hasta, setHasta] = useState(hoyEnMerida())
  const [filas, setFilas] = useState<ConsumoDePersonal[] | null>(null)

  const cargar = useCallback(async () => {
    setFilas(null)
    try { setFilas(await historialPersonal(sb, desde, hasta)) } catch (e) { onError(mensajeDeError(e)) }
  }, [desde, hasta, onError])

  useEffect(() => { void cargar() }, [cargar])

  const total = (filas ?? []).reduce((s, f) => s + Number(f.importe_personal), 0)
  const ahorro = (filas ?? []).reduce((s, f) => s + Number(f.precio_publico) - Number(f.importe_personal), 0)

  return (
    <div>
      <div className="flex gap-3 flex-wrap items-end mb-4">
        <label className="text-xs text-sa-green-ink/60">
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
            className={`${cx.input} !py-2 font-mono text-xs block mt-1`} />
        </label>
        <label className="text-xs text-sa-green-ink/60">
          Hasta
          <input type="date" value={hasta} min={desde} max={hoyEnMerida()} onChange={(e) => setHasta(e.target.value)}
            className={`${cx.input} !py-2 font-mono text-xs block mt-1`} />
        </label>
      </div>

      {!filas ? <Loading>Cargando…</Loading> : filas.length === 0 ? (
        <Panel><p className={cx.muted}>Nadie usó su beneficio en ese periodo.</p></Panel>
      ) : (
        <>
          <p className={`${cx.muted} font-mono text-xs mb-2`}>
            {filas.length} consumos · cobrado {mxn(total)} · dejado de cobrar {mxn(ahorro)}
          </p>
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Día</th>
                  <th className={cx.th}>Quién</th>
                  <th className={cx.th}>Qué</th>
                  <th className={cx.th}>Grupo</th>
                  <th className={cx.thNum}>Folio</th>
                  <th className={cx.thNum}>Pagó</th>
                  <th className={cx.thNum}>Público</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {filas.map((f) => (
                  <tr key={f.id} className={cx.tr}>
                    <td className={`${cx.td} font-mono text-xs`}>{f.dia}</td>
                    <td className={`${cx.td} font-medium`}>{f.nombre}</td>
                    <td className={cx.td}>{f.cantidad > 1 && `${f.cantidad}× `}{f.producto}</td>
                    <td className={cx.td}><Chip tone="neutral">{f.grupo}</Chip></td>
                    <td className={`${cx.tdNum} font-mono`}>{f.folio ?? '—'}</td>
                    <td className={cx.tdNum}>{mxn(Number(f.importe_personal))}</td>
                    <td className={`${cx.tdNum} ${cx.muted}`}>{mxn(Number(f.precio_publico))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`${cx.muted} text-xs mt-3`}>
            Este historial no se edita ni se borra: lo impone la base.
          </p>
        </>
      )}
    </div>
  )
}

// -------------------------------------------------------------- reglas
function Reglas({ onError, onOk }: { onError: (m: string) => void; onOk: (m: string) => void }) {
  const [cfg, setCfg] = useState<ConfigBeneficio | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    configBeneficio(sb).then(setCfg).catch((e) => onError(mensajeDeError(e)))
  }, [onError])

  if (!cfg) return <Loading>Cargando…</Loading>

  return (
    <div className="max-w-lg">
      <Panel>
        <div className="space-y-4">
          {([
            ['tope_diario', 'Tope diario en pesos', 'Cuenta solo el precio de personal del producto base. Los extras se cobran normal y quedan fuera.'],
            ['max_shake', 'Shakes o Clásicos al día', 'Los límites son por grupo: no pedir alimento no da derecho a un segundo shake.'],
            ['max_alimento', 'Alimentos al día', ''],
            ['max_bebida', 'Bebidas al día', ''],
          ] as const).map(([campo, etiqueta, ayuda]) => (
            <div key={campo}>
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-sa-green-ink">{etiqueta}</span>
                <input
                  type="number"
                  value={cfg[campo]}
                  onChange={(e) => setCfg({ ...cfg, [campo]: Number(e.target.value) || 0 })}
                  className="w-24 px-3 py-2 border border-sa-green-ink/15 rounded text-right font-mono text-sm"
                />
              </label>
              {ayuda && <p className="text-[11px] text-sa-green-ink/50 mt-1 leading-snug">{ayuda}</p>}
            </div>
          ))}

          <label className="flex items-start gap-3 pt-3 border-t border-dashed border-sa-green-ink/15">
            <input
              type="checkbox"
              checked={cfg.exige_turno}
              onChange={(e) => setCfg({ ...cfg, exige_turno: e.target.checked })}
              className="w-4 h-4 mt-1 accent-sa-green shrink-0"
            />
            <span>
              <span className="text-sm text-sa-green-ink">Solo con turno checado</span>
              <p className="text-[11px] text-sa-green-ink/50 mt-0.5 leading-snug">
                El beneficio es de quien está trabajando. Si se apaga, cualquiera
                con clave lo puede usar a cualquier hora — incluido su día libre.
              </p>
            </span>
          </label>

          <div>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-sa-green-ink">Gracia después de checar salida (min)</span>
              <input
                type="number"
                value={cfg.gracia_min}
                onChange={(e) => setCfg({ ...cfg, gracia_min: Number(e.target.value) || 0 })}
                className="w-24 px-3 py-2 border border-sa-green-ink/15 rounded text-right font-mono text-sm"
              />
            </label>
            <p className="text-[11px] text-sa-green-ink/50 mt-1 leading-snug">
              Cubre «al terminar su turno»: checa salida, se sienta y se toma su shake.
            </p>
          </div>
        </div>

        <button
          onClick={async () => {
            setGuardando(true)
            try { await guardarConfigBeneficio(sb, cfg); onOk('Reglas guardadas.') }
            catch (e) { onError(mensajeDeError(e)) }
            finally { setGuardando(false) }
          }}
          disabled={guardando}
          className="mt-6 px-6 py-3 rounded-sa-lg bg-sa-green text-sa-cream font-display text-lg disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar reglas'}
        </button>
      </Panel>
    </div>
  )
}
