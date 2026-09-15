/**
 * Traduce cualquier cosa que llegue a un `catch` en un mensaje legible.
 *
 * Existe por un error real y caro: los errores de Supabase NO son
 * instancias de `Error` — postgrest-js devuelve un objeto plano
 * `{ code, message, details, hint }`. El patrón que estaba repetido en 27
 * archivos del monorepo —comprobar `instanceof Error` y si no, `String(e)`—
 * daba false contra ese objeto, y `String({...})` imprime literalmente
 * "[object Object]". En pantalla se veía un texto rojo sin información, y
 * el motivo verdadero —"no se pueden mezclar Alimentos y Bebidas en un
 * mismo combo"— nunca llegaba a quien podía corregirlo.
 *
 * `hint` es la parte accionable de un error de Postgres, así que se
 * conserva cuando viene.
 */

/**
 * De qué habla cada tabla, en palabras de gente.
 *
 * Solo están las que alguien puede tocar desde una pantalla: si una tabla
 * no está aquí, el mensaje cae en el genérico, que también se entiende.
 * No hace falta que esté completa — hace falta que no mienta.
 */
const COSA_DE_LA_TABLA: Record<string, string> = {
  categorias: 'una categoría',
  productos: 'un producto',
  insumos: 'un insumo',
  recetas: 'esa receta',
  combo_items: 'esa parte del combo',
  promociones: 'una promoción',
  empleados: 'un empleado',
  clientes: 'un cliente',
  almacenes: 'un almacén',
  impresoras: 'una impresora',
  inventario_stock: 'ese renglón de inventario',
  producto_extras: 'ese extra en ese producto',
  observaciones: 'esa observación',
  cocinas: 'una estación',
  app_users: 'un usuario',
  caja_cortes: 'un corte',
  ordenes: 'una orden',
  pagos: 'un pago',
}

/**
 * De `uq_categorias_nombre` saca `categorias`; de
 * `inventario_stock_almacen_id_insumo_id_key`, `inventario_stock`.
 *
 * Se busca el nombre de tabla MÁS LARGO que encaje, no el primero: si no,
 * `inventario_stock_...` empataría con una hipotética tabla `inventario`
 * y el mensaje hablaría de otra cosa.
 */
function tablaDelCandado(constraint: string): string | null {
  const limpio = constraint.replace(/^(uq_|ux_|idx_|unique_)/, '')
  let mejor: string | null = null
  for (const tabla of Object.keys(COSA_DE_LA_TABLA)) {
    if (limpio.startsWith(tabla) && (!mejor || tabla.length > mejor.length)) mejor = tabla
  }
  return mejor
}

/**
 * Los códigos de Postgres que de verdad le llegan a una persona.
 *
 * El caso que motivó esto: Perla quiso crear la categoría "Extras" —que ya
 * existía— y la pantalla le contestó *duplicate key value violates unique
 * constraint "uq_categorias_nombre"*. Eso no es un mensaje, es un volcado:
 * no dice qué pasó, no dice qué hacer, y quien lo lee asume que el sistema
 * se rompió. Peor todavía, manda a buscar el problema donde no está.
 *
 * `P0001` NO se traduce: son los `raise exception` nuestros, que ya vienen
 * escritos en español y para la persona correcta. Traducirlos sería tapar
 * el mensaje bueno con uno genérico.
 */
function traducirCodigo(codigo: string, mensaje: string): string | null {
  switch (codigo) {
    case '23505': {
      const m = /unique constraint "([^"]+)"/.exec(mensaje)
      const tabla = m ? tablaDelCandado(m[1]) : null
      return tabla
        ? `Ya existe ${COSA_DE_LA_TABLA[tabla]} con ese nombre. Búscala en la lista: quizá está más abajo, o apagada.`
        : 'Ya existe algo igual. Revisa la lista antes de crearlo otra vez.'
    }
    case '23503':
      return 'No se puede borrar porque algo más lo está usando. Quita primero lo que depende de esto.'
    case '23502':
      return 'Falta llenar un campo obligatorio.'
    case '23514':
      return 'Ese valor no es válido aquí.'
    case '22P02':
      return 'Uno de los datos tiene un formato que no se entiende.'
    case '42501':
      return 'Tu cuenta no tiene permiso para hacer esto.'
    case '57014':
      return 'Tardó demasiado y se canceló. Vuelve a intentarlo.'
    case 'PGRST301':
      return 'Tu sesión caducó. Vuelve a entrar.'
    default:
      return null
  }
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message

  if (e && typeof e === 'object') {
    const o = e as { code?: unknown; message?: unknown; hint?: unknown; details?: unknown }

    // Primero el código: un mensaje escrito para una persona le gana
    // siempre al volcado de Postgres, que está escrito para un motor.
    if (typeof o.code === 'string' && typeof o.message === 'string') {
      const claro = traducirCodigo(o.code, o.message)
      if (claro) return claro
    }

    const partes: string[] = []
    if (typeof o.message === 'string' && o.message.trim()) partes.push(o.message.trim())
    if (typeof o.hint === 'string' && o.hint.trim()) partes.push(o.hint.trim())
    // `details` solo si no hay nada mejor: suele ser ruido técnico.
    if (partes.length === 0 && typeof o.details === 'string' && o.details.trim()) {
      partes.push(o.details.trim())
    }
    if (partes.length > 0) return partes.join(' — ')
  }

  const texto = String(e)
  // Último recurso: nunca devolver el "[object Object]" que motivó esto.
  return texto === '[object Object]' ? 'Ocurrió un error inesperado.' : texto
}
