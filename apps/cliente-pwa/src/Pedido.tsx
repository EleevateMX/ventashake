import milo from '@shake/brand/milo.png'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ProductoVenta } from '@shake/supabase'
import {
  mxn, esBase, esProteina, esDobleScoop, esDobleProteina, esGalletaPromo, carneDeDoble,
  ordenarBases, baseDeCasa, opcionDeGrupo, grupoEsOpcional, gruposDeExtras, extraDisponible,
  notaDeBase, baseCobrada, dobleScoopDe, marcaYSabor, marcasOrdenadas, proteinaDeCasa,
} from '@shake/utils'
import { useEstado, nombreVisible, type ExtraProducto } from './Estado'
import { amable } from './lib/rpc'
import { crearPedido, enlaceDePago, abrirPago, esperarPago, type LineaPedido, type PedidoCreado } from './lib/pedidos'
import { Hoja, Boton, Sheet, claseInput, tacto } from './ui'

type Fase = 'armando' | 'creando' | 'pagando' | 'listo'

/** La hoja «Lo quiero»: cantidad, con qué va, nota, y pedir y pagar. */
/** Un extra ya limpio: precio numérico y estrella como booleano. */
type Opcion = Omit<ExtraProducto, 'precio' | 'por_defecto'> & { precio: number; por_defecto: boolean }

/**
 * La hoja «Lo quiero»: cantidad, con qué va, nota, y pedir y pagar.
 *
 * Las opciones van por secciones, como en el kiosko (17/11/26, Perla: «la
 * personalización de El Clásico sale mezclada»): proteína (marca y sabor),
 * base, proteína adicional, los grupos de Admin, galletas y extras sueltos.
 * Qué cae en cada sección, qué sale elegido solo y qué viaja como nota lo
 * deciden las MISMAS reglas que el kiosko (`@shake/utils`), para que la
 * comanda de un pedido de la app se lea igual que una de la barra.
 */
export function PedidoSheet({ producto, extras: crudos, alCerrar }: { producto: ProductoVenta; extras: ExtraProducto[]; alCerrar: () => void }) {
  const { pedidosConfig, cargarMisPedidos, sincronizar } = useEstado()
  const [cantidad, setCantidad] = useState(1)
  const [proteinaId, setProteinaId] = useState<string | null>(null)
  const [marcaVista, setMarcaVista] = useState<string | null>(null)
  const [baseId, setBaseId] = useState<string | null>(null)
  const [doble, setDoble] = useState(false)
  const [dobleCarne, setDobleCarne] = useState<Set<string>>(new Set())
  /** Lo tocado en cada grupo; '' = el cliente lo vació. */
  const [porGrupo, setPorGrupo] = useState<Record<string, string>>({})
  const [galletaId, setGalletaId] = useState<string | null>(null)
  const [sueltos, setSueltos] = useState<Set<string>>(new Set())
  const [nota, setNota] = useState('')
  const [fase, setFase] = useState<Fase>('armando')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [creado, setCreado] = useState<PedidoCreado | null>(null)
  const [pagoURL, setPagoURL] = useState<string | null>(null)
  const espera = useRef<ReturnType<typeof esperarPago> | null>(null)
  useEffect(() => () => espera.current?.cancelar(), [])

  const extras = useMemo<Opcion[]>(
    () => crudos.map((e) => ({ ...e, precio: Number(e.precio ?? 0), por_defecto: e.por_defecto === true })),
    [crudos],
  )

  // ── Las secciones (mismas reglas que ModalExtras del kiosko) ──
  const bases = useMemo(() => ordenarBases(extras.filter((e) => esBase(e.nombre))), [extras])
  const proteinas = useMemo(() => extras.filter((e) => esProteina(e.nombre)), [extras])
  const marcas = useMemo(() => marcasOrdenadas(proteinas), [proteinas])
  const dobles = useMemo(() => extras.filter((e) => esDobleScoop(e.nombre)), [extras])
  const doblesCarne = useMemo(() => extras.filter(esDobleProteina), [extras])
  const grupos = useMemo(() => gruposDeExtras(extras), [extras])

  const base = bases.find((b) => b.extra_id === baseId) ?? baseDeCasa(bases)
  const proteina = proteinas.find((p) => p.extra_id === proteinaId) ?? proteinaDeCasa(proteinas)
  const marcaAbierta = marcaVista ?? (proteina ? marcaYSabor(proteina.nombre).marca : marcas[0] ?? null)
  const dobleDeEsta = dobleScoopDe(dobles, proteina)
  const elegidosDeGrupo = grupos
    .map(({ grupo, opciones }) => {
      const tocado = porGrupo[grupo]
      if (tocado === '') return null
      return opciones.find((o) => o.extra_id === tocado) ?? opcionDeGrupo(opciones)
    })
    .filter((e): e is Opcion => e !== null)
  const gruposElegidos = new Set(elegidosDeGrupo.map((e) => e.grupo as string))
  const enGrupo = new Set(grupos.map((g) => g.grupo))
  const galletas = extras.filter((e) => esGalletaPromo(e) && extraDisponible(e, gruposElegidos))
  const galleta = galletas.find((g) => g.extra_id === galletaId) ?? null
  const adicionales = extras.filter(
    (e) =>
      !esBase(e.nombre) && !esProteina(e.nombre) && !esDobleScoop(e.nombre) && !esDobleProteina(e) &&
      !esGalletaPromo(e) && !(e.grupo && enGrupo.has(e.grupo)) && extraDisponible(e, gruposElegidos),
  )

  /** Todo lo que viaja como renglón hijo (y se cobra). */
  const hijos: Opcion[] = [
    ...(baseCobrada(base) ? [base!] : []),
    ...(proteina ? [proteina] : []),
    ...(doble && dobleDeEsta ? [dobleDeEsta] : []),
    ...doblesCarne.filter((e) => dobleCarne.has(e.extra_id)),
    ...elegidosDeGrupo,
    ...(galleta ? [galleta] : []),
    ...adicionales.filter((e) => sueltos.has(e.extra_id)),
  ]

  /** Solo para orientar: el total lo pone el servidor. */
  const estimado = (producto.precio + hijos.reduce((s, e) => s + e.precio, 0)) * cantidad

  function lineas(): LineaPedido[] {
    // La base sin costo va pegada al shake como nota, igual que en el kiosko.
    const personalizacion = [notaDeBase(base), nota.trim()].filter(Boolean).join(', ') || null
    const l: LineaPedido[] = [{ producto_id: producto.id, cantidad, personalizacion, linea: 'L1', padre_linea: null }]
    hijos.forEach((e, i) => l.push({ producto_id: e.extra_id, cantidad, personalizacion: null, linea: `L${i + 2}`, padre_linea: 'L1' }))
    return l
  }

  function alternar(set: Set<string>, id: string): Set<string> {
    const n = new Set(set)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  }

  async function pedir() {
    setMensaje(null)
    setFase('creando')
    try {
      const c = await crearPedido(lineas(), nota.trim() || null)
      setCreado(c)
      const r = await enlaceDePago(c.id)
      if (r.pagado) { await terminar(); return }
      if (!r.url) throw new Error('No se pudo abrir el pago.')
      setPagoURL(r.url)
      setFase('pagando')
      abrirPago(r.url)
      espera.current = esperarPago(c.id)
      const e = await espera.current.promesa
      if (e === 'pagado') await terminar()
      else if (e === 'fallido') setMensaje('El pago no se completó. Puedes volver a abrirlo.')
      else setMensaje('Todavía no vemos el pago. Si ya pagaste, espera un momento; si no, vuelve a abrir el pago.')
    } catch (e) {
      setMensaje(amable(e))
      setFase('armando')
    }
  }

  async function terminar() {
    setFase('listo')
    tacto.exito()
    await cargarMisPedidos()
    await sincronizar()
  }

  return (
    <Sheet abierta alCerrar={alCerrar} alta>
      <div className="space-y-4 pt-2">
        <h2 className="font-display text-[28px] text-sa-cream leading-tight">Lo quiero</h2>
        <p className="font-semibold text-[17px] text-sa-cream">{nombreVisible(producto.nombre)}</p>

        {fase === 'listo' ? (
          <div className="flex flex-col items-center text-center gap-2.5 py-5">
            <img src={milo} alt="" className="w-[110px]" />
            <p className="font-display text-[26px] text-sa-cream">¡Pedido #{creado?.folio} pagado!</p>
            {creado?.preparar_a && <p className="text-[15px] text-sa-cream/80">Lo preparamos para las {creado.preparar_a}. Te avisamos cuando esté listo.</p>}
          </div>
        ) : fase === 'armando' ? (
          <>
            <Hoja titulo="Cuántos">
              <div className="flex items-center gap-5 text-sa-green">
                <button onClick={() => setCantidad((n) => Math.max(1, n - 1))} className="w-10 h-10 rounded-full bg-sa-green text-sa-cream text-2xl leading-none" aria-label="Menos">−</button>
                <span className="font-display text-3xl text-sa-green-ink min-w-[40px] text-center">{cantidad}</span>
                <button onClick={() => setCantidad((n) => Math.min(10, n + 1))} className="w-10 h-10 rounded-full bg-sa-green text-sa-cream text-2xl leading-none" aria-label="Más">+</button>
              </div>
            </Hoja>
            {proteinas.length > 0 && (
              <Hoja titulo="Elige tu proteína">
                <div className="flex gap-2 overflow-x-auto sa-fila -mx-1 px-1 pb-0.5">
                  {marcas.map((m) => (
                    <Chip key={m} activa={m === marcaAbierta} suave onClick={() => setMarcaVista(m)}>{m}</Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {proteinas.filter((p) => marcaYSabor(p.nombre).marca === marcaAbierta).map((p) => (
                    <Chip key={p.extra_id} activa={p.extra_id === proteina?.extra_id} onClick={() => { setProteinaId(p.extra_id); tacto.ligero() }}>
                      {marcaYSabor(p.nombre).sabor}{p.precio > 0 ? ` +${mxn(p.precio)}` : ''}
                    </Chip>
                  ))}
                </div>
                {proteina && <p className="text-xs text-sa-green-ink/60">Llevas: <b>{nombreVisible(proteina.nombre).replace(/^prote[ií]na\s*/i, '')}</b></p>}
              </Hoja>
            )}
            {bases.length > 0 && (
              <Hoja titulo="Elige tu base">
                <div className="flex flex-wrap gap-2">
                  {bases.map((b) => (
                    <Chip key={b.extra_id} activa={b.extra_id === base?.extra_id} onClick={() => setBaseId(b.extra_id)}>
                      {b.nombre}{b.precio > 0 ? ` +${mxn(b.precio)}` : ''}
                    </Chip>
                  ))}
                </div>
              </Hoja>
            )}
            {(dobleDeEsta || doblesCarne.length > 0) && (
              <Hoja titulo="Proteína adicional">
                {dobleDeEsta && (
                  <Casilla
                    activa={doble}
                    onClick={() => setDoble((v) => !v)}
                    texto={`Doble scoop${proteina ? ` · ${marcaYSabor(proteina.nombre).marca}` : ''}`}
                    precio={dobleDeEsta.precio}
                  />
                )}
                {doblesCarne.map((e) => (
                  <Casilla key={e.extra_id} activa={dobleCarne.has(e.extra_id)} onClick={() => setDobleCarne((s) => alternar(s, e.extra_id))} texto={`Doble ${carneDeDoble(e.nombre)}`} precio={e.precio} />
                ))}
              </Hoja>
            )}
            {grupos.map(({ grupo, opciones }) => {
              const opcional = grupoEsOpcional(opciones)
              const actual = elegidosDeGrupo.find((e) => e.grupo === grupo)?.extra_id
              return (
                <Hoja key={grupo} titulo={grupo}>
                  {opcional && <p className="text-xs text-sa-green-ink/55 -mt-1">Opcional. Toca otra vez para quitarlo.</p>}
                  <div className="flex flex-wrap gap-2">
                    {opciones.map((e) => (
                      <Chip
                        key={e.extra_id}
                        activa={e.extra_id === actual}
                        onClick={() => setPorGrupo((p) => ({ ...p, [grupo]: e.extra_id === actual && opcional ? '' : e.extra_id }))}
                      >
                        {sinPrefijo(e.nombre, grupo)}{e.precio > 0 ? ` +${mxn(e.precio)}` : ''}
                      </Chip>
                    ))}
                  </div>
                </Hoja>
              )
            })}
            {galletas.length > 0 && (
              <Hoja titulo="Galletas">
                <div className="flex flex-wrap gap-2">
                  {galletas.map((g) => (
                    <Chip key={g.extra_id} activa={g.extra_id === galleta?.extra_id} onClick={() => setGalletaId((id) => (id === g.extra_id ? null : g.extra_id))}>
                      {g.nombre}{g.precio > 0 ? ` +${mxn(g.precio)}` : ''}
                    </Chip>
                  ))}
                </div>
              </Hoja>
            )}
            {adicionales.length > 0 && (
              <Hoja titulo="Extras y adicionales">
                {adicionales.map((e) => (
                  <Casilla key={e.extra_id} activa={sueltos.has(e.extra_id)} onClick={() => setSueltos((s) => alternar(s, e.extra_id))} texto={e.nombre} precio={e.precio} />
                ))}
              </Hoja>
            )}
            <Hoja titulo="Algo que debamos saber">
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Sin hielo, poco plátano…" className={claseInput} maxLength={120} />
            </Hoja>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-sa-cream/70">Aproximado</span>
                <span className="font-mono text-xl font-medium text-sa-banana">{mxn(estimado)}</span>
              </div>
              <p className="text-xs text-sa-cream/50 mt-1">El total exacto lo confirma la barra antes de cobrar. Pagas con tarjeta en la app y pasas por tu pedido en {pedidosConfig?.minutos_preparacion ?? 20} minutos.</p>
            </div>
            <Boton onClick={() => void pedir()}>Pedir y pagar</Boton>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="w-7 h-7 rounded-full border-2 border-sa-banana border-t-transparent animate-spin" />
            <p className="text-sm text-sa-cream/70">{fase === 'creando' ? 'Armando tu pedido…' : 'Esperando el pago…'}</p>
            {fase === 'pagando' && pagoURL && (
              <button onClick={() => abrirPago(pagoURL)} className="text-sm font-semibold text-sa-banana">Volver a abrir el pago</button>
            )}
          </div>
        )}

        {mensaje && <p className="text-sm font-medium text-sa-strawberry text-center">{mensaje}</p>}
        <Boton tono="tinta" onClick={alCerrar}>{fase === 'listo' ? 'Listo' : 'Cancelar'}</Boton>
      </div>
    </Sheet>
  )
}

function Chip({ activa, suave = false, onClick, children }: { activa: boolean; suave?: boolean; onClick: () => void; children: ReactNode }) {
  const on = suave ? 'bg-sa-green-ink text-sa-cream' : 'bg-sa-green text-sa-cream'
  return (
    <button onClick={onClick} aria-pressed={activa}
      className={`shrink-0 rounded-full px-3 py-2 text-[13px] font-semibold whitespace-nowrap ${activa ? on : 'bg-sa-cream-warm text-sa-green-ink'}`}>
      {children}
    </button>
  )
}

function Casilla({ activa, onClick, texto, precio }: { activa: boolean; onClick: () => void; texto: string; precio: number }) {
  return (
    <label className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-sm">{texto}</span>
      <span className="flex items-center gap-2.5">
        <span className="font-mono text-xs text-sa-green">{precio > 0 ? `+${mxn(precio)}` : 'incluido'}</span>
        <input type="checkbox" checked={activa} onChange={onClick} className="w-5 h-5 accent-sa-green" />
      </span>
    </label>
  )
}

/** «Preparado: Mazapán» dentro del grupo «Preparado» → «Mazapán». */
function sinPrefijo(nombre: string, grupo: string): string {
  if (!nombre.toLowerCase().startsWith(grupo.toLowerCase())) return nombre
  const resto = nombre.slice(grupo.length).replace(/^\s*[:\-–]?\s*/, '')
  return resto || nombre
}
