import { Fragment, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductosParaVenta,
  listarExtras,
  extrasDisponibles,
  guardarExtra,
  quitarExtra,
  listarExtrasBebidaAdmin,
  extraVenderSolo,
  listarCategorias,
  guardarExtraBebida,
  activarExtraBebida,
  productosDeExtra,
  vincularExtraBebida,
  precioExtraEnProducto,
  grupoExtraEnProducto,
  requiereGrupoEnProducto,
  defectoExtraEnProducto,
  listarObservacionesAdmin,
  guardarObservacion,
  activarObservacion,
  borrarObservacion,
  alcanceDeObservacion,
  fijarAlcanceObservacion,
} from '@shake/supabase'
import type {
  ProductoVenta, ExtraDeProducto, IngredienteExtraible, ExtraBebidaAdmin, ProductoDeExtra,
  ObservacionAdmin, AlcanceObservacion,
} from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { Panel, PageHeader, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

/**
 * Extras por producto: de los ingredientes de la receta de cada alimento,
 * cuáles se pueden vender como extra y a qué precio. El extra se guarda
 * como un producto propio con receta 1:1 al insumo, así que al venderlo
 * cuesta y descuenta inventario como cualquier otro producto.
 */
export default function Extras() {
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [extras, setExtras] = useState<ExtraDeProducto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // --- observaciones (los chips de "menos hielo" / "sin tomate") ---
  const [observaciones, setObservaciones] = useState<ObservacionAdmin[]>([])
  const [obsTexto, setObsTexto] = useState('')
  const [obsEstacion, setObsEstacion] = useState<'bebidas' | 'alimentos'>('bebidas')
  const [guardandoObs, setGuardandoObs] = useState(false)
  // Panel "donde aplica": una observacion abierta a la vez, con su
  // checklist de categorias y productos. Mismo patron que "donde se
  // ofrece" de los extras, a proposito: es la misma pregunta.
  const [obsAbierta, setObsAbierta] = useState<string | null>(null)
  const [alcance, setAlcance] = useState<AlcanceObservacion[]>([])
  const [cargandoAlcance, setCargandoAlcance] = useState(false)
  const [filtroAlcance, setFiltroAlcance] = useState('')
  const [cambiandoAlcance, setCambiandoAlcance] = useState<string | null>(null)

  // --- extras de shakes (leches, proteínas, agua) ---
  const [bebida, setBebida] = useState<ExtraBebidaAdmin[]>([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('0')
  const [nuevoAplicar, setNuevoAplicar] = useState<'shakes' | 'clasico'>('shakes')
  const [guardandoBebida, setGuardandoBebida] = useState(false)
  // Panel "dónde se ofrece": un extra abierto a la vez, con su checklist.
  const [extraAbierto, setExtraAbierto] = useState<string | null>(null)
  const [productosDelExtra, setProductosDelExtra] = useState<ProductoDeExtra[]>([])
  const [cargandoVinculos, setCargandoVinculos] = useState(false)
  const [filtroVinculos, setFiltroVinculos] = useState('')
  const [cambiandoVinculo, setCambiandoVinculo] = useState<string | null>(null)

  // "Vender solo": el extra tambien como boton del menu. Un extra abierto
  // a la vez, con su precio y su categoria destino.
  const [soloAbierto, setSoloAbierto] = useState<string | null>(null)
  const [soloPrecio, setSoloPrecio] = useState('')
  const [soloCategoria, setSoloCategoria] = useState('')
  const [guardandoSolo, setGuardandoSolo] = useState(false)
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([])

  const [abierto, setAbierto] = useState<string | null>(null)
  const [ingredientes, setIngredientes] = useState<IngredienteExtraible[]>([])
  const [cargandoIngs, setCargandoIngs] = useState(false)
  const [precios, setPrecios] = useState<Record<string, string>>({})
  const [guardandoInsumo, setGuardandoInsumo] = useState<string | null>(null)

  // Los extras se ofrecen sobre lo que se prepara en cocina (alimentos).
  const alimentos = useMemo(
    () => productos.filter((p) => p.categorias?.cocinas?.slug === 'alimentos'),
    [productos],
  )

  const extrasPorProducto = useMemo(() => {
    const m = new Map<string, ExtraDeProducto[]>()
    for (const e of extras) {
      const lista = m.get(e.producto_id) ?? []
      lista.push(e)
      m.set(e.producto_id, lista)
    }
    return m
  }, [extras])

  async function cargar() {
    try {
      const [ps, exs, bs, obs, cats] = await Promise.all([
        listarProductosParaVenta(sb), listarExtras(sb), listarExtrasBebidaAdmin(sb),
        listarObservacionesAdmin(sb), listarCategorias(sb),
      ])
      setProductos(ps)
      setExtras(exs)
      setBebida(bs)
      setObservaciones(obs)
      setCategorias(cats.map((c) => ({ id: c.id, nombre: c.nombre })))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function guardarBebida() {
    if (!nuevoNombre.trim()) return
    setGuardandoBebida(true)
    setError(null)
    try {
      await guardarExtraBebida(sb, {
        nombre: nuevoNombre.trim(),
        precio: Number(nuevoPrecio) || 0,
        aplicar: nuevoAplicar,
      })
      setOk(`"${nuevoNombre.trim()}" ya se ofrece en el kiosko.`)
      setNuevoNombre('')
      setNuevoPrecio('0')
      await cargar()
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardandoBebida(false)
    }
  }

  async function abrirVinculos(extraId: string) {
    if (extraAbierto === extraId) {
      setExtraAbierto(null)
      return
    }
    setExtraAbierto(extraId)
    setFiltroVinculos('')
    setProductosDelExtra([])
    setCargandoVinculos(true)
    try {
      setProductosDelExtra(await productosDeExtra(sb, extraId))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargandoVinculos(false)
    }
  }

  async function agregarObservacion() {
    const texto = obsTexto.trim()
    if (!texto) return
    setGuardandoObs(true)
    setError(null)
    try {
      // El orden manda al final de su estación; se reacomoda editando.
      const ultimas = observaciones.filter((o) => o.cocina.toLowerCase().startsWith(obsEstacion[0]))
      await guardarObservacion(sb, obsEstacion, texto, (ultimas.length + 1) * 10)
      setObsTexto('')
      setObservaciones(await listarObservacionesAdmin(sb))
      setOk(`"${texto}" ya aparece en el kiosko.`)
      setTimeout(() => setOk(null), 3500)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardandoObs(false)
    }
  }

  async function alternarObservacion(o: ObservacionAdmin) {
    setError(null)
    try {
      await activarObservacion(sb, o.id, !o.activa)
      setObservaciones(await listarObservacionesAdmin(sb))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function eliminarObservacion(o: ObservacionAdmin) {
    setError(null)
    try {
      await borrarObservacion(sb, o.id)
      setObservaciones(await listarObservacionesAdmin(sb))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  /**
   * Abre (o cierra) el panel de "dónde aplica" de una observación y carga
   * su checklist: las 42 categorías y los 335 productos, marcados.
   */
  async function abrirAlcance(o: ObservacionAdmin) {
    if (obsAbierta === o.id) { setObsAbierta(null); return }
    setObsAbierta(o.id)
    setFiltroAlcance('')
    setAlcance([])
    setCargandoAlcance(true)
    setError(null)
    try {
      setAlcance(await alcanceDeObservacion(sb, o.id))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargandoAlcance(false)
    }
  }

  /**
   * Prende o apaga UNA casilla. Se actualiza la fila en memoria en vez de
   * recargar las 377: recargar la lista entera por cada clic hace que la
   * casilla tarde en responder y que el filtro escrito se sienta lento.
   */
  async function alternarAlcance(fila: AlcanceObservacion) {
    if (!obsAbierta) return
    setCambiandoAlcance(fila.id)
    setError(null)
    try {
      await fijarAlcanceObservacion(sb, obsAbierta, fila.tipo, fila.id, !fila.marcado)
      setAlcance((prev) => prev.map((f) =>
        f.tipo === fila.tipo && f.id === fila.id ? { ...f, marcado: !f.marcado } : f,
      ))
      // Y el contador del renglón, para que "Dónde · 3" no se quede en 2.
      setObservaciones((prev) => prev.map((o) =>
        o.id === obsAbierta
          ? { ...o, alcances: o.alcances + (fila.marcado ? -1 : 1) }
          : o,
      ))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCambiandoAlcance(null)
    }
  }

  /**
   * Precio de un extra SOLO en ese producto. Vacío devuelve el vínculo a
   * cobrar el precio normal del extra.
   */
  /**
   * El "grupo" de este extra en este producto.
   *
   * Dos o más extras del mismo producto con el MISMO texto aquí se ofrecen
   * como "elige uno" en vez de con contador: es así como un paquete ofrece
   * americano frío o caliente, o cómo se eligen las proteínas. El texto da
   * igual mientras se repita — "cafe", "leche", "pan"; vacío = adicional
   * suelto, como toda la vida.
   */
  async function cambiarGrupoVinculo(extraId: string, prod: ProductoDeExtra, valor: string) {
    const limpio = valor.trim() || null
    if (limpio === (prod.grupo ?? null)) return
    setCambiandoVinculo(prod.producto_id)
    setError(null)
    try {
      await grupoExtraEnProducto(sb, extraId, prod.producto_id, limpio)
      setProductosDelExtra((prev) =>
        prev.map((p) => (p.producto_id === prod.producto_id ? { ...p, grupo: limpio } : p)),
      )
      setOk(
        limpio === null
          ? `${prod.nombre}: vuelve a ser un adicional suelto.`
          : `${prod.nombre}: se elige junto con los demás del grupo "${limpio}".`,
      )
      setTimeout(() => setOk(null), 3500)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCambiandoVinculo(null)
    }
  }

  /**
   * "Solo si": este extra aparece nada más cuando ya se eligió algo del
   * grupo que se escriba aquí.
   *
   * Nació de las galletas: son una promoción que solo aplica a los
   * preparados de $125. Colgadas de El Clásico sin más, se podrían poner
   * a un shake de $69 y la promo se regalaría sola; y no ofrecerlas deja
   * sin ellas a quien sí compró el preparado. Vacío = siempre, que es
   * como está todo lo demás.
   */
  async function cambiarRequiereVinculo(extraId: string, prod: ProductoDeExtra, valor: string) {
    const limpio = valor.trim() || null
    if (limpio === (prod.requiere_grupo ?? null)) return
    setCambiandoVinculo(prod.producto_id)
    setError(null)
    try {
      await requiereGrupoEnProducto(sb, extraId, prod.producto_id, limpio)
      setProductosDelExtra((prev) =>
        prev.map((p) =>
          p.producto_id === prod.producto_id ? { ...p, requiere_grupo: limpio } : p,
        ),
      )
      setOk(
        limpio === null
          ? `${prod.nombre}: vuelve a ofrecerse siempre.`
          : `${prod.nombre}: solo aparece cuando ya se eligió algo del grupo "${limpio}".`,
      )
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCambiandoVinculo(null)
    }
  }

  /**
   * "La de casa": con cuál sale el producto si el cliente no toca nada.
   *
   * Hasta hoy lo decidía una expresion regular en el kiosko ("entera", si no
   * "deslactosada"), y cambiarla era un despliegue. El personal la venía
   * corrigiendo a mano en cada venta: en diez días la deslactosada le ganó a
   * la entera por más del doble.
   *
   * El servidor apaga primero a las hermanas de la misma clase en ese
   * producto, así que marcar una desmarca la anterior sola. Como la lista de
   * aquí son PRODUCTOS de un mismo extra, la que se apaga es otro extra que
   * no se ve en pantalla: por eso el aviso lo dice.
   */
  async function cambiarDefectoVinculo(extraId: string, prod: ProductoDeExtra) {
    const nuevo = !prod.por_defecto
    setCambiandoVinculo(prod.producto_id)
    setError(null)
    try {
      await defectoExtraEnProducto(sb, extraId, prod.producto_id, nuevo)
      setProductosDelExtra((prev) =>
        prev.map((p) => (p.producto_id === prod.producto_id ? { ...p, por_defecto: nuevo } : p)),
      )
      setOk(
        nuevo
          ? `${prod.nombre}: sale con esta opción de entrada (la que estaba quedó desmarcada).`
          : `${prod.nombre}: ya no es la opción de entrada.`,
      )
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCambiandoVinculo(null)
    }
  }

  async function cambiarPrecioVinculo(extraId: string, prod: ProductoDeExtra, valor: string) {
    const limpio = valor.trim()
    const precio = limpio === '' ? null : Number(limpio)
    if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return
    if (precio === (prod.precio_propio ?? null)) return
    setCambiandoVinculo(prod.producto_id)
    setError(null)
    try {
      await precioExtraEnProducto(sb, extraId, prod.producto_id, precio)
      setProductosDelExtra((prev) =>
        prev.map((p) => (p.producto_id === prod.producto_id ? { ...p, precio_propio: precio } : p)),
      )
      setOk(
        precio === null
          ? `${prod.nombre}: vuelve a cobrar el precio normal del extra.`
          : `${prod.nombre}: este extra cuesta ${mxn(precio)} aquí.`,
      )
      setTimeout(() => setOk(null), 3500)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCambiandoVinculo(null)
    }
  }

  async function toggleVinculo(extraId: string, prod: ProductoDeExtra) {
    setCambiandoVinculo(prod.producto_id)
    setError(null)
    try {
      await vincularExtraBebida(sb, extraId, prod.producto_id, !prod.ofrecido)
      // Se actualiza en memoria para que la palomita responda al instante;
      // el conteo de la tabla de arriba se refresca completo.
      setProductosDelExtra((prev) =>
        prev.map((p) =>
          p.producto_id === prod.producto_id ? { ...p, ofrecido: !p.ofrecido } : p,
        ),
      )
      setBebida(await listarExtrasBebidaAdmin(sb))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCambiandoVinculo(null)
    }
  }

  /**
   * Abre el panel de "vender solo" de un extra, con lo que ya tiene
   * puesto si es que ya se vende — así el control no pierde el precio
   * que alguien eligió la vez pasada.
   */
  function abrirSolo(e: ExtraBebidaAdmin) {
    if (soloAbierto === e.id) { setSoloAbierto(null); return }
    setSoloAbierto(e.id)
    setSoloPrecio(e.suelto_precio != null ? String(e.suelto_precio) : String(e.precio || ''))
    setSoloCategoria(e.suelto_categoria ?? 'Extras')
    setError(null)
  }

  async function ponerAlaVenta(e: ExtraBebidaAdmin, vender: boolean) {
    setGuardandoSolo(true)
    setError(null)
    try {
      const r = await extraVenderSolo(
        sb, e.id, vender,
        vender ? Number(soloPrecio) || 0 : undefined,
        vender ? soloCategoria : undefined,
      )
      setOk(vender
        ? `«${r.nombre}» ya es un botón del menú, con ${r.renglones_de_receta ?? 0} renglón(es) de receta copiados.`
        : `«${r.nombre}» dejó de venderse por separado. No se borró nada.`)
      setSoloAbierto(null)
      await cargar()
      setTimeout(() => setOk(null), 6000)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setGuardandoSolo(false)
    }
  }

  async function toggleBebida(e: ExtraBebidaAdmin) {
    setError(null)
    try {
      await activarExtraBebida(sb, e.id, !e.activo)
      await cargar()
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  async function abrir(productoId: string) {
    if (abierto === productoId) {
      setAbierto(null)
      return
    }
    setAbierto(productoId)
    setIngredientes([])
    setPrecios({})
    setCargandoIngs(true)
    try {
      setIngredientes(await extrasDisponibles(sb, productoId))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargandoIngs(false)
    }
  }

  async function ofrecer(productoId: string, ing: IngredienteExtraible) {
    const precio = Number(precios[ing.insumo_id])
    if (!(precio > 0)) {
      setError(`Ponle precio de venta a "${ing.nombre}" antes de ofrecerlo como extra.`)
      return
    }
    setGuardandoInsumo(ing.insumo_id)
    setError(null)
    try {
      await guardarExtra(sb, {
        productoId,
        insumoId: ing.insumo_id,
        nombre: `Extra ${ing.nombre}`,
        precio,
      })
      setOk(`"${ing.nombre}" ya se ofrece como extra.`)
      await cargar()
      setIngredientes(await extrasDisponibles(sb, productoId))
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardandoInsumo(null)
    }
  }

  async function quitar(productoId: string, extraId: string) {
    setError(null)
    try {
      await quitarExtra(sb, productoId, extraId)
      await cargar()
      if (abierto) setIngredientes(await extrasDisponibles(sb, abierto))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  if (cargando) return <Loading>Cargando extras…</Loading>

  return (
    <div>
      <PageHeader
        title="Extras"
        subtitle="De los ingredientes de cada alimento, cuáles se pueden vender como extra en caja (guacamole, aderezo…). El costo sale de la receta real; tú defines el precio de venta."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {/* ------------------------------------------------------------------ */}
      {/* Observaciones: los chips que el kiosko ofrece al personalizar.      */}
      {/* Antes vivían escritos en el código y cambiar uno exigía desplegar.  */}
      {/* ------------------------------------------------------------------ */}
      <Panel className="mb-6">
        <h3 className={cx.h3}>Observaciones del pedido</h3>
        <p className={`${cx.muted} text-sm mt-1 mb-4`}>
          Los botones que aparecen al personalizar en el kiosko («menos hielo», «sin tomate»).
          Van a la comanda y a la etiqueta, así que conviene que sean cortos.
          {' '}Con <strong>Dónde aplica</strong> se acota cada una a las categorías o
          productos donde tiene sentido — «Sin plátano» no tiene por qué salir en un café.
          {' '}Una sin acotar sigue saliendo en toda su estación, como hasta hoy.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div>
            <label className={cx.label}>Estación</label>
            <select
              className={cx.input}
              value={obsEstacion}
              onChange={(ev) => setObsEstacion(ev.target.value as 'bebidas' | 'alimentos')}
            >
              <option value="bebidas">Bebidas</option>
              <option value="alimentos">Alimentos</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className={cx.label}>Nueva observación</label>
            <input
              className={cx.input}
              maxLength={24}
              placeholder="Ej. Sin popote"
              value={obsTexto}
              onChange={(ev) => setObsTexto(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') void agregarObservacion() }}
            />
          </div>
          <button
            className={cx.btnPrimary}
            disabled={guardandoObs || !obsTexto.trim()}
            onClick={() => void agregarObservacion()}
          >
            {guardandoObs ? 'Guardando…' : '+ Agregar'}
          </button>
        </div>

        {observaciones.length === 0 && (
          <p className={cx.muted}>Todavía no hay observaciones configuradas.</p>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {['Bebidas', 'Alimentos'].map((estacion) => {
            const suyas = observaciones.filter((o) => o.cocina === estacion)
            if (suyas.length === 0) return null
            return (
              <div key={estacion}>
                <p className="font-mono text-xs uppercase tracking-wide text-sa-green mb-2">{estacion}</p>
                <div className="space-y-1.5">
                  {suyas.map((o) => (
                    <div
                      key={o.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-sa bg-white border text-sm ${
                        o.activa ? 'border-sa-green/40' : 'border-sa-green-ink/10 opacity-60'
                      }`}
                    >
                      <span className="flex-1 truncate text-sa-green-ink">{o.texto}</span>
                      <button
                        className={`font-mono text-[11px] uppercase tracking-wide ${
                          obsAbierta === o.id
                            ? 'text-sa-green font-bold'
                            : o.alcances > 0
                              ? 'text-sa-green hover:text-sa-green-deep'
                              : 'text-sa-green-ink/60 hover:text-sa-green-ink'
                        }`}
                        onClick={() => void abrirAlcance(o)}
                        title={o.alcances > 0
                          ? `Acotada a ${o.alcances} lugar(es)`
                          : 'Sale en toda su estación'}
                      >
                        {o.alcances > 0 ? `Dónde · ${o.alcances}` : 'Dónde aplica'}
                      </button>
                      <button
                        className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/60 hover:text-sa-green-ink"
                        onClick={() => void alternarObservacion(o)}
                      >
                        {o.activa ? 'Apagar' : 'Prender'}
                      </button>
                      <button
                        className="font-mono text-[11px] uppercase tracking-wide text-sa-strawberry/70 hover:text-sa-strawberry"
                        onClick={() => void eliminarObservacion(o)}
                        title="Borrar definitivamente"
                      >
                        Borrar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Dónde aplica: el checklist de la observación abierta. */}
        {obsAbierta && (() => {
          const abierta = observaciones.find((o) => o.id === obsAbierta)
          const f = filtroAlcance.trim().toLowerCase()
          const filtradas = f
            ? alcance.filter((a) =>
                a.nombre.toLowerCase().includes(f) || a.contexto.toLowerCase().includes(f))
            : alcance
          const marcadas = alcance.filter((a) => a.marcado)
          const categorias = filtradas.filter((a) => a.tipo === 'categoria')
          const productos = filtradas.filter((a) => a.tipo === 'producto')

          const Casilla = ({ a }: { a: AlcanceObservacion }) => (
            <button
              key={`${a.tipo}-${a.id}`}
              onClick={() => void alternarAlcance(a)}
              disabled={cambiandoAlcance === a.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-sa border text-left text-sm w-full disabled:opacity-40 ${
                a.marcado
                  ? 'border-sa-green bg-sa-green/5'
                  : 'border-sa-green-ink/10 bg-white hover:border-sa-green-ink/25'
              }`}
            >
              <span className={`font-mono text-xs ${a.marcado ? 'text-sa-green' : 'text-sa-green-ink/25'}`}>
                {a.marcado ? '✓' : '○'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sa-green-ink">{a.nombre}</span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                  {a.contexto}
                </span>
              </span>
            </button>
          )

          return (
            <div className="mt-6 pt-5 border-t border-sa-green-ink/10">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h4 className="font-display text-xl text-sa-green-ink">
                  ¿Dónde aplica «{abierta?.texto}»?
                </h4>
                <button
                  className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/60 hover:text-sa-green-ink"
                  onClick={() => setObsAbierta(null)}
                >
                  Cerrar
                </button>
              </div>

              <p className={`${cx.muted} text-sm mb-4`}>
                {marcadas.length === 0 ? (
                  <>
                    Ahora mismo <strong>sale en todo {abierta?.cocina}</strong>, porque no tiene
                    nada marcado. En cuanto marques algo, solo saldrá ahí.
                  </>
                ) : (
                  <>
                    Marcada en <strong>{marcadas.length}</strong> lugar(es). Desmárcalos todos
                    para que vuelva a salir en toda la estación.
                    {' '}Marcar una categoría alcanza a todos sus productos: para los shakes es
                    un clic en vez de doscientos cincuenta.
                  </>
                )}
              </p>

              <input
                className={`${cx.input} mb-4`}
                placeholder="Buscar categoría o producto…"
                value={filtroAlcance}
                onChange={(ev) => setFiltroAlcance(ev.target.value)}
              />

              {cargandoAlcance ? (
                <p className={cx.muted}>Cargando…</p>
              ) : (
                <div className="space-y-5">
                  {categorias.length > 0 && (
                    <div>
                      <p className="font-mono text-xs uppercase tracking-wide text-sa-green mb-2">
                        Categorías ({categorias.length})
                      </p>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {categorias.map((a) => <Casilla key={`c-${a.id}`} a={a} />)}
                      </div>
                    </div>
                  )}
                  {productos.length > 0 && (
                    <div>
                      <p className="font-mono text-xs uppercase tracking-wide text-sa-green mb-2">
                        Productos sueltos ({productos.length})
                      </p>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 max-h-96 overflow-y-auto pr-1">
                        {productos.map((a) => <Casilla key={`p-${a.id}`} a={a} />)}
                      </div>
                    </div>
                  )}
                  {filtradas.length === 0 && (
                    <p className={cx.muted}>Nada con ese nombre.</p>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* Extras de shakes: leches, proteínas, agua. Aquí la sucursal da de  */}
      {/* alta una leche o un sabor nuevo y aparece en el kiosko solo; y     */}
      {/* cuando un sabor se acaba, lo apaga al momento sin borrar nada.     */}
      {/* ------------------------------------------------------------------ */}
      <Panel className="mb-6">
        <h3 className={cx.h3}>Leches, proteínas y agua de los shakes</h3>
        <p className={`${cx.muted} text-sm mt-1 mb-4`}>
          El nombre decide dónde sale en el kiosko: <b>Leche …</b> entra al grupo de
          leches, <b>Proteína MARCA - Sabor</b> al de proteínas (agrupadas por marca),
          y <b>Agua</b> a la base. Todo lo demás sale como adicional.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="lg:col-span-2">
            <span className={cx.label}>Nombre</span>
            <input
              className={cx.input}
              placeholder="Proteína GHOST - Chocolate  ·  Leche light"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
          </div>
          <div>
            <span className={cx.label}>Precio extra ($)</span>
            <input
              className={cx.input}
              type="number"
              min="0"
              value={nuevoPrecio}
              onChange={(e) => setNuevoPrecio(e.target.value)}
            />
          </div>
          <div>
            <span className={cx.label}>Ofrecer en</span>
            <select
              className={cx.input}
              value={nuevoAplicar}
              onChange={(e) => setNuevoAplicar(e.target.value as 'shakes' | 'clasico')}
            >
              <option value="shakes">Todos los shakes</option>
              <option value="clasico">Solo El Clásico</option>
            </select>
          </div>
        </div>
        <button
          className={`${cx.btnPrimary} mt-4`}
          disabled={guardandoBebida || !nuevoNombre.trim()}
          onClick={() => void guardarBebida()}
        >
          {guardandoBebida ? 'Guardando…' : 'Agregar al kiosko'}
        </button>

        {bebida.length > 0 && (
          <div className={`${cx.tableWrap} mt-5`}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Extra</th>
                  <th className={cx.thNum}>Precio</th>
                  <th className={cx.th}>En cuántos productos</th>
                  <th className={cx.th}>Disponible</th>
                  <th className={cx.th}>Solo en el menú</th>
                  <th className={cx.thNum}></th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {bebida.map((e) => (
                  <Fragment key={e.id}>
                    <tr className={cx.tr} style={{ opacity: e.activo ? 1 : 0.55 }}>
                      <td className={`${cx.td} font-medium`}>{e.nombre}</td>
                      <td className={cx.tdNum}>{e.precio > 0 ? mxn(e.precio) : 'Gratis'}</td>
                      <td className={cx.td}>
                        {e.ligado_a > 0 ? (
                          e.ligado_a
                        ) : (
                          <span className="text-sa-strawberry text-xs">
                            en ninguno — ábrelo con &quot;Dónde se ofrece&quot;
                          </span>
                        )}
                      </td>
                      <td className={cx.td}>
                        <Chip tone={e.activo ? 'si' : 'no'}>{e.activo ? 'Sí' : 'Apagado'}</Chip>
                      </td>
                      <td className={cx.td}>
                        {e.vende_solo ? (
                          <span className="text-xs text-sa-green">
                            Sí · {e.suelto_precio != null ? mxn(e.suelto_precio) : '—'}
                            {e.suelto_categoria ? ` en ${e.suelto_categoria}` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-sa-green-ink/40">No</span>
                        )}
                      </td>
                      <td className={cx.tdNum}>
                        <div className="inline-flex gap-2">
                          <button className={cx.btnSec} onClick={() => void abrirVinculos(e.id)}>
                            {extraAbierto === e.id ? 'Cerrar' : 'Dónde se ofrece'}
                          </button>
                          <button className={cx.btnSec} onClick={() => abrirSolo(e)}>
                            {soloAbierto === e.id ? 'Cerrar' : 'Vender solo'}
                          </button>
                          <button className={cx.btnSec} onClick={() => void toggleBebida(e)}>
                            {e.activo ? 'Apagar' : 'Prender'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Vender solo: el extra tambien como boton del menu. */}
                    {soloAbierto === e.id && (
                      <tr>
                        <td colSpan={6} className="px-5 py-4 bg-sa-cream-soft/60">
                          <p className="text-sm text-sa-green-ink/75 leading-relaxed mb-3 max-w-3xl">
                            Ponerlo a la venta por separado crea un <b>producto propio</b> en el
                            menú —para quien entra solo por un extra de chipotle o de
                            pepinillos— con la <b>receta copiada</b>, así que descuenta inventario
                            igual que cualquier otro. El extra sigue existiendo tal cual dentro de
                            los productos donde ya se ofrece: son dos cosas distintas, no una
                            movida.
                          </p>

                          {e.vende_solo ? (
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm">
                                Hoy se vende como <b>«{e.suelto_nombre}»</b>
                                {e.suelto_precio != null && <> a {mxn(e.suelto_precio)}</>}
                                {e.suelto_categoria && <> en <b>{e.suelto_categoria}</b></>}.
                              </span>
                              <button
                                className={cx.btnSec}
                                disabled={guardandoSolo}
                                onClick={() => void ponerAlaVenta(e, false)}
                              >
                                {guardandoSolo ? 'Quitando…' : 'Quitar del menú'}
                              </button>
                              <span className={`${cx.muted} text-xs`}>
                                Quitarlo no borra nada: se apaga y conserva su historial de ventas.
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-end gap-3 flex-wrap">
                              <div>
                                <label className={cx.label}>Precio suelto</label>
                                <input
                                  className={cx.input}
                                  style={{ maxWidth: 140 }}
                                  type="number"
                                  value={soloPrecio}
                                  onChange={(ev) => setSoloPrecio(ev.target.value)}
                                />
                              </div>
                              <div>
                                <label className={cx.label}>¿En qué botón del menú?</label>
                                <select
                                  className={cx.input}
                                  style={{ maxWidth: 240 }}
                                  value={soloCategoria}
                                  onChange={(ev) => setSoloCategoria(ev.target.value)}
                                >
                                  {categorias.map((c) => (
                                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                                  ))}
                                </select>
                              </div>
                              <button
                                className={cx.btnPrimary}
                                disabled={guardandoSolo || !(Number(soloPrecio) > 0)}
                                onClick={() => void ponerAlaVenta(e, true)}
                              >
                                {guardandoSolo ? 'Poniendo…' : 'Ponerlo en el menú'}
                              </button>
                              <span className={`${cx.muted} text-xs max-w-xs`}>
                                El precio no se adivina: es una decisión del negocio. El botón
                                aparece en el kiosko en cuanto la categoría tenga algo dentro.
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    {extraAbierto === e.id && (
                      <tr>
                        <td colSpan={6} className="px-5 py-4 bg-sa-cream-soft/60">
                          {cargandoVinculos ? (
                            <p className={cx.muted}>Cargando productos…</p>
                          ) : (
                            <>
                              <div className="flex items-center gap-3 mb-3 flex-wrap">
                                <input
                                  className={cx.input}
                                  style={{ maxWidth: 280 }}
                                  placeholder="Filtrar… (hydration, jamaica, latte)"
                                  value={filtroVinculos}
                                  onChange={(ev) => setFiltroVinculos(ev.target.value)}
                                />
                                <span className={`${cx.muted} text-xs`}>
                                  Palomita = se ofrece en ese producto — bebidas Y alimentos.
                                  Un producto nuevo de costeo aparece aquí solo.
                                  La <b>estrella</b> es la opción con la que sale de entrada:
                                  marcarla desmarca la que estaba.
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {productosDelExtra
                                  .filter((pr) =>
                                    pr.nombre.toLowerCase().includes(filtroVinculos.toLowerCase()),
                                  )
                                  .map((pr) => (
                                    <div
                                      key={pr.producto_id}
                                      className={`flex items-center gap-2 px-3 py-2 rounded-sa bg-white border text-sm ${
                                        pr.ofrecido
                                          ? 'border-sa-green/40'
                                          : 'border-sa-green-ink/10'
                                      } ${cambiandoVinculo === pr.producto_id ? 'opacity-50' : ''}`}
                                    >
                                      <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          className="w-4 h-4 accent-sa-green shrink-0"
                                          checked={pr.ofrecido}
                                          disabled={cambiandoVinculo === pr.producto_id}
                                          onChange={() => void toggleVinculo(e.id, pr)}
                                        />
                                        <span className="truncate text-sa-green-ink">{pr.nombre}</span>
                                      </label>
                                      {/* Precio de ESTE extra en ESTE producto: es lo que
                                          hace que la leche cueste $10 en un americano y $0
                                          en un shake, o que cambiar de proteína sume $10.
                                          Vacío = cobra el precio normal del extra. */}
                                      {pr.ofrecido && (
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          title={`Precio en ${pr.nombre}. Vacío = ${mxn(pr.precio_base)} (el del extra).`}
                                          placeholder={String(pr.precio_base)}
                                          defaultValue={pr.precio_propio ?? ''}
                                          disabled={cambiandoVinculo === pr.producto_id}
                                          onBlur={(ev) => void cambiarPrecioVinculo(e.id, pr, ev.target.value)}
                                          className="w-16 shrink-0 px-2 py-1 border border-sa-green-ink/15 rounded text-right font-mono text-xs bg-sa-cream-soft/40"
                                        />
                                      )}
                                      {/* "La de casa": con cuál sale el producto si el
                                          cliente no toca nada. Solo tiene sentido donde se
                                          elige una entre varias (leches, proteínas, o un
                                          grupo escrito): en un adicional suelto el servidor
                                          la rechaza y lo dice. */}
                                      {pr.ofrecido && (
                                        <button
                                          type="button"
                                          title={
                                            pr.por_defecto
                                              ? `Es la opción de entrada en ${pr.nombre}. Toca para quitarla.`
                                              : `Hacer que ${pr.nombre} salga con esta opción de entrada.`
                                          }
                                          aria-pressed={pr.por_defecto}
                                          disabled={cambiandoVinculo === pr.producto_id}
                                          onClick={() => void cambiarDefectoVinculo(e.id, pr)}
                                          className={`w-7 h-7 shrink-0 rounded-full text-sm leading-none transition-colors ${
                                            pr.por_defecto
                                              ? 'bg-sa-banana text-sa-coffee'
                                              : 'bg-white border border-sa-green-ink/15 text-sa-green-ink/25 hover:text-sa-green-ink/60'
                                          }`}
                                        >
                                          ★
                                        </button>
                                      )}
                                      {/* Grupo: los extras con el mismo texto aquí se
                                          ofrecen como "elige uno". Es lo que convierte
                                          dos americanos en un botón de frío/caliente. */}
                                      {pr.ofrecido && (
                                        <input
                                          type="text"
                                          title={`Grupo en ${pr.nombre}. Los extras con el mismo texto se eligen entre sí (uno solo). Vacío = adicional suelto.`}
                                          placeholder="grupo"
                                          defaultValue={pr.grupo ?? ''}
                                          disabled={cambiandoVinculo === pr.producto_id}
                                          onBlur={(ev) => void cambiarGrupoVinculo(e.id, pr, ev.target.value)}
                                          className="w-20 shrink-0 px-2 py-1 border border-sa-green-ink/15 rounded font-mono text-xs bg-sa-cream-soft/40"
                                        />
                                      )}
                                      {/* "Solo si": este extra aparece nada más cuando ya
                                          se eligió algo de ese grupo. Es lo que hace que
                                          las galletas —promoción de los preparados— no se
                                          puedan poner a un shake sin preparado. */}
                                      {pr.ofrecido && (
                                        <input
                                          type="text"
                                          title={`En ${pr.nombre}, ofrecer este extra SOLO cuando ya se eligió algo del grupo que escribas aquí. Vacío = siempre.`}
                                          placeholder="solo si…"
                                          defaultValue={pr.requiere_grupo ?? ''}
                                          disabled={cambiandoVinculo === pr.producto_id}
                                          onBlur={(ev) => void cambiarRequiereVinculo(e.id, pr, ev.target.value)}
                                          className="w-20 shrink-0 px-2 py-1 border border-sa-green-ink/15 rounded font-mono text-xs bg-sa-cream-soft/40"
                                        />
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <h3 className={`${cx.h3} mb-3`}>Extras de alimentos (de la receta)</h3>

      {alimentos.length === 0 ? (
        <Panel><p className={cx.muted}>No hay alimentos activos en el catálogo.</p></Panel>
      ) : (
        <div className="space-y-4">
          {alimentos.map((p) => {
            const misExtras = extrasPorProducto.get(p.id) ?? []
            const estaAbierto = abierto === p.id
            return (
              <Panel key={p.id}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className={cx.h3}>{p.nombre}</h3>
                    <p className={`${cx.muted} text-sm mt-1`}>
                      {misExtras.length === 0
                        ? 'Sin extras configurados'
                        : `${misExtras.length} extra${misExtras.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <button className={cx.btnSec} onClick={() => void abrir(p.id)}>
                    {estaAbierto ? 'Cerrar' : 'Configurar extras'}
                  </button>
                </div>

                {misExtras.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {misExtras.map((e) => (
                      <span
                        key={e.extra_id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sa-mint/20 text-sa-green-ink text-sm"
                      >
                        {e.nombre} · {mxn(e.precio)}
                        <button
                          onClick={() => void quitar(p.id, e.extra_id)}
                          className="text-sa-strawberry hover:brightness-110"
                          title="Dejar de ofrecerlo en este producto"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {estaAbierto && (
                  <div className="mt-4 border-t border-sa-green-ink/10 pt-4">
                    {cargandoIngs ? (
                      <p className={cx.muted}>Cargando ingredientes…</p>
                    ) : ingredientes.length === 0 ? (
                      <p className={cx.muted}>
                        Este producto no tiene ingredientes en su receta todavía.
                      </p>
                    ) : (
                      <div className={cx.tableWrap}>
                        <table className={cx.table}>
                          <thead>
                            <tr className={cx.thead}>
                              <th className={cx.th}>Ingrediente</th>
                              <th className={cx.thNum}>Lleva en receta</th>
                              <th className={cx.thNum}>Costo</th>
                              <th className={cx.thNum}>Precio de venta</th>
                              <th className={cx.thNum}></th>
                            </tr>
                          </thead>
                          <tbody className={cx.tbody}>
                            {ingredientes.map((ing) => (
                              <tr key={ing.insumo_id} className={cx.tr}>
                                <td className={`${cx.td} font-medium`}>{ing.nombre}</td>
                                <td className={cx.tdNum}>
                                  {ing.cantidad_receta} {ing.unidad}
                                </td>
                                <td className={cx.tdNum}>{mxn(ing.costo_en_receta)}</td>
                                <td className={cx.tdNum}>
                                  {ing.ya_es_extra ? (
                                    <Chip tone="si">Ya se ofrece</Chip>
                                  ) : (
                                    <input
                                      className={cx.input}
                                      style={{ width: 110, textAlign: 'right' }}
                                      type="number"
                                      min="0"
                                      placeholder="0.00"
                                      value={precios[ing.insumo_id] ?? ''}
                                      onChange={(e) =>
                                        setPrecios((prev) => ({
                                          ...prev,
                                          [ing.insumo_id]: e.target.value,
                                        }))
                                      }
                                    />
                                  )}
                                </td>
                                <td className={cx.tdNum}>
                                  {!ing.ya_es_extra && (
                                    <button
                                      className={cx.btnSec}
                                      disabled={guardandoInsumo === ing.insumo_id}
                                      onClick={() => void ofrecer(p.id, ing)}
                                    >
                                      {guardandoInsumo === ing.insumo_id ? 'Guardando…' : 'Ofrecer'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
