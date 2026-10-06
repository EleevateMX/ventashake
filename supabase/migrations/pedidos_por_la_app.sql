-- =============================================================================
-- Pedidos por la app: se paga primero (Clip, en la app) y se pasa a recoger
-- (06/10/26). PASO B; antes va pedidos_app_canal.sql.
--
-- Nace APAGADO (pedidos_app_config.activo = false) y así se queda hasta que
-- gerencia lo prenda en Admin → Rewards. Mientras, la app no enseña el botón.
--
-- Cómo encaja con lo que ya existe, sin tocar el camino del dinero:
--   - La orden la crea fn_crear_orden (la de siempre) con canal 'app', el
--     cliente ligado y «para llevar». Nace sin pagar, con expira_en a 20 min:
--     si no se paga, el barredor de siempre la vence (ahora también mira
--     canal 'app').
--   - El pago lo confirma la Edge Function clip-checkout-* con fn_cobrar_orden
--     (metodo 'clip'), después de PREGUNTARLE a Clip, nunca por el webhook
--     solo (la verdad se pregunta, no se escucha).
--   - Al quedar pagada, el trigger de siempre (fn_crear_pedidos_cocina) manda
--     la comanda a barra/cocina. Cocina no prepara nada que no entró a caja.
--   - La TV de folios y las pantallas de cocina la ven como cualquier orden.
--   - Push: «recibimos tu pedido» al pagar y «está listo» cuando todas sus
--     partes están listas. Solo se ENCOLA; manda push-cola.
-- =============================================================================

create table if not exists pedidos_app_config (
  id text primary key default 'default',
  activo boolean not null default false,
  whatsapp boolean not null default false,
  hora_inicio time not null default '07:00',
  hora_fin time not null default '20:30',
  minutos_preparacion int not null default 20 check (minutos_preparacion between 5 and 120),
  mensaje_cerrado text,
  actualizado_en timestamptz not null default now()
);
insert into pedidos_app_config (id) values ('default') on conflict (id) do nothing;
alter table pedidos_app_config enable row level security;
revoke all on pedidos_app_config from anon, authenticated, public;

create table if not exists pedidos_app_checkout (
  orden_id uuid primary key references ordenes(id),
  checkout_id text not null unique,
  url text not null,
  estado text not null default 'pendiente',
  respuesta jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table pedidos_app_checkout enable row level security;
revoke all on pedidos_app_checkout from anon, authenticated, public;

-- Lo que la app necesita saber antes de enseñar el botón. Pública: no hay
-- nada que proteger en «abrimos de 7 a 20:30».
create or replace function public.fn_pedidos_app_config()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'activo', c.activo,
    'whatsapp', c.whatsapp,
    'hora_inicio', to_char(c.hora_inicio, 'HH24:MI'),
    'hora_fin', to_char(c.hora_fin, 'HH24:MI'),
    'minutos_preparacion', c.minutos_preparacion,
    'mensaje_cerrado', c.mensaje_cerrado,
    'abierto_ahora', c.activo
      and (now() at time zone 'America/Merida')::time between c.hora_inicio and c.hora_fin
  )
  from pedidos_app_config c where c.id = 'default';
$$;
grant execute on function public.fn_pedidos_app_config() to anon, authenticated;

create or replace function public.fn_pedidos_app_config_guardar(p jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not fn_es_jefe() then raise exception 'Solo gerencia puede cambiar los pedidos por la app.'; end if;
  update pedidos_app_config set
    activo = coalesce((p->>'activo')::boolean, activo),
    whatsapp = coalesce((p->>'whatsapp')::boolean, whatsapp),
    hora_inicio = coalesce((p->>'hora_inicio')::time, hora_inicio),
    hora_fin = coalesce((p->>'hora_fin')::time, hora_fin),
    minutos_preparacion = coalesce((p->>'minutos_preparacion')::int, minutos_preparacion),
    mensaje_cerrado = case when p ? 'mensaje_cerrado' then nullif(btrim(p->>'mensaje_cerrado'), '') else mensaje_cerrado end,
    actualizado_en = now()
  where id = 'default';
  return fn_pedidos_app_config();
end;
$$;
revoke execute on function public.fn_pedidos_app_config_guardar(jsonb) from anon, public;
grant execute on function public.fn_pedidos_app_config_guardar(jsonb) to authenticated;

-- El cliente pide. Mismas líneas que el kiosko (producto_id, cantidad,
-- linea, padre_linea, personalizacion): el precio lo pone fn_crear_orden.
create or replace function public.fn_pedido_app_crear(p_items jsonb, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_cfg record; v_cli record; v_suc uuid; v_alm uuid; v_orden ordenes; v_ahora time;
begin
  select * into v_cfg from pedidos_app_config where id = 'default';
  if not coalesce(v_cfg.activo, false) then
    raise exception 'Los pedidos por la app están apagados por ahora. Pídelo en la barra.';
  end if;
  v_ahora := (now() at time zone 'America/Merida')::time;
  if v_ahora < v_cfg.hora_inicio or v_ahora > v_cfg.hora_fin then
    raise exception '%', coalesce(v_cfg.mensaje_cerrado,
      format('Recibimos pedidos de %s a %s.', to_char(v_cfg.hora_inicio, 'HH24:MI'), to_char(v_cfg.hora_fin, 'HH24:MI')));
  end if;

  select id, nombre into v_cli from clientes where auth_user_id = auth.uid() and activo limit 1;
  if v_cli.id is null then raise exception 'Entra a tu cuenta para pedir.'; end if;

  -- Un pedido vivo a la vez: si ya hay uno sin pagar, se usa ese.
  select * into v_orden from ordenes
   where cliente_id = v_cli.id and canal = 'app' and not pagado
     and estado_pago_orden = 'pending_payment' and expira_en > now()
   order by created_at desc limit 1;
  if v_orden.id is not null then
    raise exception 'Ya tienes un pedido esperando pago (#%). Págalo o espera a que caduque.', v_orden.folio;
  end if;

  -- La misma barra que cobró lo último: no hay otra.
  select sucursal_id, almacen_id into v_suc, v_alm from ordenes where pagado order by created_at desc limit 1;

  v_orden := fn_crear_orden(v_suc, v_alm, 'app', p_items, null, null, v_cli.id, 0, false, v_cli.nombre, true);

  update ordenes
     set expira_en = now() + interval '20 minutes',
         preparar_a = now() + make_interval(mins => v_cfg.minutos_preparacion)
   where id = v_orden.id
   returning * into v_orden;

  insert into ordenes_auditoria (orden_id, evento, detalle)
  values (v_orden.id, 'pedido_app', jsonb_build_object('nota', left(coalesce(p_nota, ''), 200), 'cliente_id', v_cli.id));

  return jsonb_build_object(
    'id', v_orden.id, 'folio', v_orden.folio, 'total', v_orden.total,
    'preparar_a', to_char(v_orden.preparar_a at time zone 'America/Merida', 'HH24:MI'),
    'expira_en', v_orden.expira_en
  );
end;
$$;
revoke execute on function public.fn_pedido_app_crear(jsonb, text) from anon, public;
grant execute on function public.fn_pedido_app_crear(jsonb, text) to authenticated;

-- El estado de un pedido, en una palabra, para la app y para el personal.
create or replace function public.fn_pedido_app_estado(p_orden ordenes)
returns text
language sql stable
as $$
  select case
    when p_orden.estado_pago_orden = 'expired' then 'caducado'
    when p_orden.estado_pago_orden = 'cancelled' then 'cancelado'
    when not p_orden.pagado then 'por_pagar'
    when not exists (select 1 from pedidos_cocina pc where pc.orden_id = p_orden.id) then 'recibido'
    when not exists (select 1 from pedidos_cocina pc where pc.orden_id = p_orden.id and pc.estado <> 'entregado') then 'entregado'
    when not exists (select 1 from pedidos_cocina pc where pc.orden_id = p_orden.id and pc.estado not in ('listo', 'entregado')) then 'listo'
    else 'preparando'
  end;
$$;

create or replace function public.fn_pedido_app_json(p_orden ordenes)
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'id', p_orden.id, 'folio', p_orden.folio, 'total', p_orden.total, 'pagado', p_orden.pagado,
    'estado', fn_pedido_app_estado(p_orden),
    'nombre', p_orden.nombre_cliente,
    'hora', to_char(p_orden.created_at at time zone 'America/Merida', 'HH24:MI'),
    'preparar_a', to_char(p_orden.preparar_a at time zone 'America/Merida', 'HH24:MI'),
    'expira_en', p_orden.expira_en,
    'nota', (select a.detalle->>'nota' from ordenes_auditoria a where a.orden_id = p_orden.id and a.evento = 'pedido_app' order by a.created_at desc limit 1),
    'items', (select string_agg(oi.cantidad || ' × ' || pr.nombre, ', ' order by oi.id)
                from orden_items oi join productos pr on pr.id = oi.producto_id
               where oi.orden_id = p_orden.id and oi.padre_item_id is null)
  );
$$;

-- Mis pedidos de hoy y ayer (para la tarjeta del cliente).
create or replace function public.fn_mis_pedidos_app()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_agg(fn_pedido_app_json(o) order by o.created_at desc), '[]'::jsonb)
    from ordenes o
   where o.canal = 'app'
     and o.cliente_id = (select id from clientes where auth_user_id = auth.uid() limit 1)
     and o.created_at >= now() - interval '36 hours';
$$;
revoke execute on function public.fn_mis_pedidos_app() from anon, public;
grant execute on function public.fn_mis_pedidos_app() to authenticated;

-- Lo de hoy para el personal (app en modo personal y Admin → En vivo).
create or replace function public.fn_pedidos_app_en_vivo()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select case when fn_es_staff() then coalesce(jsonb_agg(
           fn_pedido_app_json(o) || jsonb_build_object('telefono', c.telefono)
           order by o.created_at desc), '[]'::jsonb)
         else null end
    from ordenes o left join clientes c on c.id = o.cliente_id
   where o.canal = 'app'
     and o.created_at >= (now() at time zone 'America/Merida')::date::timestamp at time zone 'America/Merida';
$$;
revoke execute on function public.fn_pedidos_app_en_vivo() from anon, public;
grant execute on function public.fn_pedidos_app_en_vivo() to authenticated;

-- El personal lo marca entregado cuando el cliente ya lo tiene en la mano.
create or replace function public.fn_pedido_app_entregado(p_orden_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not fn_es_staff() then raise exception 'Solo el personal puede marcar entregado.'; end if;
  update pedidos_cocina set estado = 'entregado'
   where orden_id = p_orden_id and estado = 'listo';
end;
$$;
revoke execute on function public.fn_pedido_app_entregado(uuid) from anon, public;
grant execute on function public.fn_pedido_app_entregado(uuid) to authenticated;

-- El barredor de siempre también vence los pedidos de la app que no se
-- pagaron (traen expira_en, como el autoservicio). Mismo cuerpo, una
-- condición más.
create or replace function public.fn_expirar_ordenes_kiosko()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_orden record;
  v_n integer := 0;
begin
  -- 1) Autoservicio y app: la orden trae su propia caducidad.
  for v_orden in
    select id from ordenes
    where canal in ('kiosko', 'app')
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

  -- 2) Caja: no hay `expira_en`, asi que manda la edad. El tope por corrida
  --    evita que la primera pasada mueva cientos de renglones de golpe.
  for v_orden in
    select o.id from ordenes o
    where o.canal not in ('kiosko', 'app')
      and not o.pagado
      and not o.es_demo
      and o.estado_pago_orden in ('pending_payment', 'awaiting_counter_payment', 'payment_processing', 'payment_unknown')
      and o.created_at < now() - interval '6 hours'
      and not exists (select 1 from pagos p where p.orden_id = o.id and p.estado in ('aprobado', 'pendiente'))
    order by o.created_at
    limit 200
    for update skip locked
  loop
    update ordenes set estado_pago_orden = 'expired', updated_at = now() where id = v_orden.id;
    insert into ordenes_auditoria (orden_id, evento, detalle)
      values (v_orden.id, 'expirada', jsonb_build_object('motivo', 'caja_sin_cobrar_6h'));
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

-- Push «recibimos tu pedido» al quedar pagada. Solo encola; nunca tumba.
create or replace function public.fn_push_pedido_app_pagado()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid;
begin
  begin
    if new.canal = 'app' and new.pagado and not coalesce(old.pagado, false) and new.cliente_id is not null then
      select auth_user_id into v_uid from clientes where id = new.cliente_id;
      if v_uid is not null and exists (select 1 from push_dispositivos d where d.auth_user_id = v_uid and d.activo) then
        insert into push_cola (cliente_id, auth_user_id, titulo, cuerpo, datos)
        values (new.cliente_id, v_uid,
                'Pedido #' || new.folio || ' recibido',
                'Lo preparamos para las ' || to_char(new.preparar_a at time zone 'America/Merida', 'HH24:MI') || '. Pasa por él a la barra.',
                jsonb_build_object('tipo', 'pedido_recibido', 'orden_id', new.id));
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists trg_push_pedido_app_pagado on ordenes;
create trigger trg_push_pedido_app_pagado after update on ordenes
  for each row execute function public.fn_push_pedido_app_pagado();

-- Push «está listo» cuando TODAS las partes del pedido están listas.
create or replace function public.fn_push_pedido_app_listo()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_o ordenes; v_uid uuid;
begin
  begin
    if new.estado = 'listo' and coalesce(old.estado::text, '') <> 'listo' then
      select * into v_o from ordenes where id = new.orden_id;
      if v_o.canal = 'app' and v_o.cliente_id is not null
         and not exists (select 1 from pedidos_cocina pc where pc.orden_id = v_o.id and pc.estado not in ('listo', 'entregado'))
         and not exists (select 1 from push_cola q where q.datos->>'orden_id' = v_o.id::text and q.datos->>'tipo' = 'pedido_listo') then
        select auth_user_id into v_uid from clientes where id = v_o.cliente_id;
        if v_uid is not null and exists (select 1 from push_dispositivos d where d.auth_user_id = v_uid and d.activo) then
          insert into push_cola (cliente_id, auth_user_id, titulo, cuerpo, datos)
          values (v_o.cliente_id, v_uid,
                  'Tu pedido #' || v_o.folio || ' está listo',
                  'Te esperamos en la barra.',
                  jsonb_build_object('tipo', 'pedido_listo', 'orden_id', v_o.id));
        end if;
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists trg_push_pedido_app_listo on pedidos_cocina;
create trigger trg_push_pedido_app_listo after update on pedidos_cocina
  for each row execute function public.fn_push_pedido_app_listo();

revoke execute on function public.fn_push_pedido_app_pagado() from anon, authenticated, public;
revoke execute on function public.fn_push_pedido_app_listo() from anon, authenticated, public;
revoke execute on function public.fn_pedido_app_estado(ordenes) from anon, public;
revoke execute on function public.fn_pedido_app_json(ordenes) from anon, public;
