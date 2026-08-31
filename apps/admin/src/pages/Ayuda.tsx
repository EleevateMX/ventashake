import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { sb } from '../lib/sb'
import {
  obtenerSaludSistema, listarImpresoras, calibrarImpresora,
  reconciliarPagos, expirarOrdenesKiosko,
  type SaludSistema, type ImpresoraAdmin,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'
import { BotonActualizarPantallas } from '../BotonActualizarPantallas'

/**
 * "¿Qué hago si…?" — el manual de la tienda, pero mirando el estado de AHORA.
 *
 * Un documento con instrucciones envejece y nadie lo abre. Lo que sirve
 * cuando algo se rompe en plena fila es: buscar el síntoma en las palabras
 * en que uno lo diría ("no sale papel"), y que la pantalla conteste **si eso
 * está pasando en este momento** y, cuando se puede, lo arregle desde aquí.
 *
 * Por eso cada ficha trae tres cosas y no una:
 *   · la señal en vivo, calculada de la salud del sistema y del latido de
 *     las impresoras — para no mandar a nadie a revisar algo que está bien;
 *   · los pasos, en orden y sin jerga;
 *   · los botones que de verdad hacen algo, y solo esos. Un botón decorativo
 *     en una pantalla de emergencia es peor que no tener botón.
 *
 * Lo que NO se puede hacer desde aquí se dice tal cual (abrir una ventana en
 * la PC de la tienda, meter bien el rollo). Prometer un arreglo remoto que
 * no existe manda a la gente a esperar frente a la pantalla.
 */

type Tono = 'bien' | 'mal' | 'neutral'

interface Contexto {
  salud: SaludSistema
  impresoras: ImpresoraAdmin[]
}

type Grupo = 'Impresión' | 'Pantallas y PC' | 'Dinero' | 'Menú' | 'Personal' | 'Cortes de servicio'

interface Ficha {
  id: string
  grupo: Grupo
  sintoma: string
  /** Cómo lo diría quien tiene el problema — alimenta el buscador. */
  palabras: string[]
  /** true = la tienda no puede vender mientras dure. Va marcado y primero. */
  urgente?: boolean
  senal?: (c: Contexto) => { tono: Tono; texto: string }
  porque: string
  pasos: ReactNode[]
  acciones?: 'calibrar' | 'pantallas' | 'reconciliar' | 'expirar'
  /** Cuándo dejar de intentar y marcarle a gerencia. */
  llamar?: string
}

const FICHAS: Ficha[] = [
  {
    id: 'sin-papel',
    grupo: 'Impresión',
    urgente: true,
    sintoma: 'No sale papel — no salen las comandas',
    palabras: ['no imprime', 'no sale papel', 'sin comandas', 'impresora muerta', 'no llega a barra'],
    senal: ({ salud }) =>
      salud.impresorasConectadas < salud.impresorasActivas
        ? { tono: 'mal', texto: `${salud.impresorasActivas - salud.impresorasConectadas} de ${salud.impresorasActivas} impresoras NO se están reportando` }
        : { tono: 'bien', texto: 'Las impresoras se están reportando ahora mismo' },
    porque:
      'El papel lo saca un programa que corre en la PC de la tienda, no la nube. ' +
      'Si esa ventana negra se cerró, las pantallas siguen mostrando las comandas ' +
      'pero no sale nada impreso.',
    pasos: [
      <>En la PC de la tienda, busca la ventana negra que dice <strong>“Shakeaholic — agente de impresión”</strong>. Si no está, se cerró.</>,
      <>Doble clic en <strong>“Agente de impresión”</strong> del escritorio. En unos segundos aquí arriba debe decir que se están reportando.</>,
      <>Si ese acceso no existe, doble clic en <strong>“Shakeaholic”</strong> (el que abre la tienda): también lo arranca.</>,
      <><strong>No se pierde nada.</strong> Las comandas quedan en cola y salen todas cuando el agente vuelve.</>,
    ],
  },
  {
    id: 'corridas',
    grupo: 'Impresión',
    sintoma: 'Las etiquetas salen corridas o en blanco',
    palabras: ['corrida', 'chueca', 'en blanco', 'cambié el rollo', 'rollo nuevo', 'se desfasó'],
    porque:
      'Pasa después de cambiar el rollo. La impresora no cuenta etiquetas: mide la ' +
      'luz que pasa por el hueco entre una y la siguiente, y ese umbral depende del ' +
      'papel cargado. Con un rollo nuevo hay que volver a medirlo.',
    pasos: [
      <>Dale a <strong>Calibrar</strong> aquí abajo (o desde el kiosko: 5 toques a Milo → PIN → “¿Cambiaste el rollo?”).</>,
      <>Va a avanzar dos o tres etiquetas y sacar una de prueba. <strong>Si esa sale derecha, quedó.</strong></>,
      <>Si sigue corrida: el rollo tiene que ir <strong>centrado</strong>, con las guías pegadas al papel, y la tapa cerrada <strong>hasta el clic</strong>.</>,
      <>Si el rollo nuevo es de otra medida, no hay calibración que lo salve: las etiquetas están hechas para 80 × 25 mm.</>,
    ],
    acciones: 'calibrar',
  },
  {
    id: 'se-cerro',
    grupo: 'Pantallas y PC',
    urgente: true,
    sintoma: 'Se cerró la aplicación (kiosko, barra o cocina)',
    palabras: ['se cerró', 'se cerro la aplicacion', 'desapareció la pantalla', 'se salió', 'pantalla negra'],
    porque:
      'Son ventanas de navegador. Si alguien las cierra o Windows las tumba, no se ' +
      'pierde ningún pedido: todo vive en la base, no en la pantalla.',
    pasos: [
      <>Doble clic en <strong>“Shakeaholic”</strong> en el escritorio de la PC. Reabre las tres y las acomoda cada una en su monitor.</>,
      <>Si volvió pero muestra datos viejos (precios, productos), dale a <strong>Actualizar pantallas</strong>.</>,
      <>El kiosko no se recarga a media venta: si hay un cliente con carrito, la señal espera a que termine.</>,
    ],
    acciones: 'pantallas',
  },
  {
    id: 'no-abrio',
    grupo: 'Pantallas y PC',
    urgente: true,
    sintoma: 'Prendimos la PC y no abrió nada',
    palabras: ['no abrió', 'no abre', 'se prendió y nada', 'arranque', 'no arrancó'],
    porque:
      'El arranque espera a que haya internet antes de abrir. Si tarda o si alguien ' +
      'borró el acceso directo, no pasa nada solo.',
    pasos: [
      <>Espera un minuto: primero busca internet y después abre.</>,
      <>Doble clic en <strong>“Shakeaholic”</strong> del escritorio.</>,
      <>Si ese acceso no está, ve a <strong>Descargas</strong> aquí en Admin y corre <strong>“Instalar todo”</strong>: deja el acceso, el arranque automático y el agente.</>,
    ],
  },
  {
    id: 'precio-viejo',
    grupo: 'Menú',
    sintoma: 'Cambié un precio o un producto y el kiosko sigue igual',
    palabras: ['precio viejo', 'no se actualiza', 'cambié precio', 'no aparece el producto', 'costeos'],
    porque:
      'En Costeos, **guardar** y **publicar** ya no son lo mismo. Guardar sincroniza ' +
      'el catálogo; “Mostrar en el kiosko” es lo que avisa a las pantallas.',
    pasos: [
      <>En Costeos: <strong>Guardar</strong>, y cuando esté listo, <strong>“Mostrar en el kiosko”</strong> — te enseña qué va a cambiar antes de confirmar.</>,
      <>Si ya publicaste y aun así no se ve, dale a <strong>Actualizar pantallas</strong>.</>,
      <><strong>Ojo:</strong> renombrar un producto desde Admin no sirve si viene de Costeos — el siguiente guardado lo revierte. Los nombres se cambian en Costeos.</>,
    ],
    acciones: 'pantallas',
  },
  {
    id: 'cobro-colgado',
    grupo: 'Dinero',
    urgente: true,
    sintoma: 'Un cobro se quedó “esperando confirmación”',
    palabras: ['esperando confirmacion', 'no confirma', 'clip', 'terminal', 'se quedó pensando'],
    senal: ({ salud }) => {
      const n = salud.pagosPendientes + salud.pagosDesconocidos
      return n > 0
        ? { tono: 'mal', texto: `${n} pago(s) sin resolver` }
        : { tono: 'bien', texto: 'No hay pagos colgados' }
    },
    porque:
      'La terminal avisa por su cuenta, y además hay un barrido cada 2 minutos que ' +
      'pregunta el estado real. Casi siempre se resuelve solo.',
    pasos: [
      <><strong>Espera dos minutos</strong> antes de volver a cobrar. Si la terminal sí cobró, la venta se confirma sola.</>,
      <>Si pasó el rato y sigue ahí, dale a <strong>Reconciliar pagos</strong>: vuelve a preguntar el estado de cada uno.</>,
      <><strong>Nunca cobres dos veces</strong> sin revisar esto: el cobro puede estar bueno y sin confirmar.</>,
    ],
    acciones: 'reconciliar',
  },
  {
    id: 'folios-abandonados',
    grupo: 'Dinero',
    sintoma: 'Hay folios de kiosko que nadie vino a pagar',
    palabras: ['folios pendientes', 'no vinieron a pagar', 'ordenes viejas', 'esperando caja'],
    senal: ({ salud }) =>
      salud.ordenesEsperandoCaja > 0
        ? { tono: 'neutral', texto: `${salud.ordenesEsperandoCaja} esperando pago en caja` }
        : { tono: 'bien', texto: 'Ninguno pendiente' },
    porque:
      'El cliente saca folio en el kiosko y paga en caja. Si se arrepiente, el folio ' +
      'queda ahí. Es normal tener algunos; muchos seguidos puede ser que el kiosko confunda.',
    pasos: [
      <>No estorban: no entran al corte ni descuentan inventario.</>,
      <>Si quieres limpiar los vencidos, dale a <strong>Expirar los vencidos</strong>.</>,
    ],
    acciones: 'expirar',
  },
  {
    id: 'comanda-perdida',
    grupo: 'Impresión',
    sintoma: 'Una comanda no llegó a la estación',
    palabras: ['no llegó la comanda', 'falta comanda', 'no imprimió esa', 'se perdió el pedido'],
    senal: ({ salud }) => {
      const n = salud.trabajosImpresionFallidos + salud.pedidosSinComanda
      return n > 0
        ? { tono: 'mal', texto: `${n} caso(s) para revisar` }
        : { tono: 'bien', texto: 'Sin comandas perdidas en las últimas 24 h' }
    },
    porque:
      'Un trabajo puede agotar sus reintentos si la impresora estuvo caída un rato. ' +
      'Queda registrado, no desaparece.',
    pasos: [
      <>Se reimprime desde <strong>Impresoras</strong> aquí en Admin, o desde la pantalla de la estación.</>,
      <>Si son varias seguidas, primero revisa arriba si el agente se está reportando: puede ser lo mismo que “no sale papel”.</>,
    ],
  },
  {
    id: 'producto-doble',
    grupo: 'Menú',
    sintoma: 'Un producto aparece dos veces, o desapareció',
    palabras: ['duplicado', 'dos veces', 'desapareció', 'se borró el producto', 'perdió sus extras'],
    porque:
      'Casi siempre es un renombre hecho sin Clave en Costeos: el nombre nuevo no ' +
      'empata con nada, nace un producto vacío y el viejo se apaga. El producto se ' +
      'parte en dos y pierde sus extras.',
    pasos: [
      <>Los nombres se cambian <strong>en Costeos</strong>, nunca en Admin, y la fila debe tener su <strong>Clave</strong>.</>,
      <>Si ya se partió, avísame con el nombre viejo y el nuevo: se vuelven a unir del lado de la base.</>,
    ],
  },
  {
    id: 'version',
    grupo: 'Pantallas y PC',
    sintoma: 'No sé si la PC está al día',
    palabras: ['version', 'actualizar', 'agente viejo', 'esta al dia'],
    senal: ({ impresoras }) => {
      const v = impresoras.map((i) => i.agente_version ?? '—')
      const iguales = new Set(v).size <= 1
      return { tono: iguales ? 'neutral' : 'mal', texto: `Agente: ${v.join(' · ') || '—'}` }
    },
    porque:
      'El agente de impresión se actualiza solo al abrir la tienda cada día. Casi ' +
      'nunca hay que hacer nada.',
    pasos: [
      <>En <strong>Descargas</strong> se ve la versión de cada PC contra la publicada, y dice si falta.</>,
      <>Para forzarlo hoy: <strong>“Solo el agente de impresión”</strong> desde Descargas.</>,
    ],
  },
  {
    id: 'sin-internet',
    grupo: 'Cortes de servicio',
    urgente: true,
    sintoma: 'Se fue el internet',
    palabras: ['sin internet', 'no hay wifi', 'se cayo la red', 'no carga', 'sin conexion'],
    porque:
      'Todo el sistema vive en la nube: el kiosko, la caja y las pantallas son ' +
      'ventanas de internet. Sin red no se puede cobrar. No hay modo sin conexión, ' +
      'y es a propósito: una venta guardada en una PC que después no sincroniza es ' +
      'peor que una venta que no se hizo.',
    pasos: [
      <>Revisa el módem. Si hay señal en el celular pero no en la PC, prueba compartir datos por USB o Wi-Fi desde un teléfono: la PC vuelve a vender en cuanto haya red.</>,
      <><strong>Cobra en papel mientras tanto</strong> —anota producto, monto y método— y captúralo después en el POS con la caja abierta. Que quede a nombre de alguien para no perder el rastro.</>,
      <>Las comandas de lo que ya se cobró antes del corte <strong>no se pierden</strong>: salen todas cuando vuelva la red.</>,
    ],
    llamar: 'Si vuelve el internet y las pantallas siguen en blanco.',
  },
  {
    id: 'sin-luz',
    grupo: 'Cortes de servicio',
    sintoma: 'Se fue la luz',
    palabras: ['sin luz', 'apagon', 'se apago todo', 'corte de energia'],
    porque:
      'La PC está configurada para levantarse sola: al volver la corriente arranca, ' +
      'espera internet y abre las tres pantallas y el agente de impresión.',
    pasos: [
      <>No toques nada por un minuto. Debe abrir solo.</>,
      <>Si no abrió, doble clic en <strong>“Shakeaholic”</strong> del escritorio.</>,
      <>Revisa que las dos etiquetadoras estén encendidas: no arrancan solas si su switch quedó apagado.</>,
      <><strong>El turno de caja sigue abierto</strong> donde estaba. No hay que volver a abrirlo.</>,
    ],
  },
  {
    id: 'terminal-clip',
    grupo: 'Dinero',
    urgente: true,
    sintoma: 'La terminal Clip no responde o no le llega el cobro',
    palabras: ['clip', 'terminal', 'no llega el cobro', 'pinpad', 'no aparece el monto'],
    porque:
      'El monto viaja del sistema a la terminal por internet. Si la terminal está ' +
      'apagada, sin batería o sin señal, el cobro no le llega.',
    pasos: [
      <>Revisa que la terminal esté encendida, con batería y con su señal.</>,
      <>Cancela el cobro desde el sistema antes de reintentar. <strong>Si queda uno vivo en la terminal, el siguiente cliente paga lo del anterior.</strong></>,
      <>Si sigue sin llegar, cobra por otro método (efectivo o la terminal del banco) y sigue vendiendo. No dejes la fila parada por esto.</>,
    ],
    llamar: 'Si la terminal cobró al cliente y el sistema dice que no.',
  },
  {
    id: 'cobre-dos-veces',
    grupo: 'Dinero',
    urgente: true,
    sintoma: 'Creo que le cobré dos veces a un cliente',
    palabras: ['cobre dos veces', 'doble cobro', 'se cobro dos', 'devolver', 'reembolso'],
    porque:
      'Pasa cuando un cobro se queda “esperando confirmación” y se vuelve a intentar. ' +
      'El sistema es idempotente y evita casi todos los dobles, pero la terminal es ' +
      'un aparato aparte.',
    pasos: [
      <><strong>No prometas nada todavía.</strong> Anota el folio y la hora.</>,
      <>Búscalo en <strong>En vivo</strong> o en <strong>Ventas</strong>: si solo hay una venta, no se cobró dos veces aunque la terminal haya parpadeado.</>,
      <>Si de verdad hay dos, la devolución se hace <strong>desde la app de Clip</strong>, no desde aquí.</>,
      <>Avísale al cliente que se le regresa el mismo día y pídele su contacto.</>,
    ],
    llamar: 'Siempre. Un doble cobro se avisa aunque ya lo hayas resuelto.',
  },
  {
    id: 'caja-no-cuadra',
    grupo: 'Dinero',
    sintoma: 'La caja no cuadra al cerrar el turno',
    palabras: ['no cuadra', 'falta dinero', 'sobra dinero', 'corte', 'diferencia'],
    porque:
      'El conteo es por denominación justo para esto: el total lo hace la máquina, ' +
      'así que una diferencia ya no puede ser una suma mal hecha.',
    pasos: [
      <><strong>Vuelve a contar</strong> antes de cerrar, denominación por denominación. Es el error más común.</>,
      <>Revisa si hubo un cobro en efectivo que se registró como tarjeta, o al revés.</>,
      <><strong>Cierra con el número real</strong>, aunque no cuadre, y escribe en las notas qué crees que pasó. Cerrar con un número inventado hace imposible encontrar el problema mañana.</>,
      <>Una diferencia de monedas es normal. De billetes, se avisa.</>,
    ],
    llamar: 'Si falta un billete o la diferencia se repite dos días seguidos.',
  },
  {
    id: 'pin',
    grupo: 'Personal',
    sintoma: 'No puedo entrar con mi PIN / entró alguien nuevo',
    palabras: ['pin', 'no me deja entrar', 'olvide el pin', 'empleado nuevo', 'contrasena'],
    porque:
      'Cada quien entra con su PIN, y el turno queda registrado a su nombre. Por eso ' +
      'no se comparten: si dos usan el mismo, el corte no dice quién cobró.',
    pasos: [
      <>El PIN es de 4 a 6 dígitos. Después de varios intentos fallidos se bloquea un rato.</>,
      <>Para dar de alta a alguien o cambiar un PIN: <strong>Admin → Empleados</strong>.</>,
      <>Si alguien se va del negocio, <strong>desactívalo ahí mismo</strong> el mismo día.</>,
    ],
  },
  {
    id: 'reimprimir',
    grupo: 'Impresión',
    sintoma: 'Necesito reimprimir una comanda',
    palabras: ['reimprimir', 'otra vez la etiqueta', 'se perdio la etiqueta', 'volver a imprimir'],
    porque:
      'Se puede reimprimir cualquier comanda. Sale marcada como REIMPRESIÓN para que ' +
      'en barra nadie prepare dos veces lo mismo.',
    pasos: [
      <>Desde la pantalla de la estación (barra o cocina), en la tarjeta del pedido.</>,
      <>O desde <strong>Admin → Impresoras</strong>, en la cola de trabajos.</>,
    ],
  },
  {
    id: 'monitores',
    grupo: 'Pantallas y PC',
    sintoma: 'El kiosko abrió en el monitor equivocado',
    palabras: ['monitor', 'pantalla cambiada', 'kiosko en la de bebidas', 'se cambiaron las pantallas'],
    porque:
      'El arranque le pregunta a Windows dónde están los monitores y reparte por ' +
      'tamaño: el grande es del cliente, los dos chicos son las estaciones. Si se ' +
      'cambió un cable, el reparto cambia.',
    pasos: [
      <>Cierra las tres ventanas y vuelve a dar doble clic en <strong>“Shakeaholic”</strong>: reparte de nuevo.</>,
      <>Si siempre queda mal, se puede fijar a mano. Avísame y te digo qué escribir en el archivo de configuración de la PC.</>,
    ],
    llamar: 'Si después de reabrir sigue quedando mal.',
  },
  {
    id: 'rewards',
    grupo: 'Personal',
    sintoma: 'Al cliente no le llegaron sus mancuernas',
    palabras: ['mancuernas', 'rewards', 'puntos', 'no le sumo', 'sellos'],
    porque:
      'Las mancuernas se suman a la venta **solo si el cliente se identificó antes de ' +
      'cobrar**. Si se cobró sin identificarlo, la venta ya no se le puede asignar sola.',
    pasos: [
      <>Identifica al cliente <strong>antes</strong> de cobrar, no después.</>,
      <>Si ya se cobró sin identificar, anota el folio y el correo del cliente: se le puede abonar a mano.</>,
    ],
    llamar: 'Con el folio y el correo, para abonárselas.',
  },
]

const TONOS: Record<Tono, string> = {
  bien: 'bg-sa-mint/30 text-sa-green-ink',
  mal: 'bg-sa-strawberry/15 text-sa-strawberry',
  neutral: 'bg-sa-cream-warm text-sa-green-ink/70',
}

/** Sin acentos ni mayúsculas: "se cerro" también encuentra "se cerró". */
const sin = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Ayuda() {
  const [ctx, setCtx] = useState<Contexto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  async function cargar() {
    try {
      const [salud, impresoras] = await Promise.all([obtenerSaludSistema(sb), listarImpresoras(sb)])
      setCtx({ salud, impresoras: impresoras.filter((i) => i.activa) })
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  const vistas = useMemo(() => {
    const q = sin(busca.trim())
    let l = FICHAS
    if (grupo) l = l.filter((f) => f.grupo === grupo)
    if (q) {
      l = l.filter((f) =>
        sin(f.sintoma).includes(q) ||
        sin(f.grupo).includes(q) ||
        f.palabras.some((p) => sin(p).includes(q)),
      )
    }
    // Lo urgente primero: si la tienda no puede vender, eso va arriba.
    return [...l].sort((a, b) => Number(!!b.urgente) - Number(!!a.urgente))
  }, [busca, grupo])

  async function accion(id: string, fn: () => Promise<string>) {
    setOcupado(id)
    setHecho(null)
    setError(null)
    try {
      setHecho(await fn())
      void cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="¿Qué hago si…?"
        subtitle="Busca el problema como lo dirías. Abajo dice si está pasando ahora."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {hecho && (
        <p className="font-mono text-sm text-sa-green bg-sa-mint/25 rounded-sa px-4 py-3 mb-4">{hecho}</p>
      )}

      {/* Lo que resuelve casi todo, antes de que nadie tenga que buscar. */}
      <Panel title="Primeros auxilios — casi siempre es una de estas tres">
        <ol className="text-sm text-sa-green-ink/80 space-y-2 list-decimal pl-5 leading-relaxed">
          <li><strong>No sale papel</strong> → abre la ventana negra del agente en la PC (“Agente de impresión” del escritorio).</li>
          <li><strong>Se cerró una pantalla</strong> → doble clic en “Shakeaholic” del escritorio: reabre las tres.</li>
          <li><strong>Las etiquetas salen mal</strong> → calibrar, aquí abajo o desde el kiosko (5 toques a Milo).</li>
        </ol>
        <p className="text-sm text-sa-green-ink/70 mt-4 leading-relaxed">
          <strong className="text-sa-green-ink">Nada de esto pierde ventas ni pedidos.</strong> Todo
          vive en la nube: las pantallas y el papel son la ventana, no la memoria.
        </p>
      </Panel>

      <input
        className={`${cx.input} mt-6`}
        placeholder='Escribe el problema: "no sale papel", "se cerró", "no cuadra"…'
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <div className="flex flex-wrap gap-2 mt-3 mb-6">
        {([null, 'Impresión', 'Pantallas y PC', 'Dinero', 'Menú', 'Personal', 'Cortes de servicio'] as (Grupo | null)[]).map((g) => (
          <button
            key={g ?? 'todo'}
            onClick={() => setGrupo(g)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              grupo === g
                ? 'bg-sa-green-ink text-sa-cream'
                : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:border-sa-green-ink/30'
            }`}
          >
            {g ?? 'Todo'}
          </button>
        ))}
      </div>

      {!ctx && !error && <Loading>Revisando cómo está la tienda…</Loading>}

      <div className="space-y-3">
        {vistas.map((f) => {
          const senal = ctx && f.senal ? f.senal(ctx) : null
          const activa = abierta === f.id
          return (
            <Panel key={f.id}>
              <button
                onClick={() => setAbierta(activa ? null : f.id)}
                className="w-full flex flex-wrap items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-lg font-medium text-sa-green-ink">
                    {f.urgente && (
                      <span className="mr-2 align-middle inline-block px-2 py-0.5 rounded-full bg-sa-strawberry text-white text-[10px] font-mono uppercase tracking-wider">
                        Urgente
                      </span>
                    )}
                    {f.sintoma}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40 mt-1">
                    {f.grupo}
                  </span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  {senal && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${TONOS[senal.tono]}`}>
                      {senal.texto}
                    </span>
                  )}
                  <span className="font-mono text-xs text-sa-green-ink/40">{activa ? '−' : '+'}</span>
                </span>
              </button>

              {activa && (
                <div className="mt-4 pt-4 border-t border-sa-green-ink/10">
                  <p className="text-sm text-sa-green-ink/70 leading-relaxed">{f.porque}</p>
                  <ol className="text-sm text-sa-green-ink/80 mt-4 space-y-2 list-decimal pl-5 leading-relaxed">
                    {f.pasos.map((p, i) => <li key={i}>{p}</li>)}
                  </ol>

                  {f.llamar && (
                    <p className="text-sm text-sa-coffee bg-sa-banana/25 rounded-sa px-4 py-3 mt-4 leading-relaxed">
                      <strong>Marca a gerencia:</strong> {f.llamar}
                    </p>
                  )}

                  {f.acciones === 'pantallas' && (
                    <div className="mt-5"><BotonActualizarPantallas compacto /></div>
                  )}

                  {f.acciones === 'calibrar' && (
                    <div className="flex flex-wrap gap-2 mt-5">
                      {ctx?.impresoras.map((i) => (
                        <button
                          key={i.id}
                          disabled={ocupado === i.id}
                          onClick={() => void accion(i.id, async () => {
                            await calibrarImpresora(sb, i.id)
                            return `Calibración mandada a ${i.nombre}. En unos segundos avanza el papel y sale una etiqueta de prueba.`
                          })}
                          className={cx.btnPrimary}
                        >
                          {ocupado === i.id ? 'Mandando…' : `Calibrar ${i.nombre}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {f.acciones === 'reconciliar' && (
                    <button
                      disabled={ocupado === f.id}
                      onClick={() => void accion(f.id, async () => {
                        const r = await reconciliarPagos(sb)
                        return r.length === 0
                          ? 'Nada que reconciliar: no había pagos sin resolver.'
                          : `Revisados ${r.length} pago(s).`
                      })}
                      className={`${cx.btnPrimary} mt-5`}
                    >
                      {ocupado === f.id ? 'Revisando…' : 'Reconciliar pagos'}
                    </button>
                  )}

                  {f.acciones === 'expirar' && (
                    <button
                      disabled={ocupado === f.id}
                      onClick={() => void accion(f.id, async () => {
                        const n = await expirarOrdenesKiosko(sb)
                        return n === 0 ? 'No había ninguno vencido.' : `${n} folio(s) vencido(s) cerrados.`
                      })}
                      className={`${cx.btnPrimary} mt-5`}
                    >
                      {ocupado === f.id ? 'Limpiando…' : 'Expirar los vencidos'}
                    </button>
                  )}
                </div>
              )}
            </Panel>
          )
        })}

        {vistas.length === 0 && (
          <Panel>
            <p className={cx.muted}>
              Nada coincide con “{busca}”. Escríbeme el problema tal cual pasó y lo
              agrego aquí para la próxima.
            </p>
          </Panel>
        )}
      </div>

      <div className="mt-8 space-y-6">
        <Panel title="Lo que NUNCA hay que hacer">
          <ul className="text-sm text-sa-green-ink/80 space-y-2.5 list-disc pl-5 leading-relaxed">
            <li>
              <strong>Cobrar dos veces</strong> porque “no confirmó”. Espera dos minutos
              y revisa: el cobro puede estar bueno y sin confirmar.
            </li>
            <li>
              <strong>Cerrar el turno con un número inventado</strong> para que cuadre.
              Cierra con lo que hay y escribe qué crees que pasó — un número falso hace
              imposible encontrar el error mañana.
            </li>
            <li>
              <strong>Renombrar o borrar productos desde Admin</strong> si vienen de
              Costeos: el siguiente guardado lo revierte y el producto se parte en dos.
            </li>
            <li>
              <strong>Apagar la PC a media venta</strong> o cerrar la ventana negra del
              agente “porque estorba”. Sin ella no sale papel.
            </li>
            <li>
              <strong>Cambiarle configuraciones de seguridad a Windows</strong> para que
              abra un archivo. Si algo pide eso, está mal bajado — avisa.
            </li>
          </ul>
        </Panel>

        <Panel title="Si nada de esto lo resuelve">
          <p className="text-sm text-sa-green-ink/75 leading-relaxed">
            Marca a gerencia, y manda estas cuatro cosas. Con ellas se resuelve a
            distancia casi siempre; sin ellas, la primera respuesta va a ser
            preguntártelas.
          </p>
          <ol className="text-sm text-sa-green-ink/80 mt-3 space-y-2 list-decimal pl-5 leading-relaxed">
            <li><strong>Qué pasó</strong>, en tus palabras, y <strong>a qué hora</strong>.</li>
            <li>El <strong>folio</strong> del pedido, si hay uno.</li>
            <li>Una <strong>foto de la pantalla</strong> con el error completo, sin recortar.</li>
            <li>
              Si es de impresión: corre <strong>Diagnóstico del agente</strong> desde{' '}
              <strong>Descargas</strong> y manda el <code className="font-mono text-xs">.txt</code>{' '}
              que deja en el Escritorio.
            </li>
          </ol>
          <p className="text-sm text-sa-green-ink/70 mt-4 leading-relaxed">
            <strong className="text-sa-green-ink">Mientras tanto, sigue vendiendo.</strong>{' '}
            Casi todo lo de esta lista tiene una salida que no detiene la fila: cobrar
            por otro método, anotar en papel, entregar sin etiqueta gritando el nombre.
            Detener la venta es siempre la opción más cara.
          </p>
        </Panel>
      </div>

      <button
        onClick={() => void cargar()}
        className="mt-6 font-mono text-xs uppercase tracking-wider text-sa-green-ink/50 hover:text-sa-green-ink"
      >
        Volver a revisar
      </button>
    </div>
  )
}
