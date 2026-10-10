import React, { useEffect, useMemo, useState } from 'react'
import {
  listarAlmacenes, listarCajas, corteAbierto, abrirCaja, cerrarCaja, resumenCorte,
  entrarConPin, salirDeSesion, empleadoDeLaSesion, misPermisos, RequiereAutorizacion,
  fondoEstablecido, cerrarCajaConFondo, fondoEsperado,
} from '@shake/supabase'
import type { EmpleadoSesion, Permiso, CierreConFondo, FondoEntregado } from '@shake/supabase'
import type { Caja, CajaCorte, CorteResumen } from '@shake/types'
import {
  mxn, mensajeDeError,
  BILLETES, MONEDAS, CONTEO_VACIO, sumaConteo, ponerPiezas, piezasDe,
  sugerirFondo, fondoCabeEnConteo, leerDesglose, folioDeCorte,
  type Conteo,
} from '@shake/utils'
import { CalibrarRollo } from '@/components/CalibrarRollo'
import { PedirCambio } from '@/components/PedirCambio'
import { CargarInventario } from '@/components/CargarInventario'
import { AbrirBote } from '@/components/AbrirBote'
import { sb } from '@/lib/sb'
import { useVentasSinInternet } from '@/store/sinInternet'
import { useCarrito } from '@/store/carritoStore'

interface Props {
  abierto: boolean
  onCerrar: () => void
}

/**
 * `pin` es quien entra; `pinRecibe` es quien RECIBE la caja en un cambio de
 * turno (su PIN es su firma de que recibió).
 */
type Fase = 'pin' | 'pinRecibe' | 'cargando' | 'abrir' | 'cerrar' | 'listo'

/**
 * El pasadizo secreto del kiosko: cinco toques a Milo abren el corte de caja.
 *
 * Existe porque el turno arranca y cambia frente a ESTA pantalla, no frente
 * al POS. Antes había que ir a la otra ventana solo para abrir la caja;
 * ahora quien llega en la mañana o entra al turno lo hace aquí mismo, con su
 * PIN, y la apertura queda registrada a su nombre. Sin botón visible: el
 * cliente que usa el kiosko jamás debe descubrir que esto está ahí.
 */
export function CorteMilo({ abierto, onCerrar }: Props) {
  const [fase, setFase] = useState<Fase>('cargando')
  const [pin, setPin] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [empleado, setEmpleado] = useState<EmpleadoSesion | null>(null)
  /**
   * Si la sesión de personal la abrió este modal, también la cierra al salir.
   * Si el kiosko ya estaba en modo cajero, la sesión no es nuestra y se
   * respeta: cerrarla dejaría al cajero fuera a media venta.
   */
  const [sesionPropia, setSesionPropia] = useState(false)
  const [caja, setCaja] = useState<Caja | null>(null)
  const [corte, setCorte] = useState<CajaCorte | null>(null)
  const [resumen, setResumen] = useState<CorteResumen | null>(null)
  const [conteo, setConteo] = useState<Conteo>(CONTEO_VACIO)
  /**
   * El conteo del fondo con el que se abre. Va aparte del de cierre: son
   * dos momentos distintos y compartir el estado haria que abrir un turno
   * dejara prellenado el conteo del siguiente cierre con billetes que ya
   * no estan.
   */
  const [conteoApertura, setConteoApertura] = useState<Conteo>(CONTEO_VACIO)
  /** El fondo estándar que fijó gerencia. null = no hay, no se sugiere nada. */
  const [fondoSugerido, setFondoSugerido] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<'abierto' | 'cerrado' | null>(null)
  /**
   * Lo que puede quien está en la caja. Solo decide qué se ENSEÑA: el
   * servidor lo vuelve a revisar al abrir y al cerrar. `null` = no se pudo
   * leer, y entonces la pantalla se comporta como antes y deja que el
   * servidor conteste.
   */
  const [permisos, setPermisos] = useState<Record<Permiso, boolean> | null>(null)
  /** El corte lo intentó alguien sin permiso: se pide el PIN de quien sí. */
  const [pidiendoAutorizacion, setPidiendoAutorizacion] = useState(false)
  const [pinAutoriza, setPinAutoriza] = useState('')
  const [autorizo, setAutorizo] = useState<string | null>(null)
  /**
   * El fondo que se queda, si alguien lo ajustó a mano. null = el que
   * sugiere el sistema (billetes grandes fuera, cambio dentro), que se
   * recalcula solo mientras se cuenta.
   */
  const [fondoManual, setFondoManual] = useState<Conteo | null>(null)
  /** Quien cierra confirmó que se repone lo que falta para el fondo. */
  const [reposicionOk, setReposicionOk] = useState(false)
  /** Lo que dejó el turno anterior, para quien abre. null = nada registrado. */
  const [entregado, setEntregado] = useState<FondoEntregado | null>(null)
  const [notaRecibo, setNotaRecibo] = useState('')
  const [cierre, setCierre] = useState<CierreConFondo | null>(null)
  const setCajero = useCarrito((s) => s.setCajero)
  const hayCajero = useCarrito((s) => s.cajero != null)

  /**
   * Cuánto se retira y qué se queda, a partir de lo CONTADO (no de lo
   * esperado): si falta dinero, la diferencia es del turno que cierra y el
   * siguiente recibe su fondo completo o una reposición dicha en voz alta.
   * null = sin fondo fijo establecido, o nada contado todavía.
   */
  const distribucion = useMemo(() => {
    const contado = sumaConteo(conteo)
    if (fondoSugerido == null || fondoSugerido <= 0 || contado <= 0) return null
    const sugerido = sugerirFondo(conteo, fondoSugerido)
    const manual = fondoManual != null && fondoCabeEnConteo(fondoManual, conteo)
    const fondo = manual ? (fondoManual as Conteo) : sugerido.fondo
    const total = sumaConteo(fondo)
    return {
      fondo,
      total,
      retiro: contado - total,
      // Solo hay reposición cuando lo contado no alcanza: si alcanza y
      // alguien deja menos a mano, se avisa pero no se inventa dinero.
      faltante: contado < fondoSugerido ? Math.max(0, fondoSugerido - total) : 0,
      exacto: total === fondoSugerido,
      manual,
    }
  }, [conteo, fondoSugerido, fondoManual])

  useEffect(() => {
    if (!abierto) return
    setPin(''); setError(null); setConteo(CONTEO_VACIO); setConteoApertura(CONTEO_VACIO)
    setResultado(null); setResumen(null); setCorte(null)
    setPermisos(null); setPidiendoAutorizacion(false); setPinAutoriza(''); setAutorizo(null)
    setFondoManual(null); setReposicionOk(false); setEntregado(null); setNotaRecibo(''); setCierre(null)
    setFase('cargando')
    empleadoDeLaSesion(sb)
      .then((emp) => {
        if (emp) {
          setEmpleado(emp)
          setSesionPropia(false)
          void cargarContexto()
        } else {
          setFase('pin')
        }
      })
      .catch(() => setFase('pin'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function cargarContexto() {
    setFase('cargando')
    setError(null)
    try {
      // Mismo descubrimiento de caja que usa el POS: el almacén del kiosko
      // manda a su sucursal, y la sucursal a su caja.
      const almacenes = await listarAlmacenes(sb)
      const alm = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0]
      if (!alm) throw new Error('No hay almacenes configurados.')
      const cajas = await listarCajas(sb)
      const c = cajas.find((x) => x.sucursal_id === alm.sucursal_id) ?? cajas[0]
      if (!c) throw new Error('No hay cajas configuradas.')
      setCaja(c)
      setPermisos(await misPermisos(sb).catch(() => null))
      // El fondo fijo se necesita en los dos lados: al cerrar para saber
      // cuánto se queda, al abrir para sugerirlo. Si no se puede leer, todo
      // se comporta como antes (sin fondo fijo).
      setFondoSugerido(await fondoEstablecido(sb).catch(() => null))
      const abierta = await corteAbierto(sb, c.id)
      setCorte(abierta)
      if (abierta) {
        setResumen(await resumenCorte(sb, abierta.id))
        setFase('cerrar')
      } else {
        setEntregado(await fondoEsperado(sb, c.id).catch(() => null))
        setFase('abrir')
      }
    } catch (e) {
      setError(mensajeDeError(e))
      setFase('abrir')
    }
  }

  async function intentarPin(pinCompleto: string) {
    const recibe = fase === 'pinRecibe'
    setVerificando(true)
    setError(null)
    try {
      const r = await entrarConPin(sb, pinCompleto)
      if (!r.ok || !r.empleado) {
        setError(r.error ?? 'PIN incorrecto')
        setPin('')
        return
      }
      setEmpleado(r.empleado)
      setPin('')
      if (recibe && hayCajero) {
        // Cambio de turno en modo cajero: quien recibe la caja también se
        // queda con la pantalla. Su sesión ya no es «del modal»: no se
        // cierra al salir, porque ahora es la del cajero.
        setCajero({ id: r.empleado.id, nombre: r.empleado.nombre, rol: r.empleado.rol })
        setSesionPropia(false)
      } else {
        setSesionPropia(true)
      }
      await cargarContexto()
    } catch (e) {
      setError(mensajeDeError(e))
      setPin('')
    } finally {
      setVerificando(false)
    }
  }

  function teclearPin(d: string) {
    if (verificando) return
    const nuevo = (pin + d).slice(0, 6)
    setPin(nuevo)
    setError(null)
    // Hay PINes de 4 y de 6 dígitos: a los 6 se valida solo; con 4 o 5, el
    // botón Entrar. (Validar a los 4 dejaría fuera los PINes largos.)
    if (nuevo.length === 6) void intentarPin(nuevo)
  }

  async function abrirTurno() {
    if (!caja || guardando) return
    setGuardando(true)
    setError(null)
    try {
      // El fondo es la suma del conteo, no un numero tecleado aparte:
      // dos cifras que deberian coincidir siempre terminan sin coincidir.
      const contado = sumaConteo(conteoApertura)
      // La incidencia de la entrega se escribe sola con los números, y lo
      // que teclee quien recibe va detrás. Así queda dicho aunque nadie
      // escriba nada (el kiosko casi no tiene teclado).
      let nota: string | undefined
      if (entregado && contado !== entregado.fondoEsperado) {
        const dif = contado - entregado.fondoEsperado
        nota = `Recibí ${mxn(contado)} de ${mxn(entregado.fondoEsperado)} esperados ` +
          `(${dif > 0 ? 'sobran' : 'faltan'} ${mxn(Math.abs(dif))}).` +
          (notaRecibo.trim() ? ` ${notaRecibo.trim()}` : '')
      } else if (notaRecibo.trim()) {
        nota = notaRecibo.trim()
      }
      await abrirCaja(sb, caja.id, contado, empleado?.id, conteoApertura, nota)
      setResultado('abierto')
      setFase('listo')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  /**
   * El candado del corte vive en el servidor (`fn_cerrar_corte`). Si quien
   * cierra no tiene permiso, el servidor contesta «hace falta autorización»
   * y aquí se pide el PIN de quien sí pueda — no es un error, es el candado
   * haciendo su trabajo. Lo contado no se pierde en el camino.
   */
  async function cerrarTurno(pinDeAutorizacion?: string) {
    if (!corte || guardando) return
    // Lo cobrado sin internet todavía no está en la base: si la caja se
    // cierra antes de que se registre, ese efectivo está en el cajón pero
    // no en el esperado del corte, y el arqueo sale «sobrante» de algo que
    // sí se vendió.
    const sinMandar = useVentasSinInternet.getState().pendientes.length
    if (sinMandar > 0) {
      setError(
        `Hay ${sinMandar} venta${sinMandar === 1 ? '' : 's'} cobrada${sinMandar === 1 ? '' : 's'} sin internet que ` +
          'todavía no se registra' + (sinMandar === 1 ? '' : 'n') + '. Se mandan solas en cuanto vuelve el internet; ' +
          'cierra la caja después, o ese efectivo no va a entrar en este corte.',
      )
      return
    }
    if (distribucion && distribucion.faltante > 0 && !reposicionOk) {
      setError(`No alcanza para dejar el fondo de ${mxn(fondoSugerido ?? 0)}. Confirma la reposición de ${mxn(distribucion.faltante)} antes de cerrar.`)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      // Con fondo fijo, el cierre dice qué se queda y qué se retira; el
      // servidor lo vuelve a revisar contra lo contado. Sin fondo fijo
      // (gerencia no lo ha puesto), el corte de siempre.
      if (distribucion) {
        const r = await cerrarCajaConFondo(sb, corte.id, sumaConteo(conteo), conteo, distribucion.fondo, {
          reposicion: distribucion.faltante > 0 ? distribucion.faltante : undefined,
          pinAutoriza: pinDeAutorizacion,
        })
        setCierre(r)
        setAutorizo(r.autorizo)
      } else {
        const r = await cerrarCaja(sb, corte.id, sumaConteo(conteo), empleado?.id, undefined, conteo, pinDeAutorizacion)
        setAutorizo(r.autorizo)
      }
      setPidiendoAutorizacion(false)
      setPinAutoriza('')
      setCorte(null)
      setResultado('cerrado')
      setFase('listo')
    } catch (e) {
      if (e instanceof RequiereAutorizacion) {
        setPidiendoAutorizacion(true)
      } else {
        setError(mensajeDeError(e))
      }
      setPinAutoriza('')
    } finally {
      setGuardando(false)
    }
  }

  async function salir() {
    if (sesionPropia) {
      // El modal abrió la sesión de personal; no debe quedar viva en una
      // pantalla que opera el público.
      try { await salirDeSesion(sb) } catch { /* sin sesión ya es salir */ }
    }
    onCerrar()
  }

  if (!abierto) return null

  const totalContado = sumaConteo(conteo)
  const dif = totalContado - (resumen?.efectivo_esperado ?? 0)

  return (
    <div data-no-recargar className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div
        className={`bg-sa-cream-paper rounded-3xl shadow-2xl max-w-full max-h-full overflow-y-auto ${
          fase === 'cerrar' && fondoSugerido != null ? 'w-[920px]' : 'w-[440px]'
        }`}
      >
        {/* Encabezado */}
        <div className="bg-sa-green-deep text-sa-cream rounded-t-3xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-cream/50">
              {caja ? caja.nombre : 'Caja'}{empleado ? ` · ${empleado.nombre}` : ''}
            </p>
            <h2 className="font-display text-2xl leading-tight">Corte de caja</h2>
          </div>
          <button
            onClick={() => void salir()}
            className="w-11 h-11 rounded-full border border-sa-cream/25 text-sa-cream/80 hover:bg-sa-cream/10 text-xl"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {error && (
            <p className="font-mono text-sm text-sa-strawberry bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-4">
              {error}
            </p>
          )}

          {/* ---- PIN ---- */}
          {(fase === 'pin' || fase === 'pinRecibe') && (
            <div className="flex flex-col items-center">
              {fase === 'pinRecibe' ? (
                <>
                  <p className="font-display text-xl text-sa-green-ink text-center">¿Quién recibe la caja?</p>
                  <p className="font-body text-sa-green-ink/70 text-center text-sm mt-1">
                    Que ponga su PIN quien empieza el turno. Su PIN es su firma de que
                    recibe el fondo{cierre ? ` de ${mxn(cierre.fondoDejado + (cierre.reposicion ?? 0))}` : ''}.
                  </p>
                </>
              ) : (
                <p className="font-body text-sa-green-ink/70 text-center text-sm">
                  Ingresa tu PIN de personal para abrir o cerrar el turno.
                </p>
              )}
              <div className="flex gap-2.5 mt-5 h-4">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full transition-colors ${
                      i < pin.length ? 'bg-sa-green' : 'bg-sa-green-ink/15'
                    }`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    onClick={() => teclearPin(d)}
                    disabled={verificando}
                    className="w-[72px] h-[72px] rounded-full bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => setPin('')}
                  disabled={verificando}
                  className="w-[72px] h-[72px] rounded-full border border-sa-green-ink/20 text-sa-green-ink font-mono text-[10px] uppercase tracking-wide disabled:opacity-40"
                >
                  Borrar
                </button>
                <button
                  onClick={() => teclearPin('0')}
                  disabled={verificando}
                  className="w-[72px] h-[72px] rounded-full bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
                >
                  0
                </button>
                <button
                  onClick={() => pin.length >= 4 && void intentarPin(pin)}
                  disabled={verificando || pin.length < 4}
                  className="w-[72px] h-[72px] rounded-full bg-sa-banana text-sa-green-ink font-display text-sm disabled:opacity-30"
                >
                  Entrar
                </button>
              </div>
              {verificando && (
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-sa-green-ink/40 mt-4">
                  Verificando…
                </p>
              )}
            </div>
          )}

          {/* ---- Cargando ---- */}
          {fase === 'cargando' && (
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sa-green-ink/50 text-center py-10">
              Consultando la caja…
            </p>
          )}

          {/* ---- Abrir turno ---- */}
          {fase === 'abrir' && (
            <div>
              {empleado && (
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="font-body text-sm text-sa-green-ink">
                    Abre el turno: <b>{empleado.nombre}</b>
                  </p>
                  {/* Quien abre responde del fondo: si la sesión es de
                      quien acaba de cerrar, aquí se cambia sin salir. */}
                  <button
                    onClick={() => { setError(null); setPin(''); setFase('pinRecibe') }}
                    className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/60 underline"
                  >
                    ¿No eres tú?
                  </button>
                </div>
              )}
              {entregado ? (
                <div className="rounded-sa-lg bg-sa-banana/20 border border-sa-banana px-4 py-3">
                  <p className="font-body text-sm text-sa-green-ink/80">
                    Recibes el fondo que dejó <b>{entregado.entrego ?? 'el turno anterior'}</b>
                    {entregado.cerradoEn ? ` a las ${new Date(entregado.cerradoEn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Merida' })}` : ''}
                    {' '}({folioDeCorte(entregado.folio)}). Cuéntalo y confirma.
                  </p>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">Fondo esperado</span>
                    <span className="font-display text-3xl text-sa-green-ink leading-none">{mxn(entregado.fondoEsperado)}</span>
                  </div>
                  {entregado.reposicion ? (
                    <p className="font-mono text-[11px] text-sa-green-ink/60 mt-1">
                      Incluye {mxn(entregado.reposicion)} de reposición.
                    </p>
                  ) : null}
                  <DesgloseChico conteo={entregado.desgloseFondo} />
                </div>
              ) : (
                <p className="font-body text-sa-green-ink/70 text-sm">
                  No hay un corte abierto. Cuenta el fondo con el que arrancas
                  y el total sale solo.
                </p>
              )}
              {/* El mismo conteo que el del cierre, a proposito: contar al
                  abrir con una forma y al cerrar con otra es como se
                  pierden los faltantes. Y el desglose se guarda, asi que
                  el dia que falte un billete de 500 se puede ver cuantos
                  habia al arrancar. */}
              {permisos && !permisos.abrir_caja && (
                <p className="font-body text-sm text-sa-strawberry bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mt-3">
                  Tu usuario no tiene permiso de abrir la caja. Pídeselo a gerencia
                  (Admin → Personal → Permisos) o que la abra alguien que sí pueda.
                </p>
              )}
              <ConteoDeCaja conteo={conteoApertura} onCambiar={setConteoApertura} etiqueta="Fondo inicial en caja" />
              {/* El fondo que fijó gerencia, contra lo contado. Se puede abrir
                  con otro monto (hay días que falta cambio): no se bloquea,
                  se dice. La base guarda los dos. */}
              {/* Contra lo que dejó el turno anterior. Si no cuadra se dice
                  aquí, se anota sola en el corte y la diferencia queda
                  de la ENTREGA, no de ninguno de los dos turnos. */}
              {entregado && (() => {
                const contado = sumaConteo(conteoApertura)
                const dif = contado - entregado.fondoEsperado
                if (contado === 0) return null
                return dif === 0 ? (
                  <p className="mt-3 rounded-sa bg-sa-mint/25 text-sa-green-ink px-4 py-3 font-body text-sm">
                    ✓ <b>Fondo recibido correctamente.</b> Puedes iniciar tu turno.
                  </p>
                ) : (
                  <div className="mt-3 rounded-sa bg-sa-strawberry/10 border border-sa-strawberry/30 px-4 py-3">
                    <p className="font-body text-sm text-sa-strawberry">
                      <b>{dif > 0 ? 'Sobran' : 'Faltan'} {mxn(Math.abs(dif))}</b> contra lo que se entregó.
                      Vuelve a contar; si sigue igual, queda anotado en la entrega.
                    </p>
                    <input
                      id="nota-recibo"
                      value={notaRecibo}
                      onChange={(e) => setNotaRecibo(e.target.value)}
                      placeholder="¿Qué pasó? (opcional)"
                      maxLength={200}
                      className="mt-2 w-full rounded-sa border border-sa-green-ink/15 bg-white px-3 py-2 font-body text-sm text-sa-green-ink"
                    />
                  </div>
                )
              })()}
              {!entregado && fondoSugerido != null && (() => {
                const contado = sumaConteo(conteoApertura)
                const dif = contado - fondoSugerido
                return (
                  <div className="mt-3 rounded-sa border border-sa-green-ink/10 bg-white px-4 py-3 font-mono text-sm">
                    <div className="flex justify-between"><span className="font-bold">Fondo recomendado</span><span className="font-bold">{mxn(fondoSugerido)}</span></div>
                    <div className="flex justify-between text-sa-green-ink/70"><span>Fondo contado</span><span>{mxn(contado)}</span></div>
                    <div className={`flex justify-between ${contado === 0 ? 'text-sa-green-ink/40' : dif === 0 ? 'text-sa-green' : 'text-sa-strawberry'}`}>
                      <span>Diferencia</span>
                      <span>{contado === 0 ? '—' : dif === 0 ? 'cuadra' : `${dif > 0 ? '+' : '−'}${mxn(Math.abs(dif))}`}</span>
                    </div>
                  </div>
                )
              })()}
              <button
                onClick={() => void abrirTurno()}
                disabled={guardando || sumaConteo(conteoApertura) <= 0 || (permisos != null && !permisos.abrir_caja)}
                className="w-full mt-5 bg-sa-green hover:brightness-110 disabled:opacity-50 text-sa-cream py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
              >
                {guardando
                  ? 'Abriendo…'
                  : sumaConteo(conteoApertura) > 0
                    ? `${entregado ? 'Iniciar turno' : 'Abrir caja'} con ${mxn(sumaConteo(conteoApertura))}`
                    : 'Cuenta el fondo para abrir'}
              </button>
              <CalibrarRollo />
              <CargarInventario />
              <AbrirBote />
              <PedirCambio />
            </div>
          )}

          {/* ---- Cerrar turno ---- */}
          {fase === 'cerrar' && resumen && (
            <div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { pie: 'Órdenes', dato: String(resumen.num_ordenes ?? 0) },
                  { pie: 'Cobrado', dato: mxn(resumen.total_pagado) },
                  { pie: 'Efectivo esperado', dato: mxn(resumen.efectivo_esperado) },
                ].map((b) => (
                  <div key={b.pie} className="bg-white rounded-sa p-3 text-center shadow-sa-sm">
                    <p className="font-display text-lg leading-none text-sa-green-ink">{b.dato}</p>
                    <p className="font-mono text-[9px] uppercase tracking-wide text-sa-green-ink/50 mt-1.5">{b.pie}</p>
                  </div>
                ))}
              </div>
              <div className={fondoSugerido != null ? 'grid grid-cols-2 gap-6 items-start' : ''}>
                <div className="min-w-0">
                  <ConteoDeCaja conteo={conteo} onCambiar={(c) => { setConteo(c); setReposicionOk(false) }} />
                  {totalContado > 0 && fondoSugerido == null && (
                    <p
                      className={`font-mono text-xs rounded-sa px-3 py-2 mt-3 ${
                        dif === 0
                          ? 'bg-sa-mint/25 text-sa-green-ink'
                          : 'bg-sa-strawberry/10 text-sa-strawberry'
                      }`}
                    >
                      Diferencia: {mxn(dif)} {dif === 0 ? '(cuadra)' : dif > 0 ? '(sobrante)' : '(faltante)'}
                    </p>
                  )}
                </div>
                {fondoSugerido != null && (
                  <ResumenYFondo
                    resumen={resumen}
                    contado={totalContado}
                    conteo={conteo}
                    fondoFijo={fondoSugerido}
                    distribucion={distribucion}
                    onAjustar={(f) => { setFondoManual(f); setReposicionOk(false) }}
                    reposicionOk={reposicionOk}
                    onReposicionOk={setReposicionOk}
                  />
                )}
              </div>
              {/* Se avisa ANTES de contar, no después: enterarse del
                  candado con el cajón ya contado es enterarse tarde. */}
              {permisos && !permisos.cerrar_caja && !pidiendoAutorizacion && (
                <p className="font-body text-sm text-sa-green-ink bg-sa-banana/25 border border-sa-banana rounded-sa px-4 py-3 mt-4">
                  🔒 Tu usuario no hace cortes. Cuenta el cajón y al cerrar se pedirá
                  el PIN de quien sí pueda autorizarlo{distribucion && distribucion.faltante > 0 ? ' (también autoriza la reposición)' : ''}.
                </p>
              )}
              {pidiendoAutorizacion ? (
                <AutorizarConPin
                  pin={pinAutoriza}
                  onCambiar={setPinAutoriza}
                  ocupado={guardando}
                  onAutorizar={() => void cerrarTurno(pinAutoriza)}
                  onCancelar={() => { setPidiendoAutorizacion(false); setPinAutoriza('') }}
                />
              ) : (
                <button
                  onClick={() => void cerrarTurno()}
                  disabled={guardando || (distribucion != null && distribucion.faltante > 0 && !reposicionOk)}
                  className="w-full mt-5 bg-sa-strawberry hover:brightness-110 disabled:opacity-50 text-white py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
                >
                  {guardando
                    ? 'Cerrando…'
                    : distribucion
                      ? `Cerrar turno · retirar ${mxn(distribucion.retiro)}`
                      : 'Cerrar caja'}
                </button>
              )}
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mt-3 text-center">
                Para cambio de turno: cierra y entrega a quien sigue con su PIN
              </p>
              <CalibrarRollo />
              <CargarInventario />
              <AbrirBote />
              <PedirCambio />
            </div>
          )}

          {/* ---- Resultado ---- */}
          {fase === 'listo' && (
            <div className="flex flex-col items-center text-center">
              <img src="/milo-transparent.png" alt="" className="h-28 drop-shadow-xl" />
              {resultado === 'abierto' ? (
                <>
                  <h3 className="font-display text-3xl text-sa-green-ink mt-3">Caja abierta</h3>
                  <p className="font-body text-sa-green-ink/60 text-sm mt-1">
                    Turno registrado{empleado ? ` a nombre de ${empleado.nombre}` : ''}. ¡A agitar!
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-display text-3xl text-sa-green-ink mt-3">Buen turno, campeón</h3>
                  {cierre ? (
                    <div className="w-full mt-4 text-left bg-white rounded-sa-lg border border-sa-green-ink/10 px-4 py-3 font-mono text-sm">
                      <p className="text-[10px] uppercase tracking-widest text-sa-green-ink/50">{folioDeCorte(cierre.folio)}</p>
                      <div className="flex justify-between items-baseline mt-2">
                        <span className="font-bold">Efectivo a retirar</span>
                        <span className="font-display text-2xl text-sa-strawberry">{mxn(cierre.retiro)}</span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold">Fondo que se queda</span>
                        <span className="font-display text-2xl text-sa-green">{mxn(cierre.fondoDejado)}</span>
                      </div>
                      {cierre.reposicion ? (
                        <div className="flex justify-between text-sa-strawberry">
                          <span>Reposición a poner</span><span>{mxn(cierre.reposicion)}</span>
                        </div>
                      ) : null}
                      <p className="font-body text-xs text-sa-green-ink/60 mt-2">
                        El comprobante queda en Admin → Cortes de caja y se manda a gerencia.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50 mt-2">Total cobrado</p>
                      <p className="font-display text-3xl text-sa-strawberry">{mxn(resumen?.total_pagado ?? 0)}</p>
                    </>
                  )}
                  {autorizo && autorizo !== empleado?.nombre && (
                    <p className="font-mono text-[11px] uppercase tracking-widest text-sa-green-ink/55 mt-2">
                      Corte autorizado por {autorizo}
                    </p>
                  )}
                </>
              )}
              {resultado === 'cerrado' && (
                <button
                  onClick={() => { setError(null); setPin(''); setFase('pinRecibe') }}
                  className="w-full mt-6 bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-lg hover:brightness-110 transition-all"
                >
                  Entregar a quien sigue
                </button>
              )}
              <div className="flex gap-3 mt-3 w-full">
                {resultado === 'cerrado' && (
                  <button
                    onClick={() => { setError(null); void cargarContexto() }}
                    className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink py-3.5 rounded-sa-lg font-display text-base hover:bg-sa-cream-soft transition-colors"
                  >
                    Lo abro yo
                  </button>
                )}
                <button
                  onClick={() => void salir()}
                  className="flex-1 bg-sa-green-deep text-sa-cream py-3.5 rounded-sa-lg font-display text-base hover:brightness-110 transition-all"
                >
                  Listo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface Distribucion {
  fondo: Conteo
  total: number
  retiro: number
  faltante: number
  exacto: boolean
  manual: boolean
}

/** Las piezas de un conteo con algo, de mayor a menor (billete antes que moneda). */
function filasCon(c: Conteo | null | undefined): { especie: 'billetes' | 'monedas'; den: number; n: number }[] {
  if (!c) return []
  const filas = [
    ...BILLETES.map((d) => ({ especie: 'billetes' as const, den: d, n: piezasDe(c, 'billetes', d) })),
    ...MONEDAS.map((d) => ({ especie: 'monedas' as const, den: d, n: piezasDe(c, 'monedas', d) })),
  ]
  return filas.filter((f) => f.n > 0)
}

/**
 * El lado derecho del corte: el resumen de siempre y, debajo, qué se
 * retira y qué se queda. Todo sale de lo contado; la pantalla propone y el
 * servidor revisa.
 */
function ResumenYFondo({
  resumen, contado, conteo, fondoFijo, distribucion, onAjustar, reposicionOk, onReposicionOk,
}: {
  resumen: CorteResumen
  contado: number
  conteo: Conteo
  fondoFijo: number
  distribucion: Distribucion | null
  onAjustar: (f: Conteo | null) => void
  reposicionOk: boolean
  onReposicionOk: (v: boolean) => void
}) {
  const [ajustando, setAjustando] = useState(false)
  const esperado = Number(resumen.efectivo_esperado ?? 0)
  const dif = contado - esperado
  const filasRenglon = (etiqueta: string, valor: string, fuerte = false, color = '') => (
    <div className={`flex justify-between py-1.5 border-b border-sa-green-ink/5 last:border-0 ${fuerte ? 'font-bold' : ''} ${color}`}>
      <span>{etiqueta}</span><span className="tabular-nums">{valor}</span>
    </div>
  )

  return (
    <div className="min-w-0 space-y-3">
      {contado > 0 && (
        <p
          className={`rounded-sa px-4 py-3 font-body text-sm font-bold ${
            dif === 0 ? 'bg-sa-mint/25 text-sa-green-ink' : 'bg-sa-strawberry/10 text-sa-strawberry'
          }`}
        >
          {dif === 0 ? '✓ La caja cuadra.' : `${dif > 0 ? 'Sobran' : 'Faltan'} ${mxn(Math.abs(dif))} en este turno.`}
        </p>
      )}

      <div className="bg-white rounded-sa border border-sa-green-ink/10 px-4 py-2 font-mono text-sm text-sa-green-ink">
        <p className="font-body font-bold text-sm py-1">Resumen del corte</p>
        {filasRenglon('Órdenes del turno', String(resumen.num_ordenes ?? 0))}
        {filasRenglon('Ventas en efectivo', mxn(Number(resumen.total_efectivo ?? 0)))}
        {filasRenglon('Fondo inicial del turno', mxn(Number(resumen.fondo_inicial ?? 0)))}
        {filasRenglon('Efectivo esperado', mxn(esperado), true)}
        {filasRenglon('Efectivo contado', contado > 0 ? mxn(contado) : '—', true)}
        {contado > 0 && filasRenglon(
          'Diferencia',
          `${dif > 0 ? '+' : dif < 0 ? '−' : ''}${mxn(Math.abs(dif))}`,
          true,
          dif === 0 ? 'text-sa-green' : 'text-sa-strawberry',
        )}
      </div>

      {!distribucion ? (
        <p className="font-body text-sm text-sa-green-ink/60 px-1">
          Cuenta el cajón y aquí aparece cuánto retirar y qué billetes dejar
          para el fondo de {mxn(fondoFijo)}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-sa bg-sa-strawberry/10 px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-strawberry/80">Efectivo a retirar</p>
              <p className="font-display text-2xl text-sa-strawberry leading-tight">{mxn(distribucion.retiro)}</p>
            </div>
            <div className="rounded-sa bg-sa-mint/25 px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/60">Fondo para el siguiente turno</p>
              <p className="font-display text-2xl text-sa-green-ink leading-tight">{mxn(distribucion.total)}</p>
            </div>
          </div>

          {distribucion.faltante > 0 ? (
            <div className="rounded-sa border-2 border-sa-strawberry/40 bg-sa-strawberry/5 px-4 py-3">
              <p className="font-body text-sm text-sa-strawberry">
                <b>No alcanza para dejar el fondo de {mxn(fondoFijo)}.</b> Faltan{' '}
                {mxn(distribucion.faltante)}. Se queda todo lo contado y alguien con
                permiso de corte tiene que reponer la diferencia.
              </p>
              <button
                onClick={() => onReposicionOk(!reposicionOk)}
                className={`mt-2 w-full rounded-sa py-2.5 font-display text-base transition-colors ${
                  reposicionOk ? 'bg-sa-green text-sa-cream' : 'bg-white border border-sa-strawberry/40 text-sa-strawberry'
                }`}
              >
                {reposicionOk ? `✓ Se reponen ${mxn(distribucion.faltante)}` : `Registrar reposición de ${mxn(distribucion.faltante)}`}
              </button>
            </div>
          ) : !distribucion.exacto ? (
            <p className="rounded-sa bg-sa-banana/25 border border-sa-banana px-4 py-2 font-body text-sm text-sa-green-ink">
              Con lo contado no se puede dejar {mxn(fondoFijo)} exactos: el fondo
              queda en <b>{mxn(distribucion.total)}</b>. Ajústalo si prefieres otros billetes.
            </p>
          ) : null}

          <div className="bg-white rounded-sa border border-sa-green-ink/10 px-4 py-2">
            <div className="flex items-center justify-between py-1">
              <p className="font-body font-bold text-sm text-sa-green-ink">Billetes y monedas que se quedan</p>
              <button
                onClick={() => setAjustando((v) => !v)}
                className="font-mono text-[11px] uppercase tracking-wide text-sa-green underline"
              >
                {ajustando ? 'Listo' : 'Ajustar'}
              </button>
            </div>
            {(ajustando ? filasCon(conteo) : filasCon(distribucion.fondo)).map((f) => {
              const enFondo = piezasDe(distribucion.fondo, f.especie, f.den)
              const contadas = piezasDe(conteo, f.especie, f.den)
              const poner = (n: number) =>
                onAjustar(ponerPiezas(distribucion.fondo, f.especie, f.den, Math.max(0, Math.min(contadas, n))))
              return (
                <div key={`${f.especie}${f.den}`} className="flex items-center gap-2 py-1 font-mono text-sm text-sa-green-ink">
                  <span className={`w-16 text-center rounded-sa py-1 ${f.especie === 'monedas' ? 'bg-sa-banana/25' : 'bg-sa-mint/25'}`}>
                    ${f.den}
                  </span>
                  {ajustando ? (
                    <>
                      <button onClick={() => poner(enFondo - 1)} disabled={enFondo <= 0} className="w-9 h-9 rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 disabled:opacity-30">−</button>
                      <span className="w-10 text-center">{enFondo}</span>
                      <button onClick={() => poner(enFondo + 1)} disabled={enFondo >= contadas} className="w-9 h-9 rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 disabled:opacity-30">+</button>
                      <span className="text-[11px] text-sa-green-ink/45">de {contadas}</span>
                    </>
                  ) : (
                    <span className="w-10 text-center">× {enFondo}</span>
                  )}
                  <span className="flex-1 text-right tabular-nums">{mxn(enFondo * f.den)}</span>
                </div>
              )
            })}
            <div className="flex justify-between py-1.5 mt-1 border-t border-sa-green-ink/10 font-mono text-sm font-bold text-sa-green-ink">
              <span>Total fondo</span><span>{mxn(distribucion.total)}</span>
            </div>
            <p className="font-body text-[11px] text-sa-green-ink/55 pb-1">
              {distribucion.manual
                ? <>Ajustado a mano. <button onClick={() => onAjustar(null)} className="underline">Volver a la sugerencia</button></>
                : 'Sugerido: se retiran los billetes grandes y se queda el cambio.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

/** El desglose del fondo que se entregó, en una línea: para contar contra él. */
function DesgloseChico({ conteo }: { conteo: unknown }) {
  const d = leerDesglose(conteo)
  const filas = filasCon(d ? { billetes: d.billetes, monedas: d.monedas } : null)
  if (filas.length === 0) return null
  return (
    <p className="font-mono text-[11px] text-sa-green-ink/60 mt-2 leading-relaxed">
      {filas.map((f) => `${f.n} × $${f.den}${f.especie === 'monedas' ? ' (moneda)' : ''}`).join(' · ')}
    </p>
  )
}

/**
 * El PIN de quien SÍ puede hacer el corte. El servidor lo compara y deja
 * anotado quién autorizó (`caja_cortes.cierre_autorizado_por`); aquí solo
 * se teclea. Mismo teclado que el PIN de entrada para no enseñar dos.
 */
function AutorizarConPin({
  pin, onCambiar, ocupado, onAutorizar, onCancelar,
}: {
  pin: string
  onCambiar: (p: string) => void
  ocupado: boolean
  onAutorizar: () => void
  onCancelar: () => void
}) {
  const tecla = (d: string) => { if (!ocupado) onCambiar((pin + d).slice(0, 6)) }
  return (
    <div className="mt-5 bg-white border-2 border-sa-banana rounded-sa-lg p-4 flex flex-col items-center">
      <p className="font-display text-xl text-sa-green-ink">Autorización del corte</p>
      <p className="font-body text-sm text-sa-green-ink/65 text-center mt-1">
        Tu usuario no hace cortes. Que ponga su PIN quien sí pueda autorizarlo.
      </p>
      <div className="flex gap-2.5 mt-4 h-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full ${i < pin.length ? 'bg-sa-green' : 'bg-sa-green-ink/15'}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5 mt-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => tecla(d)}
            disabled={ocupado}
            className="w-16 h-16 rounded-full bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => onCambiar('')}
          disabled={ocupado}
          className="w-16 h-16 rounded-full border border-sa-green-ink/20 text-sa-green-ink font-mono text-[10px] uppercase tracking-wide disabled:opacity-40"
        >
          Borrar
        </button>
        <button
          onClick={() => tecla('0')}
          disabled={ocupado}
          className="w-16 h-16 rounded-full bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
        >
          0
        </button>
        <button
          onClick={onAutorizar}
          disabled={ocupado || pin.length < 4}
          className="w-16 h-16 rounded-full bg-sa-banana text-sa-green-ink font-display text-xs leading-tight disabled:opacity-30"
        >
          {ocupado ? '…' : 'Cerrar'}
        </button>
      </div>
      <button
        onClick={onCancelar}
        disabled={ocupado}
        className="mt-3 font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 underline"
      >
        Volver
      </button>
    </div>
  )
}

/**
 * Conteo por denominación.
 *
 * Antes había que sumar el cajón de cabeza y teclear un total. Eso es
 * justo donde se cuela el error del corte: si el número no cuadra, no hay
 * forma de saber si falta dinero o si alguien sumó mal, y lo segundo pasa
 * mucho más seguido que lo primero.
 *
 * Contando por denominación el total lo hace la máquina, y de paso queda
 * el desglose: si mañana falta un billete de 500, se ve cuántos había.
 *
 * La forma vive en `@shake/utils` porque Admin la lee en Cortes: dos
 * copias se separan en cuanto alguien toca una.
 */
function FilaDenominacion({
  den, cuantos, onCambiar, onTeclear, moneda,
}: {
  den: number; cuantos: number; onCambiar: (n: number) => void
  /** Abre el pad numérico para esta fila. */
  onTeclear: () => void
  moneda?: boolean
}) {
  const subtotal = den * (cuantos || 0)
  return (
    <div className="flex items-center gap-2">
      <span
        className={`shrink-0 w-14 text-center font-display text-base leading-none py-2 rounded-sa ${
          moneda
            ? 'bg-sa-banana/25 text-sa-green-ink'
            : 'bg-sa-mint/25 text-sa-green-ink'
        }`}
      >
        ${den}
      </span>
      <button
        onClick={() => onCambiar(Math.max(0, (cuantos || 0) - 1))}
        className="shrink-0 w-11 h-11 rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 font-display text-xl text-sa-green-ink active:scale-95 transition-transform disabled:opacity-30"
        disabled={!cuantos}
        aria-label={`Quitar un ${den}`}
      >
        −
      </button>
      {/* Tocar el número abre el pad: 52 monedas de $5 son 52 toques al
          «+», o tres en el pad. El kiosko no tiene teclado. */}
      <button
        type="button"
        onClick={onTeclear}
        aria-label={`Escribir cuántos de ${den}`}
        className={`w-14 h-11 text-center rounded-sa border border-sa-green-ink/15 bg-white font-mono text-lg active:scale-95 transition-transform ${
          cuantos ? 'text-sa-green-ink' : 'text-sa-green-ink/30'
        }`}
      >
        {cuantos || 0}
      </button>
      <button
        onClick={() => onCambiar(Math.min(999, (cuantos || 0) + 1))}
        className="shrink-0 w-11 h-11 rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 font-display text-xl text-sa-green-ink active:scale-95 transition-transform"
        aria-label={`Agregar un ${den}`}
      >
        +
      </button>
      <span className="flex-1 text-right font-mono text-sm text-sa-green-ink/60">
        {subtotal ? mxn(subtotal) : ''}
      </span>
    </div>
  )
}

function ConteoDeCaja({
  conteo, onCambiar, etiqueta = 'Efectivo contado en caja',
}: { conteo: Conteo; onCambiar: (c: Conteo) => void; etiqueta?: string }) {
  const total = sumaConteo(conteo)
  const subtotal = (especie: 'billetes' | 'monedas', lista: readonly number[]) =>
    lista.reduce((t, d) => t + d * piezasDe(conteo, especie, d), 0)

  /**
   * Qué fila se está tecleando en el pad (índice en `filas`). El pad
   * recorre el cajón en orden —billetes de mayor a menor, luego monedas—
   * porque así se cuenta: «Siguiente» guarda y pasa a la que sigue, sin
   * volver a buscar la fila en la lista.
   */
  const filas = [
    ...BILLETES.map((d) => ({ especie: 'billetes' as const, den: d })),
    ...MONEDAS.map((d) => ({ especie: 'monedas' as const, den: d })),
  ]
  const [tecleando, setTecleando] = useState<number | null>(null)
  const abrir = (especie: 'billetes' | 'monedas', den: number) =>
    setTecleando(filas.findIndex((f) => f.especie === especie && f.den === den))

  return (
    <div className="mt-4">
      {tecleando !== null && filas[tecleando] && (
        <PadConteo
          key={tecleando}
          den={filas[tecleando].den}
          moneda={filas[tecleando].especie === 'monedas'}
          actual={piezasDe(conteo, filas[tecleando].especie, filas[tecleando].den)}
          hayOtra={tecleando < filas.length - 1}
          onGuardar={(n, seguir) => {
            const f = filas[tecleando]
            onCambiar(ponerPiezas(conteo, f.especie, f.den, n))
            setTecleando(seguir && tecleando < filas.length - 1 ? tecleando + 1 : null)
          }}
          onCerrar={() => setTecleando(null)}
        />
      )}
      <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
        {etiqueta}
      </p>

      <div className="bg-white border border-sa-green-ink/10 rounded-sa p-3 space-y-2">
        {/* Billetes y monedas son listas separadas, y el $20 aparece en las
            dos. No es un descuido: en México existe de las dos formas, y
            antes compartían casilla — al contar las monedas se borraban
            los billetes. Cada fila escribe la suya. */}
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/45">Billetes</p>
          <span className="font-mono text-[10px] text-sa-green-ink/45">
            {subtotal('billetes', BILLETES) ? mxn(subtotal('billetes', BILLETES)) : ''}
          </span>
        </div>
        {BILLETES.map((d) => (
          <FilaDenominacion
            key={`b${d}`}
            den={d}
            cuantos={piezasDe(conteo, 'billetes', d)}
            onCambiar={(n) => onCambiar(ponerPiezas(conteo, 'billetes', d, n))}
            onTeclear={() => abrir('billetes', d)}
          />
        ))}

        <div className="flex items-baseline justify-between pt-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/45">Monedas</p>
          <span className="font-mono text-[10px] text-sa-green-ink/45">
            {subtotal('monedas', MONEDAS) ? mxn(subtotal('monedas', MONEDAS)) : ''}
          </span>
        </div>
        {MONEDAS.map((d) => (
          <FilaDenominacion
            key={`m${d}`}
            den={d}
            cuantos={piezasDe(conteo, 'monedas', d)}
            onCambiar={(n) => onCambiar(ponerPiezas(conteo, 'monedas', d, n))}
            onTeclear={() => abrir('monedas', d)}
            moneda
          />
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-3 mt-3 px-1">
        <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">Total contado</span>
        <span className="font-display text-3xl text-sa-green-ink leading-none">{mxn(total)}</span>
      </div>
    </div>
  )
}

/**
 * El pad de una denominación. Se escribe el número de piezas y listo:
 * sin sumar de cabeza y sin cincuenta toques al «+».
 *
 * Arranca vacío, con lo que ya había escrito en gris: teclear reemplaza,
 * que es lo que uno espera al recontar. Si no se teclea nada, «Siguiente»
 * y «Listo» dejan el número como estaba — pasar por una fila sin tocarla
 * no la borra.
 */
function PadConteo({
  den, moneda, actual, hayOtra, onGuardar, onCerrar,
}: {
  den: number; moneda: boolean; actual: number; hayOtra: boolean
  onGuardar: (n: number, seguir: boolean) => void
  onCerrar: () => void
}) {
  const [texto, setTexto] = useState('')
  const valor = texto === '' ? actual : Math.min(999, Number(texto))
  const tecla = (d: string) => setTexto((t) => (t === '0' ? d : (t + d).slice(0, 3)))

  return (
    <div
      className="fixed inset-0 z-[60] bg-sa-green-deep/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}
    >
      <div className="w-full max-w-xs p-5 rounded-sa-lg bg-sa-cream-paper shadow-2xl">
        <div className="flex items-center justify-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-sa font-display text-2xl leading-none ${
              moneda ? 'bg-sa-banana/25' : 'bg-sa-mint/25'
            } text-sa-green-ink`}
          >
            ${den}
          </span>
          <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">
            {moneda ? 'monedas' : 'billetes'}
          </span>
        </div>

        <div className="mt-4 h-16 rounded-sa border-2 border-sa-green-ink/10 bg-white flex items-center justify-center">
          <span className={`font-mono text-4xl ${texto === '' ? 'text-sa-green-ink/30' : 'text-sa-green-ink'}`}>
            {texto === '' ? actual : texto}
          </span>
        </div>
        <p className="font-mono text-xs text-center text-sa-green-ink/60 mt-1.5 h-4">
          {valor ? `= ${mxn(valor * den)}` : ''}
        </p>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => tecla(d)}
              className="h-14 rounded-sa bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTexto((t) => t.slice(0, -1))}
            disabled={texto === ''}
            className="h-14 rounded-sa border border-sa-green-ink/20 text-sa-green-ink font-mono text-xs uppercase tracking-wide disabled:opacity-40"
          >
            ⌫ Borrar
          </button>
          <button
            type="button"
            onClick={() => tecla('0')}
            className="h-14 rounded-sa bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => onGuardar(valor, false)}
            className="h-14 rounded-sa bg-sa-green text-sa-cream font-display text-lg active:scale-95 transition-all"
          >
            Listo
          </button>
        </div>

        {hayOtra && (
          <button
            type="button"
            onClick={() => onGuardar(valor, true)}
            className="w-full mt-2 h-12 rounded-sa bg-sa-banana text-sa-green-ink font-display text-lg active:scale-95 transition-all"
          >
            Siguiente ›
          </button>
        )}
        <button
          type="button"
          onClick={onCerrar}
          className="w-full mt-1 py-2 font-mono text-xs uppercase tracking-wide text-sa-green-ink/60"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
