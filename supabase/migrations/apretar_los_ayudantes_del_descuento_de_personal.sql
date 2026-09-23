-- Dos cosas que salieron en el escaneo previo a abrir.
--
-- 1. Los tres AYUDANTES del descuento de personal seguian alcanzables por
--    `authenticated`. Les habia quitado `anon` y PUBLIC, pero no ese —y
--    la regla de la casa es justo esa: **no basta con `authenticated`,
--    porque todo cliente de Rewards lo es**. `fn_personal_restante`
--    devuelve lo que alguien consumio y su tope; `fn_personal_puede`, si
--    esta en turno. No es dinero, pero es informacion de un compañero.
--
--    Quitarles el permiso no rompe nada: las funciones que los usan son
--    SECURITY DEFINER, o sea que por dentro corren como el dueño y los
--    pueden llamar igual. El permiso del rol solo hace falta para
--    llamarlos DESDE FUERA, que es justo lo que no queremos.
--    Comprobado despues de aplicarlo: cotizar y cobrar siguen dando 95
--    sobre un shake de 125.
revoke execute on function public.fn_personal_restante(uuid) from authenticated;
revoke execute on function public.fn_personal_puede(uuid) from authenticated;
revoke execute on function public.fn_personal_calcular(uuid, jsonb) from authenticated;

-- 2. Cuatro funciones nuevas quedaron con `search_path` sin fijar. Las dos
--    de trigger solo levantan una excepcion y las otras dos son
--    aritmetica, asi que hoy no son explotables — pero un `search_path`
--    suelto es de esas cosas que dejan de ser inofensivas el dia que
--    alguien le agrega una consulta adentro.
alter function public.fn_metros_entre(double precision, double precision, double precision, double precision)
  set search_path to 'public';
alter function public.fn_sin_acentos(text) set search_path to 'public';
alter function public.fn_cancelaciones_solo_se_agregan() set search_path to 'public';
alter function public.fn_personal_consumos_solo_se_agregan() set search_path to 'public';
