-- SEGUNDO AGUJERO CRITICO (31/08), peor que el de empleados.
--
-- `fn_staff_vincular_auth(empleado_id, auth_user_id)` hace un update pelado
-- de `empleados.auth_user_id`, es SECURITY DEFINER, no comprueba nada, y
-- estaba concedida a `anon`. El camino completo:
--
--   1. Registrarse como cliente normal de Rewards (cualquiera puede) y
--      quedarse con su auth uid.
--   2. Llamar a esta funcion apuntando ese uid a la fila del Gerente.
--   3. fn_rol_staff() devuelve 'gerente' para el intruso: Admin entero,
--      cortes, clientes, precios. Y de paso el gerente de verdad queda
--      desvinculado de su propia cuenta.
--
-- Sin PIN, sin sesion de personal, sin dejar rastro de quien fue.
--
-- Solo la llama la Edge Function `staff-login`, que corre con
-- SUPABASE_SERVICE_ROLE_KEY: revocarle anon y authenticated no la toca.
revoke all on function fn_staff_vincular_auth(uuid, uuid) from public, anon, authenticated;

-- Restaurar un respaldo pisa TODO el catalogo y el costeo de un golpe.
-- Nadie la llama desde el navegador (ni Admin ni Costeos): se usa desde la
-- consola cuando hace falta. No tiene por que estar abierta al publico.
revoke all on function fn_restaurar_costosshake(bigint) from public, anon, authenticated;
revoke all on function fn_respaldar_costosshake(text, text) from public, anon, authenticated;
