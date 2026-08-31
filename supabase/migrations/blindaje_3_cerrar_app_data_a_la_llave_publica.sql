-- BLINDAJE 3/3: el costeo se cierra de verdad.
--
-- Va aparte de la migracion 2 a proposito, y DESPUES de que el Costeos
-- nuevo este desplegado: mientras la app siguiera leyendo `app_data`
-- directo, revocar aqui la dejaba sin poder guardar. Primero la puerta
-- nueva, despues se tapia la vieja.
--
-- A partir de aqui `app_data` solo se toca por fn_costos_leer /
-- fn_costos_guardar (que piden token) y por el trigger de sincronizacion,
-- que es SECURITY DEFINER.

drop policy if exists sel_app_data on app_data;
drop policy if exists upd_app_data on app_data;
drop policy if exists ins_app_data on app_data;

revoke select, insert, update, delete on app_data from anon, authenticated;

-- Los respaldos del costeo son lo mismo con otro nombre.
revoke select, insert, update, delete on app_data_respaldos from anon, authenticated;
