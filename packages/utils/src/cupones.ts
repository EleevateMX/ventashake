/**
 * Cupones de descuento (24/10/26): «$20 en un shake», «10 %», «15 %».
 *
 * El descuento lo calcula el SERVIDOR (`fn_cupon_descuento`, dentro de
 * `fn_cupon_aplicar`). Esta es su copia para la pantalla: el cajero tiene
 * que ver el total que se va a cobrar ANTES de tomar el dinero. Las dos
 * deben dar lo mismo — si las cambias, cambia las dos.
 */

export type TipoCupon = 'monto' | 'porcentaje'

/**
 * @param base lo que vale UNA unidad del shake: su precio más sus extras.
 * Un monto nunca pasa de lo que vale el shake; un porcentaje se redondea a
 * centavos.
 */
export function descuentoDeCupon(tipo: TipoCupon, valor: number, base: number): number {
  if (!(base > 0) || !(valor > 0)) return 0
  if (tipo === 'monto') return Math.min(valor, base)
  return Math.min(base, Math.round((base * valor) / 100 * 100) / 100)
}

/** Lo que vale una unidad de un renglón del carrito, con sus extras colgando. */
export function valorDeUnShake(
  renglon: { linea: string; precio: number; cantidad: number },
  todos: { precio: number; cantidad: number; padreLinea?: string | null }[],
): number {
  const extras = todos
    .filter((i) => i.padreLinea === renglon.linea)
    .reduce((s, i) => s + i.precio * i.cantidad, 0)
  return renglon.precio + extras / Math.max(renglon.cantidad, 1)
}
