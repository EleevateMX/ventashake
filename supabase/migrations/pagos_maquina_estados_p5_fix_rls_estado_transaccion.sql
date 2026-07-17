-- =====================================================================
-- Corrección crítica detectada en pruebas de seguridad (rol `anon`) de
-- esta misma ronda: la policy `ins_pagos` (de la migración anterior,
-- produccion_seguridad_pagos_empleados.sql) solo validaba la columna
-- LEGADA `estado <> 'aprobado'`, pero no la columna NUEVA
-- `estado_transaccion`. Un INSERT directo por REST con
-- `estado='pendiente'` (pasa el check viejo) + `estado_transaccion='authorized'`
-- (sin check) colaba un pago que `fn_reconciliar_pagos()` tomaría como
-- legítimamente autorizado y completaría una venta gratis.
--
-- Se detectó en vivo, como rol `anon`, dentro de una transacción 100%
-- revertida — no en producción real.
-- =====================================================================

drop policy if exists ins_pagos on pagos;
create policy ins_pagos on pagos
  for insert
  with check (
    estado <> 'aprobado'
    and estado_transaccion not in ('authorized', 'refunded_partial', 'refunded_full')
  );
