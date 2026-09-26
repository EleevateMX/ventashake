import React, { useState } from 'react'
import {
  mxn, esBase, esGalletaPromo, esProteina, esDobleScoop, dobleScoopDe,
  ordenarBases, baseDeCasa, opcionDeGrupo, grupoEsOpcional, extraDisponible, gruposDeExtras,
  notaDeBase, baseCobrada,
} from '@shake/utils'
import type { ProductoVenta, ExtraDeProducto } from '@shake/supabase'

interface Props {
  producto: ProductoVenta | null
  extras: ExtraDeProducto[]
  /** Chips por estación, administrados desde Admin -> Observaciones. */
  /**
   * Los chips que aplican a ESTE producto, ya resueltos por
   * `observacionesDeProducto`. `undefined` = no cargaron (ahí sí entra el
   * respaldo del código); `[]` = a este producto no le aplica ninguna, y
   * entonces no se pinta nada.
   */
  observaciones?: string[]
  onCerrar: () => void
  onAgregar: (nota: string | null, extrasElegidos: ExtraDeProducto[]) => void
}

/**
 * La de casa la marca gerencia en Admin -> Extras. Estos respaldos solo
 * corren mientras nadie la haya marcado: son la regla que vivía escrita
 * aquí, conservada para que nada cambie de golpe el día del despliegue.
 *
 * A diferencia de la leche, la proteína SÍ entra como línea del ticket
 * aunque cueste $0: es el ingrediente principal y su scoop tiene que salir
 * del inventario. Si viajara pegada al shake como la leche, el bote nunca
 * se descontaría.
 */
// La de casa es la Gold Standard de Optimum en cualquier sabor: los shakes
// de chocolate solo ofrecen chocolates y los de vainilla puras vainillas,
// así que con la marca basta (en El Clásico, que trae ambas, el orden
// alfabético deja Chocolate primero — igual que siempre).
/**
 * A partir de cuántas opciones un grupo se pliega.
 *
 * Cinco no es un número mágico: es donde deja de caber en pantalla junto
 * con lo demás. Los once «Preparado: …» de El Clásico obligaban a bajar
 * con la rueda solo para llegar a las galletas; los grupos de combo
 * —«¿qué wrap?», «¿qué café?»— tienen dos o tres y se quedan a la vista,
 * porque plegar dos botones no ahorra nada y sí agrega un toque.
 */
const GRUPO_LARGO = 4

const PROTEINA_DEFAULT = /optimum/i

/**
 * Orden de marcas pedido por el negocio: de la más económica a la más
 * elevada de costo. Una marca fuera de esta lista se va al final, en
 * alfabético — así una marca nueva dada de alta en Admin no truena nada.
 */
const ORDEN_MARCAS = [
  'OPTIMUM',
  'BIRDMAN FALCON',
  'BIRDMAN FALCON PERFORMANCE',
  'BIRDMAN FITMINGO',
  'CBUM',
  'ISO 100',
  'ISOPURE',
]

/**
 * Observaciones rápidas, por estación. Chips y no texto libre a propósito:
 * el campo de indicaciones se quitó porque frenaba la caja y llegaba a
 * cocina con cualquier cosa; esto captura lo que de verdad se pide, en un
 * toque, y la etiqueta ya sabe abreviarlas ("menos hielo" → +-HIELO,
 * "sin tomate" → +S/TOMATE).
 */
const OBSERVACIONES_RESPALDO: Record<string, string[]> = {
  bebidas: ['Menos hielo', 'Sin hielo', 'Extra frío', 'Sin azúcar', 'Sin crema'],
  alimentos: ['Sin tomate', 'Sin cebolla', 'Sin queso', 'Sin aderezo', 'Aderezo aparte', 'Sin picante'],
}

/**
 * "Proteína BIRDMAN - Fitmingo Blueberry" → marca BIRDMAN, sabor "Fitmingo
 * Blueberry". La marca sale del NOMBRE, no de una lista fija: cuando Admin dé
 * de alta una marca nueva (GHOST, ISO 100…), su botón aparece solo.
 */
function marcaYSabor(nombre: string): { marca: string; sabor: string } {
  const m = nombre.trim().match(/^prote[ií]na\s+(.+?)\s*[-–]\s*(.+)$/i)
  if (m) return { marca: m[1].toUpperCase(), sabor: m[2] }
  return { marca: 'OTRAS', sabor: nombre.replace(/^prote[ií]na\s*/i, '') }
}

/**
 * Al tocar "+" en un shake: elegir tipo de leche, adicionales (creatina,
 * matcha, otro scoop…) y escribir alguna indicación.
 *
 * Dos comportamientos distintos a propósito:
 *   · Leche  → una sola, como radio. Cambiar de leche no es sumar otra leche.
 *   · Extras → cantidad, con + y −. Sí se acumulan.
 *
 * Los extras en $0 se muestran igual: el tipo de leche es información que la
 * cocina necesita en la comanda aunque no cueste. Cuando el negocio les ponga
 * precio en Admin → Extras, empiezan a cobrar solos sin tocar nada aquí.
 */
export function ModalExtras({ producto, extras, observaciones: catalogoObs, onCerrar, onAgregar }: Props) {
  const [leche, setLeche] = useState<string | null>(null)
  const [verLeches, setVerLeches] = useState(false)
  const [proteina, setProteina] = useState<string | null>(null)
  const [verProteinas, setVerProteinas] = useState(false)
  const [marcaAbierta, setMarcaAbierta] = useState<string | null>(null)
  const [galleta, setGalleta] = useState<string | null>(null)
  const [dobleScoop, setDobleScoop] = useState(false)
  /** Qué grupo largo está desplegado. Solo uno a la vez. */
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null)

  /** Elección dentro de cada grupo configurado en Admin ({grupo: extra_id}). */
  const [porGrupo, setPorGrupo] = useState<Record<string, string>>({})
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [observaciones, setObservaciones] = useState<string[]>([])

  if (!producto) return null

  const leches = ordenarBases(extras.filter((e) => esBase(e.nombre)))
  const proteinas = extras.filter((e) => esProteina(e.nombre))
  const dobles = extras.filter((e) => esDobleScoop(e.nombre))
  /**
   * Grupos armados desde Admin (producto_extras.grupo): los extras que
   * comparten grupo se eligen entre sí, uno solo. Es lo que permite
   * ofrecer "americano frío o caliente" dentro de un paquete sin crear un
   * producto por combinación.
   *
   * La regla vive en `@shake/utils` y no aquí: escrita dentro del kiosko
   * no se podía comprobar sin tener la pantalla enfrente, y el día que
   * se reportó «en la chapata no aparece americano frío o caliente» no
   * había nadie en la tienda para mirarla. Ahora hay una prueba que usa
   * la respuesta real del servidor.
   */
  const grupos = gruposDeExtras(extras)
  const gruposConfigurados = grupos.map((g) => g.grupo)
  /**
   * Lo elegido en cada grupo. Si el cliente no tocó el grupo vale lo que
   * diga `opcionDeGrupo` — que para un grupo con precio es **nada**: el
   * kiosko no preselecciona algo que cobra.
   *
   * Se calcula aquí arriba, antes que las galletas y los adicionales,
   * porque hay extras que dependen de que un grupo esté resuelto.
   */
  const elegidosDeGrupo = grupos
    .map(({ grupo, opciones }) =>
      opciones.find((e) => e.extra_id === porGrupo[grupo]) ?? opcionDeGrupo(opciones),
    )
    .filter((e): e is ExtraDeProducto => e !== null)
  const gruposElegidos = new Set(elegidosDeGrupo.map((e) => e.grupo as string))

  /**
   * Las galletas y los adicionales pueden estar acotados a un grupo
   * (`requiere_grupo`). Mientras ese grupo no tenga nada elegido, ni se
   * pintan: las galletas son promoción de los preparados, y ofrecerlas
   * sobre un shake sin preparado es regalar la promo.
   */
  const galletas = extras.filter(
    (e) => esGalletaPromo(e) && extraDisponible(e, gruposElegidos),
  )
  const adicionales = extras.filter(
    (e) =>
      !esBase(e.nombre) &&
      !esGalletaPromo(e) &&
      !esProteina(e.nombre) &&
      !esDobleScoop(e.nombre) &&
      !(e.grupo && gruposConfigurados.includes(e.grupo)) &&
      extraDisponible(e, gruposElegidos),
  )
  const hayAgua = leches.some((l) => /^agua\b/i.test(l.nombre))
  const slugCocina = producto.categorias?.cocinas?.slug ?? ''
  // Las de la base mandan; el catálogo del código solo cubre el arranque
  // (y el caso de que la consulta falle).
  const obsDisponibles = catalogoObs ?? OBSERVACIONES_RESPALDO[slugCocina] ?? []

  // Marcas en el orden del negocio (económica → elevada); las que no están
  // en la lista van al final en alfabético.
  const marcas = [...new Set(proteinas.map((p) => marcaYSabor(p.nombre).marca))].sort((a, b) => {
    const ia = ORDEN_MARCAS.indexOf(a)
    const ib = ORDEN_MARCAS.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })

  // La de casa viene marcada y es la única visible hasta que el cliente pide
  // otra. Así el caso común es cero toques.
  const lecheDefault = baseDeCasa(leches)
  const lecheElegida = leches.find((l) => l.extra_id === leche) ?? lecheDefault
  const galletaElegida = galletas.find((g) => g.extra_id === galleta) ?? null
  const proteinaDefault =
    proteinas.find((p) => p.por_defecto) ??
    proteinas.find((p) => PROTEINA_DEFAULT.test(p.nombre)) ??
    proteinas[0] ?? null
  const proteinaElegida = proteinas.find((p) => p.extra_id === proteina) ?? proteinaDefault
  /**
   * El doble scoop de ESTA proteína.
   *
   * La regla vive en `dobleScoopDe` (@shake/utils), con pruebas: elegir
   * mal aquí no es un detalle de pantalla, es cobrar de menos.
   */
  const doble = dobleScoopDe(dobles, proteinaElegida)
  const totalExtras =
    (lecheElegida?.precio ?? 0) +
    (proteinaElegida?.precio ?? 0) +
    (galletaElegida?.precio ?? 0) +
    (dobleScoop && doble ? doble.precio : 0) +
    elegidosDeGrupo.reduce((s, e) => s + e.precio, 0) +
    adicionales.reduce((s, e) => s + e.precio * (cantidades[e.extra_id] ?? 0), 0)

  function cambiar(id: string, delta: number) {
    setCantidades((prev) => {
      const n = Math.max(0, (prev[id] ?? 0) + delta)
      const next = { ...prev }
      if (n === 0) delete next[id]
      else next[id] = n
      return next
    })
  }

  function limpiar() {
    setLeche(null); setVerLeches(false); setProteina(null); setVerProteinas(false)
    setMarcaAbierta(null); setGalleta(null); setCantidades({}); setObservaciones([])
    setDobleScoop(false); setPorGrupo({}); setGrupoAbierto(null)
  }

  /**
   * Qué vaso va a necesitar barra, contando lo elegido.
   *
   * El Clásico es de 16 oz, pero con un «Preparado» encima es un signature
   * y va en el de 20. Enterarse hasta la pantalla de barra es enterarse
   * tarde: quien captura es quien a veces ya trae el vaso en la mano.
   * El tamaño sale del catálogo, no de una lista de nombres aquí adentro.
   */
  const vaso = Math.max(
    producto.onzas ?? 0,
    ...elegidosDeGrupo.map((e) => e.onzas ?? 0),
    ...(proteinaElegida ? [proteinaElegida.onzas ?? 0] : []),
  )
  const vasoCambia = vaso > (producto.onzas ?? 0)

  function confirmar() {
    // La base gratis viaja pegada al shake como nota (verla suelta en la
    // comanda confundía de cuál vaso era); una base con precio va como línea
    // hija cobrada. Las reglas viven en @shake/utils porque el POS usa las
    // mismas: si divergieran, la misma venta saldría distinta según por
    // dónde se cobró.
    const cobrada = baseCobrada(lecheElegida)
    // Base y observaciones viajan juntas, separadas por coma: la etiqueta ya
    // parte por coma y abrevia cada fragmento por su cuenta.
    const nota = [notaDeBase(lecheElegida), ...observaciones].filter(Boolean).join(', ') || null
    const elegidos = [
      ...(cobrada ? [cobrada] : []),
      ...(proteinaElegida ? [proteinaElegida] : []),
      ...(dobleScoop && doble ? [doble] : []),
      ...(galletaElegida ? [galletaElegida] : []),
      ...elegidosDeGrupo,
      ...adicionales.flatMap((e) =>
        Array.from({ length: cantidades[e.extra_id] ?? 0 }, () => e),
      ),
    ]
    onAgregar(nota, elegidos)
    limpiar()
  }

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-deep/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-sa-cream-paper rounded-sa-lg w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl">
        <header className="px-6 pt-6 pb-4 border-b border-sa-green-ink/10">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-sa-green/70">
            Personaliza tu shake
          </p>
          <h2 className="font-display text-3xl text-sa-green-ink leading-tight mt-1">
            {producto.nombre}
          </h2>
          {producto.descripcion && (
            <p className="font-body text-sm text-sa-green-ink/60 mt-1">{producto.descripcion}</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {leches.length > 0 && (
            <section>
              <h3 className="font-display text-xl text-sa-green-ink">
                {hayAgua ? '¿Con qué lo preparamos?' : 'Tipo de leche'}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                {verLeches ? 'Elige una · sustituye la de la receta' : 'Toca para cambiar'}
              </p>

              {/* Plegado: solo la elegida. La mayoría de los pedidos se va con
                  la de casa, así que no tiene sentido mostrar cuatro botones
                  cada vez. Al tocarla se abren todas. */}
              {!verLeches ? (
                <button
                  onClick={() => setVerLeches(true)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-4 rounded-sa border-2 border-sa-green bg-sa-green text-sa-cream text-left"
                >
                  <span className="font-display text-lg leading-tight">
                    {lecheElegida?.nombre ?? 'Sin leche'}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide opacity-80 flex-shrink-0">
                    Cambiar ▾
                  </span>
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {leches.map((l) => {
                    const activa = lecheElegida?.extra_id === l.extra_id
                    return (
                      <button
                        key={l.extra_id}
                        onClick={() => { setLeche(l.extra_id); setVerLeches(false) }}
                        className={`px-4 py-3 rounded-sa text-left transition-all border-2 ${
                          activa
                            ? 'bg-sa-green text-sa-cream border-sa-green'
                            : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-green/40'
                        }`}
                      >
                        <span className="font-display text-base leading-tight block">{l.nombre}</span>
                        {l.precio > 0 && (
                          <span className="font-mono text-xs opacity-70">+{mxn(l.precio)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {proteinas.length > 0 && (
            <section>
              <h3 className="font-display text-xl text-sa-green-ink">Proteína</h3>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                {verProteinas ? 'Elige una' : 'Toca para cambiarla'}
              </p>
              {/* Dos pasos: marca y luego sabor. Con diez sabores la lista
                  plana ya no se podía leer, y va a crecer — las marcas salen
                  del nombre del extra, así que una marca nueva dada de alta
                  en Admin trae su botón sola. */}
              {!verProteinas ? (
                <button
                  onClick={() => {
                    setVerProteinas(true)
                    setMarcaAbierta(
                      proteinaElegida ? marcaYSabor(proteinaElegida.nombre).marca : marcas[0] ?? null,
                    )
                  }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-4 rounded-sa border-2 border-sa-green bg-sa-green text-sa-cream text-left"
                >
                  <span className="font-display text-lg leading-tight">
                    {proteinaElegida?.nombre ?? 'Sin proteína'}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide opacity-80 flex-shrink-0">
                    Cambiar ▾
                  </span>
                </button>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {marcas.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMarcaAbierta(m)}
                        className={`px-4 py-2.5 rounded-full font-mono text-xs uppercase tracking-wider transition-all ${
                          marcaAbierta === m
                            ? 'bg-sa-green-ink text-sa-cream'
                            : 'bg-white border border-sa-green-ink/15 text-sa-green-ink'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {proteinas
                      .filter((p) => marcaYSabor(p.nombre).marca === marcaAbierta)
                      .map((p) => {
                        const activa = proteinaElegida?.extra_id === p.extra_id
                        return (
                          <button
                            key={p.extra_id}
                            onClick={() => { setProteina(p.extra_id); setVerProteinas(false) }}
                            className={`px-4 py-3 rounded-sa text-left transition-all border-2 ${
                              activa
                                ? 'bg-sa-green text-sa-cream border-sa-green'
                                : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-green/40'
                            }`}
                          >
                            <span className="font-display text-base leading-tight block">
                              {marcaYSabor(p.nombre).sabor}
                            </span>
                            {p.precio > 0 && (
                              <span className="font-mono text-xs opacity-70">+{mxn(p.precio)}</span>
                            )}
                          </button>
                        )
                      })}
                  </div>
                </>
              )}
            </section>
          )}

          {doble && (
            <section>
              {proteinas.length === 0 && (
                <h3 className="font-display text-xl text-sa-green-ink mb-3">Proteína</h3>
              )}
              <button
                onClick={() => setDobleScoop((v) => !v)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-sa border-2 text-left transition-all ${
                  dobleScoop
                    ? 'bg-sa-strawberry text-white border-sa-strawberry'
                    : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-strawberry/40'
                }`}
              >
                <span>
                  <span className="font-display text-lg leading-tight block">Doble scoop</span>
                  <span className={`font-mono text-xs ${dobleScoop ? 'opacity-90' : 'opacity-60'}`}>
                    {dobleScoop ? 'Va con doble proteína' : `El doble de proteína · +${mxn(doble.precio)}`}
                  </span>
                </span>
                <span className="font-display text-2xl flex-shrink-0">{dobleScoop ? '2×' : '+'}</span>
              </button>
            </section>
          )}

          {grupos.map(({ grupo: g, opciones }) => {
            if (opciones.length === 0) return null
            const elegido = porGrupo[g] ?? opcionDeGrupo(opciones)?.extra_id
            // Un grupo que no se preselecciona solo se tiene que poder
            // vaciar: si no, tocar una opción por error deja $56 puestos
            // sin manera de quitarlos más que cerrando el modal.
            const opcional = grupoEsOpcional(opciones)
            const opcionElegida = opciones.find((o) => o.extra_id === elegido) ?? null
            // Los grupos LARGOS se pliegan, como las leches y las proteínas:
            // los once "Preparado: …" de El Clásico hacían que el menú de ese
            // producto no cupiera en pantalla y hubiera que bajar con la
            // rueda para llegar a lo demás. Los grupos cortos —los de combo,
            // "¿qué wrap?", "¿qué café?"— se quedan a la vista como estaban:
            // plegar dos botones no ahorra nada y agrega un toque.
            const plegable = opciones.length > GRUPO_LARGO
            const abierto = !plegable || grupoAbierto === g
            return (
              <section key={g}>
                <h3 className="font-display text-xl text-sa-green-ink">{g}</h3>
                <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                  {plegable && !abierto
                    ? 'Toca para elegir'
                    : opcional ? 'Opcional · toca otra vez para quitarlo' : 'Elige una'}
                </p>
                {plegable && !abierto ? (
                  <button
                    onClick={() => setGrupoAbierto(g)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-4 rounded-sa border-2 text-left ${
                      opcionElegida
                        ? 'border-sa-green bg-sa-green text-sa-cream'
                        : 'border-sa-green-ink/15 bg-white text-sa-green-ink'
                    }`}
                  >
                    <span className="font-display text-lg leading-tight">
                      {opcionElegida ? opcionElegida.nombre : `Elegir ${g.toLowerCase()}`}
                      {opcionElegida && opcionElegida.precio > 0 && (
                        <span className="font-mono text-xs opacity-80 block">
                          +{mxn(opcionElegida.precio)}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wide opacity-80 flex-shrink-0">
                      {opcionElegida ? 'Cambiar ▾' : 'Ver los ' + opciones.length + ' ▾'}
                    </span>
                  </button>
                ) : (
                <div className="grid grid-cols-2 gap-2">
                  {opciones.map((o) => {
                    const activa = elegido === o.extra_id
                    return (
                      <button
                        key={o.extra_id}
                        onClick={() => {
                          setPorGrupo((prev) => {
                            if (opcional && activa) {
                              const next = { ...prev }
                              delete next[g]
                              return next
                            }
                            return { ...prev, [g]: o.extra_id }
                          })
                          // Elegir cierra la lista, igual que la leche y la
                          // proteína: quedarse abierta obliga a buscar con la
                          // rueda para ver lo que sigue.
                          if (plegable && !(opcional && activa)) setGrupoAbierto(null)
                        }}
                        className={`px-4 py-3 rounded-sa text-left transition-all border-2 ${
                          activa
                            ? 'bg-sa-green text-sa-cream border-sa-green'
                            : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-green/40'
                        }`}
                      >
                        <span className="font-display text-base leading-tight block">{o.nombre}</span>
                        {o.precio > 0 && (
                          <span className="font-mono text-xs opacity-70">+{mxn(o.precio)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                )}
              </section>
            )
          })}

          {galletas.length > 0 && (
            <section>
              <h3 className="font-display text-xl text-sa-green-ink">Galletas</h3>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                Opcional · 2 piezas · una sola vez por shake
              </p>
              <div className="grid grid-cols-2 gap-2">
                {galletas.map((g) => {
                  const activa = galleta === g.extra_id
                  return (
                    <button
                      key={g.extra_id}
                      onClick={() => setGalleta(activa ? null : g.extra_id)}
                      className={`px-4 py-3 rounded-sa text-left transition-all border-2 ${
                        activa
                          ? 'bg-sa-strawberry text-white border-sa-strawberry'
                          : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-strawberry/40'
                      }`}
                    >
                      <span className="font-display text-base leading-tight block">{g.nombre}</span>
                      <span className="font-mono text-xs opacity-80">+{mxn(g.precio)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {adicionales.length > 0 && (
            <section>
              <h3 className="font-display text-xl text-sa-green-ink">Adicionales</h3>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                Se suman al shake
              </p>
              <div className="space-y-2">
                {adicionales.map((e) => {
                  const n = cantidades[e.extra_id] ?? 0
                  return (
                    <div
                      key={e.extra_id}
                      className="flex items-center justify-between gap-3 bg-white rounded-sa px-4 py-3 border border-sa-green-ink/10"
                    >
                      <div className="min-w-0">
                        <p className="font-display text-base text-sa-green-ink leading-tight">{e.nombre}</p>
                        <p className="font-mono text-xs text-sa-green-ink/50">
                          {e.precio > 0 ? `+${mxn(e.precio)}` : 'Sin costo'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => cambiar(e.extra_id, -1)}
                          disabled={n === 0}
                          className="w-10 h-10 rounded-full bg-sa-cream-warm text-sa-green-ink font-display text-xl disabled:opacity-30 active:scale-95"
                          aria-label={`Quitar ${e.nombre}`}
                        >
                          −
                        </button>
                        <span className="font-display text-lg w-6 text-center text-sa-green-ink">{n}</span>
                        <button
                          onClick={() => cambiar(e.extra_id, 1)}
                          className="w-10 h-10 rounded-full bg-sa-green text-sa-cream font-display text-xl active:scale-95"
                          aria-label={`Agregar ${e.nombre}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {obsDisponibles.length > 0 && (
            <section>
              <h3 className="font-display text-xl text-sa-green-ink">Observaciones</h3>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                Solo si el cliente lo pide
              </p>
              <div className="flex flex-wrap gap-2">
                {obsDisponibles.map((o) => {
                  const activa = observaciones.includes(o)
                  return (
                    <button
                      key={o}
                      onClick={() =>
                        setObservaciones((prev) =>
                          activa ? prev.filter((x) => x !== o) : [...prev, o],
                        )
                      }
                      className={`px-4 py-2.5 rounded-full font-mono text-xs uppercase tracking-wider transition-all border-2 ${
                        activa
                          ? 'bg-sa-strawberry text-white border-sa-strawberry'
                          : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-strawberry/40'
                      }`}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* El vaso, cuando lo elegido lo cambia. Solo se pinta si CAMBIA:
            repetir "16 oz" en cada shake es ruido que se deja de leer, y
            entonces el día que diga 20 tampoco se lee. */}
        {vasoCambia && (
          <div className="px-6 pt-3 -mb-1">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sa bg-sa-banana/30 text-sa-coffee font-mono text-xs uppercase tracking-wide">
              Vaso {vaso} oz
              <span className="opacity-60 normal-case tracking-normal">· lo pide el preparado</span>
            </span>
          </div>
        )}

        <footer className="px-6 py-4 border-t border-sa-green-ink/10 flex items-center gap-3">
          <button
            onClick={() => { limpiar(); onCerrar() }}
            className="px-5 py-3 rounded-sa font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 hover:text-sa-green-ink"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            className="flex-1 bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-xl hover:bg-sa-green-deep transition-colors active:scale-[0.98]"
          >
            Agregar · {mxn(producto.precio + totalExtras)}
          </button>
        </footer>
      </div>
    </div>
  )
}
