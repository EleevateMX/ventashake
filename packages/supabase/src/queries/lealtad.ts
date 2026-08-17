import type { Cliente, Cupon } from '@shake/types'
import type { ShakeClient } from '../client'

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que ordenes.ts).
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

export interface ClienteConLealtad extends Cliente {
  cupones: Cupon[]
}

/**
 * Identifica al cliente en caja por teléfono o por código QR (SHK-XXXXXX).
 * Devuelve su saldo de mancuernas y cupones activos vigentes.
 */
export async function identificarCliente(
  sb: ShakeClient,
  telefonoOCodigo: string,
): Promise<ClienteConLealtad | null> {
  const q = telefonoOCodigo.trim()
  if (!q) return null
  const esCodigo = /^SHK-/i.test(q)
  const { data, error } = await sb
    .from('clientes')
    .select('*, cupones(*)')
    .eq(esCodigo ? 'codigo' : 'telefono', esCodigo ? q.toUpperCase() : q)
    .eq('activo', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const cli = data as ClienteConLealtad
  // solo cupones activos y vigentes
  const ahora = Date.now()
  cli.cupones = (cli.cupones ?? []).filter(
    (c) => c.estado === 'activo' && new Date(c.vence_en).getTime() >= ahora,
  )
  return cli
}

export interface RegistrarClienteInput {
  nombre: string
  telefono: string
  fecha_nacimiento?: string | null
  sabor_favorito?: string | null
}

/** Alta de cliente en el programa (el código QR se genera en la base). */
export async function registrarCliente(
  sb: ShakeClient,
  input: RegistrarClienteInput,
): Promise<Cliente> {
  return rpc<Cliente>(sb, 'fn_cliente_registrar', {
    p_nombre: input.nombre,
    p_telefono: input.telefono,
    p_fecha_nacimiento: input.fecha_nacimiento ?? null,
    p_sabor_favorito: input.sabor_favorito ?? null,
  })
}

/**
 * Vincula (o crea) el cliente del programa con el usuario de Supabase Auth.
 * Se llama tras el login con Google. Idempotente: entrar mil veces con la
 * misma cuenta devuelve siempre la misma ficha.
 *
 * La identidad NO viaja como parámetro: el servidor la toma de `auth.uid()` y
 * del correo verificado que trae el token de Google. Por eso basta con estar
 * logueado — y por eso nadie puede mandar el id de otro para quedarse con sus
 * mancuernas. Si el cliente ya estaba dado de alta en caja con ese mismo
 * correo, se reclama esa ficha en vez de crear una segunda.
 */
export async function vincularClienteAuth(
  sb: ShakeClient,
  input: { nombre?: string | null },
): Promise<ClienteConLealtad> {
  const cli = await rpc<Cliente>(sb, 'fn_vincular_cliente_auth', {
    p_nombre: input.nombre ?? null,
  })
  // La RPC devuelve la fila de `clientes`; los cupones se leen aparte (la
  // política de lectura ya los acota a los del propio usuario).
  const cupones = await cuponesActivos(sb, cli.id)
  return { ...cli, cupones }
}

/** Estado de lealtad del usuario logueado (por auth_user_id). */
export async function miLealtad(sb: ShakeClient, authUserId: string): Promise<ClienteConLealtad | null> {
  const { data, error } = await sb
    .from('clientes')
    .select('*, cupones(*)')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) throw error
  return data ? filtrarCupones(data as ClienteConLealtad) : null
}

function filtrarCupones(cli: ClienteConLealtad): ClienteConLealtad {
  const ahora = Date.now()
  cli.cupones = (cli.cupones ?? []).filter(
    (c) => c.estado === 'activo' && new Date(c.vence_en).getTime() >= ahora,
  )
  return cli
}

/** Cupones activos y vigentes de un cliente. */
export async function cuponesActivos(sb: ShakeClient, clienteId: string): Promise<Cupon[]> {
  const { data, error } = await sb
    .from('cupones')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('estado', 'activo')
    .gte('vence_en', new Date().toISOString())
    .order('vence_en')
  if (error) throw error
  return data
}

/** Busca un cupón por su código (escaneo QR en caja). */
export async function buscarCupon(sb: ShakeClient, codigo: string): Promise<Cupon | null> {
  const { data, error } = await sb
    .from('cupones')
    .select('*')
    .eq('codigo', codigo.trim().toUpperCase())
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Canjea un cupón: valida que esté activo y vigente, lo marca usado y lo
 * liga a la orden. Devuelve el cupón canjeado o lanza si no es válido.
 *
 * Todo ocurre dentro de un solo UPDATE condicional en el servidor, así que dos
 * cajas que intenten el mismo cupón a la vez no pueden canjearlo dos veces:
 * la segunda recibe "ya fue usado".
 */
export async function canjearCupon(
  sb: ShakeClient,
  cuponId: string,
  ordenId?: string,
): Promise<Cupon> {
  return rpc<Cupon>(sb, 'fn_canjear_cupon', {
    p_cupon_id: cuponId,
    p_orden_id: ordenId ?? null,
  })
}

// ── El expediente del cliente ──────────────────────────────────────────────
// Historial de compras y productos más pedidos del usuario logueado. Las
// RPCs parten de auth.uid(), así que cada quien ve solo lo suyo; aquí no
// viaja ningún identificador.

export interface FavoritoCliente {
  producto: string
  veces: number
  ultima_vez: string
}

export interface CompraItem {
  producto: string
  cantidad: number
  personalizacion: string | null
}

export interface CompraHistorial {
  folio: number
  fecha: string
  total: number
  mancuernas_ganadas: number
  items: CompraItem[] | null
}

/** Lo que siempre pide: sus productos por número de veces. */
export async function misFavoritos(sb: ShakeClient, limite = 5): Promise<FavoritoCliente[]> {
  return (await rpc<FavoritoCliente[]>(sb, 'fn_mis_favoritos', { p_limite: limite })) ?? []
}

/** Sus últimas compras con detalle, la más reciente primero. */
export async function miHistorial(sb: ShakeClient, limite = 20): Promise<CompraHistorial[]> {
  return (await rpc<CompraHistorial[]>(sb, 'fn_mi_historial', { p_limite: limite })) ?? []
}
