-- Tres funciones sin `search_path` fijo. Todas las demas del proyecto ya
-- lo traen; estas se quedaron atras.
--
-- Importa porque `fn_precio_linea` y `fn_clase_extra` corren DENTRO del
-- camino del cobro: sin search_path fijo, quien pueda crear un esquema por
-- delante puede hacer que resuelvan a otra tabla u otra funcion.
--
-- No cambia el comportamiento. Comprobado despues de aplicarlo, con una
-- venta creada y COBRADA de verdad dentro de una transaccion revertida:
--
--   efectivo -> $40.00, pagado=true
--   mixto    -> $60.00, pagado=true, metodo=mixto
--   las partes suman $60.00 y el total es $60.00 -> cuadra
alter function public.fn_precio_linea    set search_path to 'public';
alter function public.fn_tasa_mancuernas set search_path to 'public';
alter function public.fn_clase_extra     set search_path to 'public';
