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

interface Ficha {
  id: string
  sintoma: string
  /** Cómo lo diría quien tiene el problema — alimenta el buscador. */
  palabras: string[]
  senal?: (c: Contexto) => { tono: Tono; texto: string }
  porque: string
  pasos: ReactNode[]
  acciones?: 'calibrar' | 'pantallas' | 'reconciliar' | 'expirar'
}

const FICHAS: Ficha[] = [
  {
    id: 'sin-papel',
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
    if (!q) return FICHAS
    return FICHAS.filter((f) =>
      sin(f.sintoma).includes(q) || f.palabras.some((p) => sin(p).includes(q)),
    )
  }, [busca])

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

      <input
        className={`${cx.input} mb-6`}
        placeholder='Escribe el problema: "no sale papel", "se cerró", "precio viejo"…'
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

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
                <span className="text-lg font-medium text-sa-green-ink">{f.sintoma}</span>
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

      <button
        onClick={() => void cargar()}
        className="mt-6 font-mono text-xs uppercase tracking-wider text-sa-green-ink/50 hover:text-sa-green-ink"
      >
        Volver a revisar
      </button>
    </div>
  )
}
