import { crearClienteEnMemoria, type ShakeClient } from '@shake/supabase'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { amable, errorDeFuncion } from './lib/rpc'
import { tacto } from './ui'

/**
 * El modo personal: la MISMA puerta que el kiosko (PIN → `staff-login` →
 * sesión de Supabase de ese empleado), en una conexión aparte.
 *
 *  - **Conexión aparte.** La sesión del cliente (su tarjeta) y la del
 *    empleado son cuentas distintas. Con una sola conexión, entrar como
 *    personal sacaría al cliente de su tarjeta.
 *  - **Solo en memoria.** Esta sesión no se guarda en el navegador: al
 *    recargar se pide el PIN otra vez. Un celular se presta y se pierde;
 *    una sesión de gerencia que sobrevive en él es una llave suelta.
 *    (En iOS se guarda bajo Face ID; en la web no hay llavero biométrico.)
 *
 * Los permisos no se deciden aquí: lo que se ve sale de funciones que ya
 * revisan el rol en el servidor.
 */

export interface EnTurno {
  ahora?: string
  yo?: { nombre?: string; rol?: string; es_jefe?: boolean }
  corte?: { desde?: string; abrio?: string; fondo?: number } | null
  en_cocina?: EnCocina[]
  impresoras?: Impresora[]
  impresion_atorada?: number
}
export interface EnCocina { estacion: string; estado: string; folio: number; nombre?: string; minutos: number }
export interface Impresora { nombre: string; en_linea: boolean; ultima_impresion?: string }
export interface PanelEnVivo extends EnTurno {
  dia?: { ordenes?: number; total?: number; ticket?: number }
  turno?: { ordenes?: number; total?: number; ticket?: number }
  por_metodo?: Record<string, number>
  pedidos_recientes?: { folio: number; nombre?: string; hora?: string; total: number; items?: string }[]
}
export interface MiPersonal {
  nombre?: string
  beneficio: boolean
  motivo?: string | null
  exige_turno?: boolean
  tope?: number
  usado_importe?: number
  grupos: { slug: string; nombre: string; max: number; usado: number }[]
  hoy: { producto: string; cantidad: number; importe: number; hora?: string }[]
  precios: { nombre: string; categoria?: string | null; precio: number; precio_personal: number; grupo?: string | null }[]
}
export interface PedidoAppPersonal {
  id: string; folio: number; total: number; estado: string; nombre?: string | null
  preparar_a?: string | null; items?: string | null; nota?: string | null
}

interface Personal {
  activo: boolean
  nombre: string | null
  esJefe: boolean
  panel: PanelEnVivo | null
  turno: EnTurno | null
  mi: MiPersonal | null
  miError: string | null
  pedidosApp: PedidoAppPersonal[]
  codigo: string | null
  codigoVence: number | null
  actualizado: number | null
  error: string | null
  entrar: (pin: string) => Promise<string | null>
  salir: () => Promise<void>
  refrescar: () => Promise<void>
  cargarMi: () => Promise<void>
  pedirCodigo: () => Promise<string | null>
  recargar: (pantalla: string) => Promise<string>
  entregar: (ordenId: string) => Promise<void>
}

const Ctx = createContext<Personal | null>(null)
export function usePersonal(): Personal {
  const p = useContext(Ctx)
  if (!p) throw new Error('usePersonal fuera de <PersonalProvider>')
  return p
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

export function PersonalProvider({ children }: { children: ReactNode }) {
  const cliente = useRef<ShakeClient | null>(null)
  if (!cliente.current) cliente.current = crearClienteEnMemoria()
  const c = cliente.current

  const [activo, setActivo] = useState(false)
  const [nombre, setNombre] = useState<string | null>(null)
  const [esJefe, setEsJefe] = useState(false)
  const [panel, setPanel] = useState<PanelEnVivo | null>(null)
  const [turno, setTurno] = useState<EnTurno | null>(null)
  const [mi, setMi] = useState<MiPersonal | null>(null)
  const [miError, setMiError] = useState<string | null>(null)
  const [pedidosApp, setPedidosApp] = useState<PedidoAppPersonal[]>([])
  const [codigo, setCodigo] = useState<string | null>(null)
  const [codigoVence, setCodigoVence] = useState<number | null>(null)
  const [actualizado, setActualizado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rpc = useCallback(async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await (c.rpc as unknown as Rpc)(fn, args)
    if (error) throw error
    return data as T
  }, [c])

  const salir = useCallback(async () => {
    await c.auth.signOut().catch(() => {})
    setActivo(false); setNombre(null); setEsJefe(false); setPanel(null); setTurno(null)
    setMi(null); setMiError(null); setPedidosApp([]); setCodigo(null); setCodigoVence(null); setError(null)
  }, [c])

  /** Se pide al entrar y al refrescar a mano, no cada 15 s: trae la lista de precios completa. */
  const cargarMi = useCallback(async () => {
    try {
      setMi(await rpc<MiPersonal>('fn_mi_personal'))
      setMiError(null)
    } catch (e) {
      setMiError(amable(e))
    }
  }, [rpc])

  /** Lo de cajero siempre; el panel con dinero solo si es gerencia. */
  const refrescar = useCallback(async () => {
    try {
      const t = await rpc<EnTurno>('fn_personal_en_turno')
      setTurno(t)
      const jefe = t.yo?.es_jefe ?? false
      setEsJefe(jefe)
      if (t.yo?.nombre) setNombre(t.yo.nombre)
      if (jefe) setPanel(await rpc<PanelEnVivo>('fn_panel_en_vivo', { p_todos_los_pedidos: false }))
      setPedidosApp((await rpc<PedidoAppPersonal[] | null>('fn_pedidos_app_en_vivo').catch(() => null)) ?? [])
      setActualizado(Date.now())
      setError(null)
    } catch (e) {
      // La sesión del PIN caducó: se sale limpio en vez de enseñar datos viejos.
      const { data } = await c.auth.getSession()
      if (!data.session) await salir()
      else setError(amable(e))
    }
  }, [c, rpc, salir])

  const entrar = useCallback(async (pin: string): Promise<string | null> => {
    const limpio = pin.replace(/\D/g, '')
    if (limpio.length < 4 || limpio.length > 6) return 'El PIN es de 4 a 6 dígitos.'
    const { data, error } = await c.functions.invoke('staff-login', { body: { pin: limpio } })
    if (error) { tacto.error(); return errorDeFuncion(error, 'PIN incorrecto') }
    const r = data as { ok: boolean; token_hash?: string; empleado?: { nombre?: string }; error?: { mensaje?: string } }
    if (!r?.ok || !r.token_hash) { tacto.error(); return r?.error?.mensaje ?? 'PIN incorrecto' }
    const { error: e2 } = await c.auth.verifyOtp({ type: 'email', token_hash: r.token_hash })
    if (e2) { tacto.error(); return `No se pudo abrir la sesión: ${e2.message}` }
    setNombre(r.empleado?.nombre ?? null)
    setActivo(true)
    tacto.exito()
    await refrescar()
    await cargarMi()
    return null
  }, [c, refrescar, cargarMi])

  /** Un código SHKP-… de un solo uso que vive 2 minutos, para la caja. */
  const pedirCodigo = useCallback(async (): Promise<string | null> => {
    try {
      const filas = await rpc<{ codigo: string; segundos: number }[]>('fn_personal_codigo_emitir')
      const f = filas?.[0]
      if (!f) return 'No llegó el código. Intenta otra vez.'
      setCodigo(f.codigo)
      setCodigoVence(Date.now() + f.segundos * 1000)
      tacto.ligero()
      return null
    } catch (e) {
      tacto.error()
      return amable(e)
    }
  }, [rpc])

  const recargar = useCallback(async (pantalla: string): Promise<string> => {
    try {
      await rpc('fn_pantallas_recargar', { p_pantalla: pantalla })
      tacto.exito()
      return 'Listo: se recarga en cuanto esté libre.'
    } catch (e) {
      tacto.error()
      return amable(e)
    }
  }, [rpc])

  const entregar = useCallback(async (ordenId: string) => {
    await rpc('fn_pedido_app_entregado', { p_orden_id: ordenId }).catch(() => {})
    await refrescar()
  }, [rpc, refrescar])

  const valor = useMemo<Personal>(() => ({
    activo, nombre, esJefe, panel, turno, mi, miError, pedidosApp, codigo, codigoVence, actualizado, error,
    entrar, salir, refrescar, cargarMi, pedirCodigo, recargar, entregar,
  }), [activo, nombre, esJefe, panel, turno, mi, miError, pedidosApp, codigo, codigoVence, actualizado, error, entrar, salir, refrescar, cargarMi, pedirCodigo, recargar, entregar])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
