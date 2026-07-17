-- =====================================================================
-- Producción — cierre de huecos de seguridad críticos.
-- Corrige hallazgos C1 (pagos), C3 (pin_hash) de docs/auditoria-produccion.md.
--
-- Postura: el proyecto sigue operando con anon key + login PIN propio (sin
-- Supabase Auth todavía — eso es deuda documentada en el hallazgo A3, fuera
-- de alcance de esta migración). Dentro de esa postura, esta migración
-- cierra los 2 huecos con impacto financiero/de seguridad directo:
--
--   1. Nadie puede aprobar un pago (estado='aprobado') insertando o
--      actualizando la tabla `pagos` directamente por REST — solo la RPC
--      fn_cobrar_orden() (que valida el monto contra el total real de la
--      orden) puede hacerlo. Insertar un pago 'pendiente' directo se sigue
--      permitiendo (no dispara nada, es inofensivo, y deja abierta la
--      ruta para un futuro webhook Clip que primero cree 'pendiente').
--   2. Nadie puede crear una orden ni sus items insertando directo en
--      `ordenes`/`orden_items` — solo fn_crear_orden() (que recalcula el
--      total desde el catálogo). Sigue permitido actualizar `estado` de
--      una orden (cancelarOrden), pero no `pagado`/`total`/`metodo_pago`
--      directamente — esos solo cambian vía las RPCs (que corren como
--      SECURITY DEFINER y no están sujetas a estos revokes).
--   3. `empleados.pin_hash` deja de ser legible por la anon key. Todo el
--      código de la app ya lee empleados exclusivamente vía RPCs
--      (fn_login_cajero, fn_empleados_activos, fn_admin_empleados) que
--      nunca devuelven el hash — verificado, cero llamadas directas a
--      `.from('empleados')` en el repo.
--
-- Aditivo/reversible: son DROP POLICY + CREATE POLICY (misma tabla, no se
-- borra el hash existente) + REVOKE de privilegios de columna. No se
-- destruye ningún dato.
-- =====================================================================

-- ------------------------- pagos: solo RPC aprueba ---------------------
drop policy if exists ins_pagos on pagos;
create policy ins_pagos on pagos
  for insert
  with check (estado <> 'aprobado');

-- Ya no hay ninguna policy de UPDATE para pagos: RLS bloquea todo UPDATE
-- directo desde anon/authenticated. La transición a 'aprobado' ocurre
-- exclusivamente dentro de fn_cobrar_orden (SECURITY DEFINER, corre con
-- privilegios del dueño de la función, no sujeta a esta policy).
drop policy if exists upd_pagos on pagos;

-- ------------------------- ordenes: solo RPC crea/cobra -----------------
drop policy if exists ins_ordenes on ordenes;
drop policy if exists ins_orden_items on orden_items;

-- cancelarOrden() sigue pudiendo actualizar `estado` directo (columna no
-- revocada abajo); pagado/total/metodo_pago quedan bloqueados a nivel de
-- columna para anon/authenticated.
revoke update (pagado, total, metodo_pago) on ordenes from anon, authenticated;

-- ------------------------- empleados: pin_hash no sale nunca ------------
revoke select (pin_hash) on empleados from anon, authenticated;
