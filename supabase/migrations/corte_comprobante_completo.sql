-- El comprobante del corte, completo (01/11/26, pedido de gerencia).
--
-- Perla: «la tira de corte únicamente refleja las ventas en efectivo».
-- El comprobante del navegador (kiosko, POS, Admin y el correo) solo decía
-- «Ventas en efectivo»; la tira del agente de caja traía Clip y tarjeta pero
-- nada de cancelaciones, cortesías ni descuentos.
--
-- `_corte_detalle(corte)` arma el detalle del turno UNA vez y lo leen los
-- tres: `fn_corte_comprobante` (Admin, la tira del navegador, el correo),
-- `fn_encolar_corte_caja` y `fn_corte_imprimir_caja` (la tira del agente).
-- Así Admin y el papel no pueden decir cosas distintas.
--
-- Qué cuenta cada cosa, con la base que hay:
--   * Ventas por método: los pagos aprobados del turno, igual que
--     `vw_corte_resumen` (de donde salen el total y el efectivo esperado).
--     Cortesía va en su propia sección, no como método.
--   * Cancelaciones: `ventas_canceladas` de ventas de ESTE turno.
--     Sin cobrar = se anuló antes de pagar. Ya cobradas = había entrado el
--     dinero: es la devolución (el sistema no tiene otra operación de
--     devolución). La aritmética del cajón NO cambia: el corte 189 cuadró
--     con el folio 12202 cancelado adentro, y Admin calcula igual.
--   * Cortesías: `cortesias` de órdenes del turno: tickets, piezas y valor.
--   * Descuentos: órdenes cobradas con descuento, sin las cortesías (que
--     son descuento del 100 %). Por tipo: cupón, precio de personal,
--     promoción, y lo demás (canjes de Rewards).
--
-- SECURITY INVOKER a propósito: corre con los permisos de quien la llama.
-- Las tres que la llaman son SECURITY DEFINER; una función nueva nace
-- ejecutable por anon, y así no le abre nada que no pudiera leer ya.

create or replace function public._corte_detalle(p_corte_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with o as (
    select id, total, descuento, pagado
      from ordenes
     where corte_id = p_corte_id and not coalesce(es_demo, false)
  ),
  pg as (
    select p.metodo::text as m, p.monto, p.orden_id
      from pagos p join o on o.id = p.orden_id
     where p.estado = 'aprobado'
  ),
  met as (
    select m, count(distinct orden_id) as n, sum(monto) as monto
      from pg where m <> 'cortesia' group by m
  ),
  vc as (
    select estaba_pagada, total_cancelado from ventas_canceladas where corte_id = p_corte_id
  ),
  co as (
    select c.orden_id, c.valor from cortesias c join o on o.id = c.orden_id
  ),
  de as (
    select o.id, o.descuento,
           case when exists (select 1 from cupones_aplicados x where x.orden_id = o.id) then 'cupon'
                when exists (select 1 from personal_consumos x where x.orden_id = o.id) then 'personal'
                when exists (select 1 from promocion_aplicaciones x where x.orden_id = o.id) then 'promocion'
                else 'otros' end as tipo
      from o
     where o.pagado and coalesce(o.descuento, 0) > 0
       and not exists (select 1 from co where co.orden_id = o.id)
  )
  select jsonb_build_object(
    'metodos', coalesce((select jsonb_object_agg(m, jsonb_build_object('n', n, 'monto', monto)) from met), '{}'::jsonb),
    'tickets_cobrados', (select count(distinct orden_id) from pg where m <> 'cortesia'),
    'total_cobrado', coalesce((select sum(monto) from pg), 0),
    'cancelaciones', jsonb_build_object(
      'sin_cobrar', jsonb_build_object(
        'n', (select count(*) from vc where not estaba_pagada),
        'monto', coalesce((select sum(total_cancelado) from vc where not estaba_pagada), 0)),
      'cobradas', jsonb_build_object(
        'n', (select count(*) from vc where estaba_pagada),
        'monto', coalesce((select sum(total_cancelado) from vc where estaba_pagada), 0))),
    'cortesias', jsonb_build_object(
      'tickets', (select count(*) from co),
      'productos', coalesce((select sum(oi.cantidad) from orden_items oi join co on co.orden_id = oi.orden_id
                              where oi.padre_item_id is null), 0),
      'valor', coalesce((select sum(valor) from co), 0)),
    'descuentos', jsonb_build_object(
      'n', (select count(*) from de),
      'monto', coalesce((select sum(descuento) from de), 0),
      'por_tipo', coalesce((select jsonb_object_agg(tipo, jsonb_build_object('n', n, 'monto', monto))
                              from (select tipo, count(*) n, sum(descuento) monto from de group by tipo) t), '{}'::jsonb))
  );
$function$;

-- Los tres que lo leen. Parches anclados: si el ancla no aparece
-- exactamente una vez, la migración truena en vez de corromper la función.
do $$
declare v text; a text;
begin
  -- 1) fn_corte_comprobante: Admin, la tira del navegador y el correo.
  select pg_get_functiondef('public.fn_corte_comprobante(uuid)'::regprocedure) into v;
  a := '''corte_siguiente_folio'', s.folio';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla fn_corte_comprobante'; end if;
  execute replace(v, a, a || ', ''detalle'', _corte_detalle(c.id)');

  -- 2) fn_encolar_corte_caja: la tira que sale sola al cerrar.
  select pg_get_functiondef('public.fn_encolar_corte_caja(uuid)'::regprocedure) into v;
  a := 'if v_payload is null then return; end if;';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla fn_encolar_corte_caja'; end if;
  execute replace(v, a, a || E'\n  v_payload := v_payload || jsonb_build_object(''detalle'', _corte_detalle(p_corte_id));');

  -- 3) fn_corte_imprimir_caja: la reimpresión recalcula el detalle (una
  --    cancelación hecha después del cierre ya sale en la copia).
  select pg_get_functiondef('public.fn_corte_imprimir_caja(uuid)'::regprocedure) into v;
  a := 'v_orig.payload || jsonb_build_object(''reimpresion'', true)';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla fn_corte_imprimir_caja'; end if;
  execute replace(v, a, 'v_orig.payload || jsonb_build_object(''reimpresion'', true, ''detalle'', _corte_detalle(p_corte_id))');
end $$;
