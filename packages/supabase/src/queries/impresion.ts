import type { Impresora, TrabajoImpresion, Cocina, TipoConexionImpresora, AnchoPapel } from '@shake/types'
import type { ShakeClient } from '../client'

// El generador de tipos de Supabase no distingue "parámetro nullable" de
// "parámetro requerido" en los Args de RPC — para fn_crear_impresora/
// fn_actualizar_impresora (que sí aceptan null real en ip/cocina_id/
// nombre_dispositivo/puerto) se llama vía este cast, mismo patrón que
// empleados.ts/ordenes.ts/pagos.ts.
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/**
 * Impresora sin `agente_token` — esa columna ya no es legible ni escribible
 * directo por anon/authenticated (ver pagos_maquina_estados_p9 y
 * impresion_seguridad_tokens_agente: el token es el único secreto que
 * prueba la identidad de una impresora física ante
 * fn_imprimir_reclamar_trabajos/confirmar/fallar/latido, así que nunca debe
 * viajar salvo el instante de creación o rotación explícita).
 */
export type ImpresoraAdmin = Omit<Impresora, 'agente_token'> & { conectada: boolean }

export interface ImpresoraInsertDatos {
  sucursal_id: string
  nombre: string
  cocina_id: string | null
  tipo_conexion: TipoConexionImpresora
  ip: string | null
  puerto: number | null
  nombre_dispositivo: string | null
  ancho_papel: AnchoPapel
  copias: number
  corte_automatico: boolean
  buzzer: boolean
}
export type ImpresoraUpdateDatos = Omit<ImpresoraInsertDatos, 'sucursal_id'>

/** Impresoras configuradas (todas — Admin decide cuáles mostrar activas/inactivas). Nunca incluye el token. */
export async function listarImpresoras(sb: ShakeClient): Promise<ImpresoraAdmin[]> {
  return (await rpc<ImpresoraAdmin[] | null>(sb, 'fn_admin_impresoras', {})) ?? []
}

/** Crea la impresora y devuelve su token UNA vez — cópialo a printers.config.json del agente local. */
export async function crearImpresora(sb: ShakeClient, datos: ImpresoraInsertDatos): Promise<{ id: string; agente_token: string }> {
  const filas = await rpc<{ id: string; agente_token: string }[]>(sb, 'fn_crear_impresora', {
    p_sucursal_id: datos.sucursal_id,
    p_nombre: datos.nombre,
    p_cocina_id: datos.cocina_id,
    p_tipo_conexion: datos.tipo_conexion,
    p_ip: datos.ip,
    p_puerto: datos.puerto,
    p_nombre_dispositivo: datos.nombre_dispositivo,
    p_ancho_papel: datos.ancho_papel,
    p_copias: datos.copias,
    p_corte_automatico: datos.corte_automatico,
    p_buzzer: datos.buzzer,
  })
  return filas[0]
}

/** Sobrescribe TODOS los campos del formulario (nunca parcial — usa activarImpresora() para el toggle). */
export async function actualizarImpresora(
  sb: ShakeClient,
  id: string,
  cambios: ImpresoraUpdateDatos,
): Promise<void> {
  await rpc(sb, 'fn_actualizar_impresora', {
    p_id: id,
    p_nombre: cambios.nombre,
    p_cocina_id: cambios.cocina_id,
    p_tipo_conexion: cambios.tipo_conexion,
    p_ip: cambios.ip,
    p_puerto: cambios.puerto,
    p_nombre_dispositivo: cambios.nombre_dispositivo,
    p_ancho_papel: cambios.ancho_papel,
    p_copias: cambios.copias,
    p_corte_automatico: cambios.corte_automatico,
    p_buzzer: cambios.buzzer,
  })
}

/** Activa/desactiva una impresora sin tocar el resto de su configuración. */
export async function activarImpresora(sb: ShakeClient, id: string, activa: boolean): Promise<void> {
  await rpc(sb, 'fn_activar_impresora', { p_id: id, p_activa: activa })
}

/** Rota el token de una impresora (sospecha de compromiso, o se perdió printers.config.json). Devuelve el nuevo token UNA vez. */
export async function rotarTokenImpresora(sb: ShakeClient, id: string): Promise<string> {
  return rpc<string>(sb, 'fn_rotar_token_impresora', { p_id: id })
}

/**
 * Calibra el sensor de separación de una etiquetadora — lo que hay que
 * hacer después de cambiar el rollo.
 *
 * Encola un trabajo normal, así que lo recoge el agente de esa impresora
 * y queda registrado como cualquier comanda: si falla, se ve en Admin.
 * Pide sesión de personal; el token del agente no viaja.
 */
export async function calibrarImpresora(sb: ShakeClient, impresoraId: string): Promise<void> {
  await rpc(sb, 'fn_imprimir_calibrar', { p_impresora_id: impresoraId })
}

/**
 * Saca UNA etiqueta de prueba, sin calibrar.
 *
 * Es la forma de contestar "¿por qué se gastan tres etiquetas?" sin estar
 * en la tienda. Calibrar gasta dos o tres **por diseño** (el sensor tiene
 * que ver huecos reales para medirlos); una impresora mal calibrada las
 * escupe en **cada** comanda. Con este botón se distinguen: si sale una
 * sola, lo normal está bien.
 */
export async function probarImpresora(sb: ShakeClient, impresoraId: string): Promise<void> {
  await rpc(sb, 'fn_imprimir_prueba_staff', { p_impresora_id: impresoraId })
}

/**
 * Manda la MISMA etiqueta con tres cabeceras de papel distintas, rotuladas
 * A, B y C.
 *
 * Es para cuando se van etiquetas en blanco en **cada** comanda (no solo al
 * calibrar). La sospecha es la cabecera que declara el papel, que viaja
 * delante de cada etiqueta: varias etiquetadoras TSPL reacomodan el rollo al
 * recibirla. Quitarla a ciegas con la tienda vendiendo sería apostar; esto
 * deja que el papel conteste cuál sale sola y derecha.
 *
 * Gasta unas seis etiquetas, una vez. Pide agente 1.3.0.
 */
export async function diagnosticarImpresora(sb: ShakeClient, impresoraId: string): Promise<void> {
  await rpc(sb, 'fn_imprimir_diagnostico_staff', { p_impresora_id: impresoraId })
}

/** Estaciones disponibles para asignar impresora (mismo catálogo que Cocina/Barra). */
export async function listarCocinasParaImpresoras(sb: ShakeClient): Promise<Cocina[]> {
  const { data, error } = await sb.from('cocinas').select('*').order('nombre')
  if (error) throw error
  return data
}

/** Trabajos de impresión de UN pedido de cocina (para el indicador en KDS). */
export async function trabajosDePedido(sb: ShakeClient, pedidoId: string): Promise<TrabajoImpresion[]> {
  const { data, error } = await sb
    .from('trabajos_impresion')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at')
  if (error) throw error
  return data
}

/**
 * Trabajos de impresión de varios pedidos a la vez (para pintar el
 * indicador de estado en toda la grilla del KDS sin hacer N consultas).
 */
export async function trabajosDeVariosPedidos(
  sb: ShakeClient,
  pedidoIds: string[],
): Promise<Record<string, TrabajoImpresion>> {
  if (pedidoIds.length === 0) return {}
  const { data, error } = await sb
    .from('trabajos_impresion')
    .select('*')
    .in('pedido_id', pedidoIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  // El primero por pedido (created_at desc) es el más reciente — refleja
  // reimpresiones si las hubo.
  const porPedido: Record<string, TrabajoImpresion> = {}
  for (const t of data) {
    if (t.pedido_id && !porPedido[t.pedido_id]) porPedido[t.pedido_id] = t
  }
  return porPedido
}

export interface FiltroTrabajosImpresion {
  estado?: TrabajoImpresion['estado'][]
  printerId?: string
  limite?: number
}

/** Cola de impresión completa (Admin), con filtros opcionales. */
export async function listarTrabajosImpresion(
  sb: ShakeClient,
  filtro: FiltroTrabajosImpresion = {},
): Promise<TrabajoImpresion[]> {
  let query = sb.from('trabajos_impresion').select('*').order('created_at', { ascending: false })
  if (filtro.estado && filtro.estado.length > 0) query = query.in('estado', filtro.estado)
  if (filtro.printerId) query = query.eq('printer_id', filtro.printerId)
  query = query.limit(filtro.limite ?? 100)
  const { data, error } = await query
  if (error) throw error
  return data
}

/** Reimprime un trabajo (crea una copia auditada, no reencola el original). */
export async function reimprimirTrabajo(
  sb: ShakeClient,
  trabajoId: string,
  opts: { empleadoId?: string; motivo?: string; printerId?: string } = {},
): Promise<TrabajoImpresion> {
  const { data, error } = await sb.rpc('fn_imprimir_reimprimir', {
    p_trabajo_id: trabajoId,
    p_empleado_id: opts.empleadoId,
    p_motivo: opts.motivo,
    p_printer_id: opts.printerId,
  })
  if (error) throw error
  return data
}

/** Suscripción realtime a la cola de impresión (para Admin/KDS). Devuelve el "desuscribirse". */
export function suscribirTrabajosImpresion(sb: ShakeClient, onCambio: () => void): () => void {
  // Misma resiliencia que suscribirPedidosCocina: si el canal muere en
  // silencio, se vuelve a suscribir solo en vez de dejar el indicador de
  // impresión congelado.
  let canal: ReturnType<ShakeClient['channel']> | null = null
  let apagado = false
  let reintento: ReturnType<typeof setTimeout> | null = null

  const conectar = () => {
    if (apagado) return
    canal = sb
      .channel('trabajos-impresion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos_impresion' }, onCambio)
      .subscribe((estado) => {
        if (apagado) return
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          if (canal) void sb.removeChannel(canal)
          canal = null
          if (reintento) clearTimeout(reintento)
          reintento = setTimeout(conectar, 5000)
        }
      })
  }
  conectar()

  return () => {
    apagado = true
    if (reintento) clearTimeout(reintento)
    if (canal) void sb.removeChannel(canal)
  }
}

/**
 * Los trabajos de impresion de UNA orden, para poder reimprimir su comanda
 * desde el folio.
 *
 * Existe porque la cola de Admin -> Impresoras esta ordenada por hora y
 * llena de trabajos de todas las ordenes: encontrar el del folio 5184 ahi
 * es buscar una aguja. Y el momento en que alguien necesita reimprimir es
 * justo cuando esta mirando ese ticket.
 *
 * Se piden TODOS, no solo los que fallaron: la razon mas comun para
 * reimprimir no es que haya fallado -es que la etiqueta se mojo, se cayo
 * o se pego en el vaso equivocado-.
 */
export async function trabajosDeOrden(
  sb: ShakeClient,
  ordenId: string,
): Promise<TrabajoImpresion[]> {
  const { data, error } = await sb
    .from('trabajos_impresion')
    .select('*')
    .eq('orden_id', ordenId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Frases del pie de la etiqueta, por temporada (09/10/26). Solo gerencia.

export interface TemporadaEtiqueta {
  id: string
  nombre: string
  /** MM-DD. Puede cruzar el año (12-01 → 01-06). */
  desde: string
  hasta: string
  activa: boolean
  con_milo: boolean
  /** Hoy (Mérida) cae dentro de sus fechas. */
  cubre_hoy: boolean
}

export interface FraseEtiqueta {
  id: string
  nombre: string
  texto: string
  /** null = de siempre (sale cuando no hay temporada activa). */
  temporada_id: string | null
  activa: boolean
  con_milo: boolean
  orden: number
}

export interface FrasesAdmin {
  hoy: string
  temporadas: TemporadaEtiqueta[]
  frases: FraseEtiqueta[]
  agentes: { nombre: string; version: string | null }[]
}

export async function frasesAdmin(sb: ShakeClient): Promise<FrasesAdmin> {
  return (await rpc<FrasesAdmin>(sb, 'fn_frases_admin', {})) ?? { hoy: '', temporadas: [], frases: [], agentes: [] }
}

export async function guardarFrase(
  sb: ShakeClient,
  f: { id?: string | null; nombre: string; texto: string; temporada_id: string | null; activa: boolean; con_milo: boolean; archivar?: boolean },
): Promise<string> {
  return rpc<string>(sb, 'fn_frase_guardar', {
    p_id: f.id ?? null, p_nombre: f.nombre, p_texto: f.texto, p_temporada_id: f.temporada_id,
    p_activa: f.activa, p_con_milo: f.con_milo, p_archivar: f.archivar ?? false,
  })
}

export async function guardarTemporada(
  sb: ShakeClient,
  t: { id?: string | null; nombre: string; desde: string; hasta: string; activa: boolean; con_milo: boolean },
): Promise<string> {
  return rpc<string>(sb, 'fn_temporada_guardar', {
    p_id: t.id ?? null, p_nombre: t.nombre, p_desde: t.desde, p_hasta: t.hasta,
    p_activa: t.activa, p_con_milo: t.con_milo,
  })
}

/** Una etiqueta de prueba con esa frase (y Milo), para verla en papel. Gasta 1. */
export async function probarFrase(sb: ShakeClient, impresoraId: string, texto: string, milo: boolean): Promise<void> {
  await rpc(sb, 'fn_frase_probar', { p_impresora_id: impresoraId, p_texto: texto, p_milo: milo })
}

// ---- Dinámicas con premios en la etiqueta («Trick or Shake», 10/10/26) ----

export interface ResultadoDinamica {
  id?: string
  nombre: string
  /** Lo que se imprime: dos renglones de 14, como una frase. */
  texto: string
  /** Cuántos hay en cada ronda. */
  cantidad: number
  es_premio: boolean
  /** El premio mayor: el que puede quedar dentro de un rango de la ronda. */
  es_principal: boolean
  milo: boolean
  orden: number
}

export interface RondaDinamica {
  numero: number
  abierta_en: string
  cerrada_en: string | null
  total: number
  asignados: number
  por_resultado: { nombre: string; total: number; salieron: number }[] | null
}

export interface PremioDinamica {
  boleto_id: string
  folio: string
  resultado: string
  principal: boolean
  orden_folio: number | null
  cliente: string
  asignado_en: string
  entregado_en: string | null
  entregado_por: string | null
}

export interface DinamicaEtiqueta {
  id: string
  nombre: string
  activa: boolean
  desde: string | null
  hasta: string | null
  rondas_max: number
  tamano_ronda: number
  estacion: string
  principal_desde: number | null
  principal_hasta: number | null
  /** Qué no cuadra (la suma, el rango…). Null = lista para prender. */
  problema: string | null
  resultados: ResultadoDinamica[]
  rondas: RondaDinamica[]
  premios: PremioDinamica[]
}

export async function dinamicasAdmin(sb: ShakeClient): Promise<DinamicaEtiqueta[]> {
  return (await rpc<DinamicaEtiqueta[] | null>(sb, 'fn_dinamicas_admin', {})) ?? []
}

export interface GuardarDinamica {
  id?: string
  nombre: string
  desde: string | null
  hasta: string | null
  rondas_max: number
  tamano_ronda: number
  principal_desde: number | null
  principal_hasta: number | null
  resultados: ResultadoDinamica[]
}

export async function guardarDinamica(sb: ShakeClient, d: GuardarDinamica): Promise<string> {
  return rpc<string>(sb, 'fn_dinamica_guardar', { p: d })
}

/** Prender o apagar. Al prender sin rondas, la base abre la primera. */
export async function activarDinamica(sb: ShakeClient, id: string, activa: boolean): Promise<void> {
  await rpc(sb, 'fn_dinamica_activar', { p_id: id, p_activa: activa })
}

/** Abre la siguiente ronda (la anterior se cierra sola al agotarse). */
export async function abrirRondaDinamica(sb: ShakeClient, id: string): Promise<number> {
  return rpc<number>(sb, 'fn_dinamica_abrir_ronda', { p_id: id })
}

export async function entregarPremioDinamica(sb: ShakeClient, boletoId: string, entregado: boolean): Promise<void> {
  await rpc(sb, 'fn_dinamica_entregar', { p_boleto: boletoId, p_entregado: entregado })
}
