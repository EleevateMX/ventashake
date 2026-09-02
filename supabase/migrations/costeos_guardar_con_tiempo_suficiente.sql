-- Costeos guardaba a veces si y a veces no, y el mensaje ("Error al
-- guardar") no ayudaba a nadie.
--
-- La causa: Costeos habla como `anon`, y `anon` tiene
-- statement_timeout = 3s. El guardado completo -- que incluye
-- fn_sync_app_data, la que da de alta productos, insumos y recetas --
-- tarda 3.4 s medidos con el documento de hoy (36 kB). Se pasaba por 400
-- ms, asi que el resultado dependia de que tan cargada estuviera la base
-- en ese segundo: con la tienda vendiendo, fallaba.
--
-- No se le sube el limite al rol `anon` entero: eso le daria 8 s a TODAS
-- las llamadas publicas, incluidas las del kiosko, y ese limite es una
-- valvula de seguridad, no un estorbo. Se le da aire solo a esta funcion.
-- Comprobado que funciona: un SET de funcion manda sobre el ajuste del
-- rol aunque el statement ya haya arrancado.
--
-- 20 s es holgura de verdad, no el minimo justo: la sincronizacion crece
-- con el catalogo, y volver a quedar a 400 ms del limite es volver aqui.
alter function public.fn_costos_guardar(uuid, jsonb) set statement_timeout to '20s';

-- La lectura tambien corre como `anon` y trae el documento entero.
-- Hoy es rapida, pero crece con el mismo catalogo.
alter function public.fn_costos_leer(uuid) set statement_timeout to '20s';
