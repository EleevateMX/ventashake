/**
 * Traer una lista COMPLETA, aunque pase de mil renglones.
 *
 * PostgREST corta en **1000 filas** por omisión y no avisa: devuelve 200,
 * sin error, con la lista mocha. Una consulta que ayer traía todo hoy
 * trae el 94% y se ve exactamente igual.
 *
 * Cómo nos costó (20/09/26): `vw_producto_extras` llegó a **1067**
 * vínculos activos y el kiosko empezó a pedirlos ordenados por nombre.
 * Los 67 del final dejaron de existir para las pantallas — y entre ellos
 * estaba **«Proteína OPTIMUM - Vainilla», la de casa, la de $0**, en los
 * 7 shakes que la ofrecen. Al no estar en la lista, el kiosko caía a la
 * siguiente marca y salía **BIRDMAN FALCON a +$10** marcada por omisión:
 * un shake de $125 se capturaba en $135 y la comanda mandaba a barra una
 * proteína más cara que la de la receta. También se cayeron «Sin leche»,
 * los cuatro tés de los combos, «Topping extra» y «Yogurt Griego».
 *
 * Nadie lo reportó como "falta un renglón": se reportó como *«Optimum
 * desapareció del menú»*, que suena a catálogo y no lo era. Por eso esto
 * vive aquí y no dentro de una consulta: **el corte no avisa, así que la
 * defensa tiene que ser de oficio.**
 *
 * Dos reglas al usarlo:
 *
 *  1. **El orden tiene que ser único.** Paginar sobre un orden con
 *     empates (`order('nombre')` a secas, con 18 filas que se llaman
 *     «Topping extra») puede repetir o saltarse renglones entre página y
 *     página. Siempre hay que rematar con una columna que desempate.
 *  2. **Se para cuando una página viene incompleta**, no cuando viene
 *     vacía: así la última página no cuesta una consulta de más.
 */

/** Lo que devuelve un builder de supabase-js al ejecutarse. */
type Respuesta<T> = { data: T[] | null; error: unknown }

/** El tamaño de página de PostgREST. Pedir más no sirve: lo recorta igual. */
const PAGINA = 1000

/**
 * Freno de seguridad. Un error de paginación —un orden que no desempata,
 * una vista que crece sola— haría un bucle infinito contra la base con
 * la tienda abierta. Mejor devolver de más y que se note.
 */
const TECHO = 100_000

export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>,
): Promise<T[]> {
  const todo: T[] = []
  for (let desde = 0; desde < TECHO; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) throw error
    const lote = data ?? []
    todo.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todo
}
