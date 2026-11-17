-- Los pedidos de la app se ven y se entregan desde la caja (17/11/26).
--
-- Perla probó pedir una barra Think! desde la app: entró pagada al historial
-- del kiosko y nadie se enteró. Lo de mostrador (barras, latas, snacks) no
-- va a pantalla ni imprime etiqueta, a propósito; pero entonces el pedido no
-- tenía ningún renglón en pedidos_cocina y fn_pedido_app_estado lo dejaba en
-- «recibido» para siempre: Admin → En vivo lo pintaba «Pagado · por
-- preparar» aunque el cliente ya se lo hubiera llevado, y el botón
-- «Entregado» de Admin solo movía renglones de cocina en «listo».
--
--   * pedidos_app_entregas: la entrega en mostrador es su propio renglón. NO
--     se crean comandas para lo de mostrador (eso imprimiría etiquetas).
--   * fn_pedido_app_estado: si hay entrega, es «entregado».
--   * _pedido_app_detalle: los renglones con sus extras y a dónde va cada
--     uno (barra, cocina o mostrador), y cómo va cada parte de cocina.
--   * fn_kiosko_pedidos_app / fn_kiosko_pedido_app_entregar: lo que usa el
--     kiosko. Abiertas a anon porque el kiosko en modo cajero corre como anon
--     (CLAUDE.md 2.2), igual que las pantallas de cocina, que entregan sin
--     PIN. No devuelven teléfono.
--   * fn_pedido_app_entregado (Admin y la pestaña Personal): ya entrega
--     también los de puro mostrador.
--
-- Entregar exige que las partes de barra/cocina estén listas: si no, el
-- pedido desaparecería de la pantalla de quien lo está preparando.

create table if not exists public.pedidos_app_entregas (
  orden_id uuid primary key references public.ordenes(id) on delete cascade,
  entregado_en timestamptz not null default now(),
  entregado_por uuid,
  origen text not null default 'kiosko'
);
alter table public.pedidos_app_entregas enable row level security;

create or replace function public.fn_pedido_app_estado(p_orden ordenes)
 returns text
 language sql
 stable
as $function$
  select case
    when p_orden.estado_pago_orden = 'expired' then 'caducado'
    when p_orden.estado_pago_orden = 'cancelled' then 'cancelado'
    when not p_orden.pagado then 'por_pagar'
    when exists (select 1 from pedidos_app_entregas e where e.orden_id = p_orden.id) then 'entregado'
    when not exists (select 1 from pedidos_cocina pc where pc.orden_id = p_orden.id) then 'recibido'
    when not exists (select 1 from pedidos_cocina pc where pc.orden_id = p_orden.id and pc.estado <> 'entregado') then 'entregado'
    when not exists (select 1 from pedidos_cocina pc where pc.orden_id = p_orden.id and pc.estado not in ('listo', 'entregado')) then 'listo'
    else 'preparando'
  end;
$function$;

-- Detalle para la caja y para Admin. SECURITY INVOKER: la llaman funciones
-- SECURITY DEFINER; sola no abre nada.
create or replace function public._pedido_app_detalle(p_orden_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'renglones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cantidad', oi.cantidad,
               'nombre', coalesce(pr.nombre, '(producto)'),
               'personalizacion', nullif(trim(coalesce(oi.personalizacion, '')), ''),
               'destino', case when coalesce(ca.va_a_pantalla, true) then coalesce(co.nombre, 'Barra') else 'Mostrador' end,
               'mostrador', not coalesce(ca.va_a_pantalla, true),
               'extras', (select coalesce(jsonb_agg(jsonb_build_object('cantidad', h.cantidad, 'nombre', coalesce(ph.nombre, '(extra)')) order by ph.nombre), '[]'::jsonb)
                            from orden_items h left join productos ph on ph.id = h.producto_id
                           where h.orden_id = p_orden_id and h.padre_item_id = oi.id))
             order by (not coalesce(ca.va_a_pantalla, true)), pr.nombre)
        from orden_items oi
        left join productos pr on pr.id = oi.producto_id
        left join categorias ca on ca.id = pr.categoria_id
        left join cocinas co on co.id = ca.cocina_id
       where oi.orden_id = p_orden_id and oi.padre_item_id is null), '[]'::jsonb),
    'partes', coalesce((
      select jsonb_agg(jsonb_build_object('estacion', coalesce(co.nombre, 'Cocina'), 'estado', pc.estado) order by co.nombre)
        from pedidos_cocina pc left join cocinas co on co.id = pc.cocina_id
       where pc.orden_id = p_orden_id), '[]'::jsonb),
    'puede_entregar', not exists (select 1 from pedidos_cocina pc where pc.orden_id = p_orden_id and pc.estado not in ('listo', 'entregado')),
    'entregado_en', (select e.entregado_en from pedidos_app_entregas e where e.orden_id = p_orden_id)
  );
$function$;

-- La lista del kiosko: lo pagado y sin entregar de las últimas 24 h, y lo
-- entregado hoy (para consultar). Sin teléfono.
create or replace function public.fn_kiosko_pedidos_app()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(
           fn_pedido_app_json(o) || _pedido_app_detalle(o.id)
           order by (fn_pedido_app_estado(o) = 'entregado'), coalesce(o.preparar_a, o.created_at)), '[]'::jsonb)
    from ordenes o
   where o.canal = 'app' and o.pagado and not o.es_demo
     and o.created_at > now() - interval '24 hours'
     and (fn_pedido_app_estado(o) not in ('entregado', 'cancelado', 'caducado')
          or o.created_at >= (now() at time zone 'America/Merida')::date::timestamp at time zone 'America/Merida');
$function$;
grant execute on function public.fn_kiosko_pedidos_app() to anon, authenticated;

-- Entregar desde el kiosko. Se contesta, no se lanza (como el cupón).
create or replace function public.fn_kiosko_pedido_app_entregar(p_orden_id uuid, p_empleado_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare o ordenes;
begin
  select * into o from ordenes where id = p_orden_id;
  if o.id is null or o.canal <> 'app' then
    return jsonb_build_object('ok', false, 'error', 'No es un pedido de la app.');
  end if;
  if not o.pagado then
    return jsonb_build_object('ok', false, 'error', 'Ese pedido no está pagado.');
  end if;
  if exists (select 1 from pedidos_cocina pc where pc.orden_id = o.id and pc.estado not in ('listo', 'entregado')) then
    return jsonb_build_object('ok', false, 'error', 'Barra o cocina todavía lo está preparando. Entrégalo cuando su pantalla diga LISTO.');
  end if;
  update pedidos_cocina set estado = 'entregado' where orden_id = o.id and estado = 'listo';
  insert into pedidos_app_entregas (orden_id, entregado_por, origen)
    values (o.id, (select e.id from empleados e where e.id = p_empleado_id), 'kiosko')
    on conflict (orden_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$function$;
grant execute on function public.fn_kiosko_pedido_app_entregar(uuid, uuid) to anon, authenticated;

-- Admin y la pestaña Personal: mismo criterio, con sesión de personal.
create or replace function public.fn_pedido_app_entregado(p_orden_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not fn_es_staff() then raise exception 'Solo el personal puede marcar entregado.'; end if;
  if exists (select 1 from pedidos_cocina pc where pc.orden_id = p_orden_id and pc.estado not in ('listo', 'entregado')) then
    raise exception 'Barra o cocina todavía lo está preparando.';
  end if;
  update pedidos_cocina set estado = 'entregado' where orden_id = p_orden_id and estado = 'listo';
  insert into pedidos_app_entregas (orden_id, entregado_por, origen)
    select o.id, (select e.id from empleados e where e.auth_user_id = auth.uid() limit 1), 'admin'
      from ordenes o where o.id = p_orden_id and o.canal = 'app' and o.pagado
    on conflict (orden_id) do nothing;
end;
$function$;

-- Admin → En vivo: el JSON lleva si se puede entregar y el detalle.
create or replace function public.fn_pedidos_app_en_vivo()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select case when fn_es_staff() then coalesce(jsonb_agg(
           fn_pedido_app_json(o) || _pedido_app_detalle(o.id) || jsonb_build_object('telefono', c.telefono)
           order by o.created_at desc), '[]'::jsonb)
         else null end
    from ordenes o left join clientes c on c.id = o.cliente_id
   where o.canal = 'app'
     and o.created_at >= (now() at time zone 'America/Merida')::date::timestamp at time zone 'America/Merida';
$function$;
