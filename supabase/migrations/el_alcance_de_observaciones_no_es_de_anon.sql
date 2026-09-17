-- `revoke all ... from public` NO quita el permiso de `anon`.
--
-- Supabase tiene privilegios POR OMISION sobre el esquema public que le
-- dan EXECUTE a anon y authenticated en cada funcion nueva, como un grant
-- explicito al rol. `revoke from public` solo toca el pseudo-rol PUBLIC,
-- asi que el de anon sobrevive intacto. En la migracion anterior yo
-- escribi el revoke, no volvi a mirar el `proacl`, y las dos funciones
-- quedaron abiertas a anon -- lo dijo el advisor, no yo.
--
-- Las dos son de Admin y solo las llama Admin, donde todos son personal
-- con sesion (`authenticated`). No hay ningun script ni instalador que
-- las use: nacieron hoy. Por eso se pueden cerrar sin romper nada, que es
-- justo lo que no se podia dar por hecho con `fn_admin_impresoras`.
--
-- `fn_observaciones_vigentes` SI se queda con anon: es la que lee el
-- kiosko, que cobra sin sesion.
revoke execute on function public.fn_observacion_alcance(uuid) from anon;
revoke execute on function public.fn_observacion_alcance_fijar(uuid, text, uuid, boolean) from anon;
