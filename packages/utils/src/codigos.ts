/**
 * Códigos escaneados: el de Rewards (`SHK-AF8B0C`) y el del personal
 * (`SHKP-XXXXXXXX`), sin importar qué signo traiga el guion (16/10/26).
 *
 * Un lector de QR es un teclado: «teclea» el código con la distribución de
 * Estados Unidos, y la PC de la tienda está en español latinoamericano. Con
 * esa mezcla el guion llega como otro signo (`SHK'AF8B0C`, `SHK?AF8B0C`,
 * `SHK_AF8B0C`) o se pierde, y el kiosko dejaba de reconocerlo: lo tomaba
 * por un teléfono y ofrecía dar de alta a un cliente que ya existía.
 *
 * La regla: si empieza con SHKP o SHK, lo que haya entre el prefijo y el
 * resto —cualquier cosa que no sea letra o número, o nada— se vuelve un
 * guion, y todo va en mayúsculas. Vive aquí y no en cada pantalla porque
 * lo leen el kiosko, el POS y el precio de personal: dos copias de la misma
 * regla se separan solas.
 *
 * SHKP se revisa ANTES que SHK. Sin separador no hay ambigüedad: el código
 * de cliente es hexadecimal (0-9, A-F), así que nunca empieza con «P».
 */
const PATRON = /^(SHKP|SHK)[^0-9A-Z]*([0-9A-Z]+)$/

export function normalizarCodigoEscaneado(texto: string): string {
  const limpio = texto.trim()
  const m = PATRON.exec(limpio.toUpperCase())
  return m ? `${m[1]}-${m[2]}` : limpio
}

/** ¿Es (ya normalizado) un código de cliente de Rewards? */
export const esCodigoCliente = (t: string) => /^SHK-[0-9A-Z]+$/.test(normalizarCodigoEscaneado(t))

/** ¿Es (ya normalizado) un código de personal de la app? */
export const esCodigoPersonal = (t: string) => /^SHKP-[0-9A-Z]+$/.test(normalizarCodigoEscaneado(t))
