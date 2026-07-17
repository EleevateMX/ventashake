-- =====================================================================
-- Máquina de estados de orden/pago/venta — Parte 4: expiración y
-- reconciliación.
--
-- fn_expirar_ordenes_kiosko(): limpieza LÓGICA (nunca borra filas) de
-- órdenes de kiosko que superaron `expira_en` sin completarse. Corre por
-- cron cada minuto.
--
-- fn_reconciliar_pagos(): detecta y corrige las 2 inconsistencias reales
-- que puede dejar una falla a medio camino (red caída entre "Clip
-- autorizó" y "se confirmó la venta", o un bug futuro que desalinee
-- `pagado` con `estado_pago_orden`). Idempotente — correrla N veces
-- produce el mismo resultado que correrla una vez. Usa
-- `app.transition_context = 'reconciliation'` (ver parte 2) para poder
-- reabrir una orden `expired` cuando en realidad sí se alcanzó a
-- autorizar el pago antes de expirar.
-- =====================================================================

create or replace function public.fn_expirar_ordenes_kiosko()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_orden record;
  v_n integer := 0;
begin
  for v_orden in
    select id from ordenes
    where canal = 'kiosko'
      and estado_pago_orden in ('pending_payment', 'awaiting_counter_payment', 'payment_processing', 'payment_unknown')
      and expira_en is not null
      and expira_en < now()
    for update skip locked
  loop
    update ordenes set estado_pago_orden = 'expired', updated_at = now() where id = v_orden.id;
    insert into ordenes_auditoria (orden_id, evento, detalle)
      values (v_orden.id, 'expirada', jsonb_build_object('motivo', 'vencio_expira_en'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

create or replace function public.fn_reconciliar_pagos()
returns table(orden_id uuid, accion text, detalle text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  rec record;
begin
  perform set_config('app.transition_context', 'reconciliation', true);

  -- Caso 1: el pago SÍ se autorizó pero la venta nunca se confirmó
  -- (ej. la respuesta de fn_cobrar_orden/webhook nunca llegó a
  -- completar fn_confirmar_venta). Se completa ahora — idempotente
  -- porque fn_confirmar_venta lo es.
  for rec in
    select p.id as pago_id, p.orden_id
    from pagos p
    join ordenes o on o.id = p.orden_id
    where p.estado_transaccion = 'authorized'
      and o.estado_pago_orden not in ('paid', 'refunded_partial', 'refunded_full')
      and not exists (select 1 from venta_confirmaciones vc where vc.orden_id = p.orden_id)
  loop
    perform fn_confirmar_venta(rec.orden_id, rec.pago_id);
    insert into ordenes_auditoria (orden_id, evento, detalle)
      values (rec.orden_id, 'reconciliada', jsonb_build_object('accion', 'venta_confirmada_tardia', 'pago_id', rec.pago_id));
    orden_id := rec.orden_id;
    accion := 'venta_confirmada';
    detalle := 'Pago autorizado sin venta confirmada — completada ahora';
    return next;
  end loop;

  -- Caso 2: `pagado=true` (cadena legada ya disparó) pero
  -- `estado_pago_orden` se quedó atrás por alguna razón — desalineación
  -- a corregir, nunca al revés (nunca se apaga `pagado` desde aquí).
  for rec in
    select o.id as orden_id
    from ordenes o
    where o.pagado = true
      and o.estado_pago_orden not in ('paid', 'refunded_partial', 'refunded_full')
  loop
    update ordenes set estado_pago_orden = 'paid', updated_at = now() where id = rec.orden_id;
    insert into ordenes_auditoria (orden_id, evento, detalle)
      values (rec.orden_id, 'reconciliada', jsonb_build_object('accion', 'estado_orden_corregido_a_paid'));
    orden_id := rec.orden_id;
    accion := 'estado_corregido';
    detalle := 'pagado=true pero estado_pago_orden desalineado — corregido a paid';
    return next;
  end loop;

  return;
end;
$function$;

grant execute on function public.fn_expirar_ordenes_kiosko() to anon, authenticated;
grant execute on function public.fn_reconciliar_pagos() to anon, authenticated;

do $$ begin
  perform cron.schedule('expirar-ordenes-kiosko', '* * * * *',
    $cron$select public.fn_expirar_ordenes_kiosko();$cron$);
exception when others then null; end $$;

do $$ begin
  perform cron.schedule('reconciliar-pagos', '* * * * *',
    $cron$select public.fn_reconciliar_pagos();$cron$);
exception when others then null; end $$;
