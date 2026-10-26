/**
 * Version del agente, tal cual la reporta en cada latido. Se compara con
 * lo que Admin muestra para saber si la tienda ya corre el agente nuevo.
 * Subela cuando cambie algo que se note en el papel.
 *
 * 1.4.0 (08/10/26): imprime las comandas que manda el kiosko sin internet.
 * 1.5.0 (09/10/26): las frases del pie vienen de Admin (por temporada) y
 *   puede imprimir a Milo.
 * 1.6.0 (10/10/26): dinámicas con premios («Trick or Shake»): el resultado
 *   va en la primera etiqueta del pedido y su folio junto a la fecha.
 * 1.7.0 (26/10/26): un boleto por etiqueta cuando la dinámica lo pide
 *   («uno por cada bebida»), y las frases van por estación (solo barra,
 *   solo cocina o las dos); las de siempre se pueden apagar.
 */
export const VERSION_AGENTE = '1.7.0'
