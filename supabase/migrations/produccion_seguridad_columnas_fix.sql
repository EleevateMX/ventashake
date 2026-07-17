-- =====================================================================
-- Producción — corrección de la migración anterior (columnas).
--
-- Se detectó, probando como el rol `anon`, que
-- `REVOKE SELECT (pin_hash) ON empleados FROM anon` y
-- `REVOKE UPDATE (pagado, total, metodo_pago) ON ordenes FROM anon` NO
-- bastan: en Postgres, un GRANT de tabla completa (el que ya existía por
-- defecto para anon/authenticated) sigue permitiendo todas las columnas
-- aunque se revoque el privilegio a nivel de columna — el revoke de
-- columna solo tiene efecto si el privilegio se otorgó a nivel de columna,
-- no si viene de un GRANT de tabla completa. Se detectó con una prueba en
-- vivo (rol `anon`, transacción con rollback) que `pin_hash` seguía siendo
-- legible y `ordenes.pagado` seguía siendo actualizable.
--
-- Corrección real: revocar el privilegio a NIVEL DE TABLA para esas
-- columnas sensibles y volver a otorgar el privilegio explícitamente solo
-- sobre las columnas seguras.
-- =====================================================================

-- ------------------------- empleados: solo columnas no sensibles --------
revoke select on empleados from anon, authenticated;
grant select (id, nombre, rol_id, sucursal_id, auth_user_id, activo, created_at)
  on empleados to anon, authenticated;

-- ------------------------- ordenes: solo `estado` es editable directo ---
-- (pagado/total/metodo_pago solo cambian dentro de fn_cobrar_orden, que
-- corre SECURITY DEFINER como dueño de la tabla y no está sujeta a estos
-- grants). cancelarOrden() sigue funcionando (solo actualiza `estado`).
revoke update on ordenes from anon, authenticated;
grant update (estado) on ordenes to anon, authenticated;
