import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  sesionActual, usuarioActual, cerrarSesion, onCambioSesion,
  vincularClienteAuth, miResumenLealtad, listarProductosParaVenta, listarAliados, configPedidosApp,
  type ResumenLealtad, type ProductoVenta, type Aliado, type ConfigPedidosApp,
} from '@shake/supabase'
import { sb } from './lib/sb'
import { rpc, amable, errorDeFuncion } from './lib/rpc'
import { registrarPush, quitarPush } from './lib/push'
import { escucharVueltaDeLogin } from './nativo'
import { vitrinaActiva, resumenVitrina, aliadosVitrina } from './vitrina'

/**
 * La sesión y el expediente del cliente, para toda la app. Es el mismo
 * `Estado` de la app de iOS: sesión → vincular → resumen, con el menú, los
 * aliados y los pedidos colgando de ahí. Un solo lugar, para que Menú,
 * Cuenta y Tarjeta lean lo mismo.
 */

export type Fase = 'arrancando' | 'sinSesion' | 'cargando' | 'lista'

/** `fn_promos_vigentes()`: las promos de Admin → Promos prendidas ahora. */
export interface Promo {
  id: string
  nombre: string
  descripcion: string | null
  tipo: string
  valor: number | null
  cantidad: number | null
  productos: string[] | null
}

/** `vw_producto_extras`: con qué va un producto (la misma lista del kiosko). */
export interface ExtraProducto {
  extra_id: string
  nombre: string
  precio: number | null
  grupo: string | null
  marca: string | null
  por_defecto: boolean | null
}

export interface SoyPersonal { es_personal: boolean; nombre?: string | null; rol?: string | null }

export interface MiPedido {
  id: string
  folio: number
  total: number
  pagado: boolean
  estado: string
  hora?: string | null
  preparar_a?: string | null
  items?: string | null
  nota?: string | null
  nombre?: string | null
}

export const TITULO_PEDIDO: Record<string, string> = {
  por_pagar: 'Sin pagar',
  recibido: 'Pagado · por preparar',
  preparando: 'Preparando',
  listo: 'Listo · pasa por él',
  entregado: 'Entregado',
  caducado: 'Caducó sin pagar',
  cancelado: 'Cancelado',
}
export const pedidoVivo = (p: MiPedido) => !['entregado', 'caducado', 'cancelado'].includes(p.estado)

interface Estado {
  fase: Fase
  resumen: ResumenLealtad | null
  error: string | null
  menu: ProductoVenta[] | null
  /** producto_id → lugar entre los más pedidos de su categoría. */
  destacados: Record<string, number>
  promos: Promo[]
  aliados: Aliado[] | null
  soyPersonal: SoyPersonal | null
  pedidosConfig: ConfigPedidosApp | null
  misPedidos: MiPedido[]
  sincronizar: () => Promise<void>
  cargarMenu: () => Promise<void>
  cargarAliados: () => Promise<void>
  cargarMisPedidos: () => Promise<void>
  extrasDe: (productoId: string) => Promise<ExtraProducto[]>
  salir: () => Promise<void>
  eliminarCuenta: () => Promise<string | null>
}

const Ctx = createContext<Estado | null>(null)

export function useEstado(): Estado {
  const e = useContext(Ctx)
  if (!e) throw new Error('useEstado fuera de <EstadoProvider>')
  return e
}

export function EstadoProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>('arrancando')
  const [resumen, setResumen] = useState<ResumenLealtad | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<ProductoVenta[] | null>(null)
  const [destacados, setDestacados] = useState<Record<string, number>>({})
  const [promos, setPromos] = useState<Promo[]>([])
  const [aliados, setAliados] = useState<Aliado[] | null>(null)
  const [soyPersonal, setSoyPersonal] = useState<SoyPersonal | null>(null)
  const [pedidosConfig, setPedidosConfig] = useState<ConfigPedidosApp | null>(null)
  const [misPedidos, setMisPedidos] = useState<MiPedido[]>([])
  const extrasCache = useRef<Map<string, ExtraProducto[]>>(new Map())

  const cargarMisPedidos = useCallback(async () => {
    if (!(await sesionActual(sb))) { setMisPedidos([]); return }
    try {
      setMisPedidos((await rpc<MiPedido[] | null>(sb, 'fn_mis_pedidos_app')) ?? [])
    } catch {
      /* los pedidos no son la tarjeta: si fallan, la tarjeta sigue */
    }
  }, [])

  /**
   * Trae la sesión y el expediente completo.
   *
   * Al volver de Google la sesión tarda un instante en asentarse, y esto
   * se dispara dos veces (al montar y al cambiar la sesión). Los primeros
   * tropiezos se reintentan en silencio: alarmar por algo ya resuelto es
   * peor que callar.
   */
  const sincronizar = useCallback(async (intento = 0): Promise<void> => {
    try {
      const sesion = await sesionActual(sb)
      if (!sesion) {
        setResumen(null)
        setSoyPersonal(null)
        setFase('sinSesion')
        return
      }
      if (!resumen) setFase('cargando')
      const user = await usuarioActual(sb)
      if (!user) return
      const nombre =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email ||
        'Cliente'
      // Da de alta la ficha si es la primera vez; el servidor toma el id y
      // el correo de la sesión, no de aquí.
      await vincularClienteAuth(sb, { nombre })
      setResumen(await miResumenLealtad(sb))
      setSoyPersonal(await rpc<SoyPersonal>(sb, 'fn_soy_personal').catch(() => null))
      setError(null)
      setFase('lista')
      void cargarMisPedidos()
      // Ya hay tarjeta en pantalla: si el permiso de avisos ya se dio, se
      // renueva la suscripción en silencio. Pedirlo es cosa de un botón.
      void registrarPush(sb).catch(() => {})
    } catch (e) {
      if (intento < 2) {
        await new Promise((r) => setTimeout(r, 700))
        return sincronizar(intento + 1)
      }
      if (!(await sesionActual(sb))) {
        setFase('sinSesion')
      } else {
        setError(amable(e))
        setFase(resumen ? 'lista' : 'sinSesion')
      }
    }
    // `resumen` solo decide si se enseña «cargando»; no hace falta que
    // cambie la función cada vez que llega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarMisPedidos])

  const cargarMenu = useCallback(async () => {
    try {
      const productos = await listarProductosParaVenta(sb)
      setMenu(productos)
    } catch {
      setMenu((m) => m ?? [])
    }
    try {
      const lista = await rpc<{ producto_id: string; lugar: number }[] | null>(sb, 'fn_menu_destacados')
      setDestacados(Object.fromEntries((lista ?? []).map((d) => [d.producto_id, d.lugar])))
    } catch { /* sin destacados no pasa nada */ }
    try {
      setPromos((await rpc<Promo[] | null>(sb, 'fn_promos_vigentes')) ?? [])
    } catch { /* idem */ }
    try {
      setPedidosConfig(await configPedidosApp(sb))
    } catch { /* apagado por omisión */ }
  }, [])

  const cargarAliados = useCallback(async () => {
    try {
      setAliados(await listarAliados(sb))
    } catch {
      setAliados((a) => a ?? [])
    }
  }, [])

  const extrasDe = useCallback(async (productoId: string): Promise<ExtraProducto[]> => {
    const cache = extrasCache.current.get(productoId)
    if (cache) return cache
    const { data } = await sb
      .from('vw_producto_extras')
      .select('extra_id,nombre,precio,grupo,marca,por_defecto')
      .eq('producto_id', productoId)
      .eq('activo', true)
      .order('grupo').order('nombre')
    const lista = ((data ?? []) as unknown as ExtraProducto[])
    extrasCache.current.set(productoId, lista)
    return lista
  }, [])

  const salir = useCallback(async () => {
    await quitarPush(sb).catch(() => {})
    await cerrarSesion(sb)
    setResumen(null)
    setSoyPersonal(null)
    setMisPedidos([])
    setFase('sinSesion')
  }, [])

  /** Borra la cuenta (como en iOS): el servidor anonimiza y borra el usuario. */
  const eliminarCuenta = useCallback(async (): Promise<string | null> => {
    const { data, error } = await sb.functions.invoke('cuenta-eliminar')
    if (error) return errorDeFuncion(error, 'No se pudo borrar la cuenta. Intenta otra vez.')
    if (data && data.ok === false) return data.error?.mensaje ?? 'No se pudo borrar la cuenta.'
    await cerrarSesion(sb).catch(() => {})
    setResumen(null)
    setSoyPersonal(null)
    setFase('sinSesion')
    return null
  }, [])

  useEffect(() => {
    if (vitrinaActiva) {
      // Capturas y pruebas sin cuenta (solo en `pnpm dev`): ver vitrina.ts.
      setResumen(resumenVitrina)
      setAliados(aliadosVitrina)
      setFase('lista')
      void cargarMenu()
      return
    }
    void sincronizar()
    void cargarMenu()
    void cargarAliados()
    const off = onCambioSesion(sb, () => void sincronizar())
    let soltar: (() => void) | null = null
    void escucharVueltaDeLogin(sb, () => void sincronizar()).then((f) => { soltar = f })
    return () => { off(); soltar?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const valor = useMemo<Estado>(() => ({
    fase, resumen, error, menu, destacados, promos, aliados, soyPersonal, pedidosConfig, misPedidos,
    sincronizar: () => sincronizar(), cargarMenu, cargarAliados, cargarMisPedidos, extrasDe, salir, eliminarCuenta,
  }), [fase, resumen, error, menu, destacados, promos, aliados, soyPersonal, pedidosConfig, misPedidos, sincronizar, cargarMenu, cargarAliados, cargarMisPedidos, extrasDe, salir, eliminarCuenta])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/** Igual que `nombreVisible` en iOS: «Scoop X» se lee como «X». */
export function nombreVisible(nombre: string): string {
  return nombre.replace(/^\s*scoop\s+/i, '').trim() || nombre
}

/** Entró al catálogo en los últimos 15 días. */
export function esNuevo(p: { created_at?: string | null }): boolean {
  if (!p.created_at) return false
  const t = Date.parse(p.created_at)
  return Number.isFinite(t) && Date.now() - t < 15 * 24 * 3600 * 1000
}

/** Cómo se lee una promo: «2 × $25», «-15%», «-$10», «Regalo». */
export function resumenPromo(p: Promo, mxn: (n: number | null | undefined) => string): string {
  switch (p.tipo) {
    case 'n_x_precio': return `${p.cantidad ?? 2} × ${mxn(p.valor)}`
    case 'descuento_pct': return `-${Math.round((p.valor ?? 0) * 100)}%`
    case 'descuento_monto': return `-${mxn(p.valor)}`
    case 'producto_gratis': return 'Regalo'
    default: return p.nombre
  }
}
