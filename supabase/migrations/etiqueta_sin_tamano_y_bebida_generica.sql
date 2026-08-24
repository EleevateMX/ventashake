-- Ajustes de etiqueta pedidos por el local (24/08/26):
-- 1) El tamaño del vaso ya NO se imprime — vive solo en pantalla (cambio
--    en agente-impresion/src/tspl.ts; el dato sigue viajando en el payload).
-- 2) Todas las bebidas con etiqueta llevan su tipo, EXCEPTO Shakes (esos
--    se identifican por su nombre: "#1 Chocokiller", nunca "Shake #1...").
--    La única familia que faltaba era la de reventa:
update categorias set nombre_singular = 'Bebida'
where nombre = 'Bebidas' and nombre_singular is null;
