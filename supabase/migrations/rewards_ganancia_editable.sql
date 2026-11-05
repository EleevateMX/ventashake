-- Rewards: lo que se gana se edita desde Admin, y se elige qué no suma (05/11/26).
--
-- Hasta hoy «1 mancuerna por cada $14, tope 100 por ticket» vivía escrito
-- dentro de fn_acumular_mancuernas, y TODO producto sumaba (menos las
-- recargas). Gerencia pidió poder moverlo y poder sacar productos.
--
--   * rewards_ganancia (una fila): pesos por mancuerna, tope por ticket y un
--     interruptor. Nace con 14 / 100 / prendido: el día del despliegue no
--     cambia ningún número.
--   * rewards_no_acumulan: categorías o productos que NO suman. Vacía al
--     nacer (misma regla de respaldo que las observaciones: sin decisión,
--     todo como antes). Los extras colgados de un producto que no suma
--     tampoco suman.
--   * fn_acumular_mancuernas lee las dos. La base es
--       total − recargas − lo que no suma
--     (el descuento ya viene restado en el total). Y ahora va dentro de un
--     bloque que se traga cualquier error: vive en la cadena del cobro, y
--     que un cliente se quede sin sus puntos es mejor que una caja que no
--     cobra. El cupón cada 100 no cambió.
--   * fn_rewards_reglas: lo que el kiosko y la caja necesitan para PROMETER
--     lo mismo que abona el servidor (tasa, tope, interruptor y los ids de
--     producto que no suman). Pública: no es secreto cuánto se gana.
--   * Escribir es solo gerencia (fn_es_jefe), por funciones.

create table if not exists public.rewards_ganancia (
  id int primary key default 1 check (id = 1),
  pesos_por_mancuerna numeric(10,2) not null default 14 check (pesos_por_mancuerna >= 1 and pesos_por_mancuerna <= 10000),
  tope_por_orden int not null default 100 check (tope_por_orden >= 1 and tope_por_orden <= 100000),
  activo boolean not null default true,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);
insert into public.rewards_ganancia (id) values (1) on conflict (id) do nothing;
alter table public.rewards_ganancia enable row level security;

create table if not exists public.rewards_no_acumulan (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references public.categorias(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete cascade,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  check (num_nonnulls(categoria_id, producto_id) = 1)
);
create unique index if not exists rewards_no_acumulan_cat on public.rewards_no_acumulan (categoria_id) where categoria_id is not null;
create unique index if not exists rewards_no_acumulan_prod on public.rewards_no_acumulan (producto_id) where producto_id is not null;
alter table public.rewards_no_acumulan enable row level security;

-- Lo que suma al cobrar.
create or replace function public.fn_acumular_mancuernas()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  gana integer;
  saldo integer;
  activos integer;
  v_recargas numeric := 0;
  v_no_suma numeric := 0;
  v_base numeric;
  v_pesos numeric := 14;
  v_tope int := 100;
  v_activo boolean := true;
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and NEW.cliente_id is not null and not NEW.es_demo then
    begin
      select g.pesos_por_mancuerna, g.tope_por_orden, g.activo
        into v_pesos, v_tope, v_activo
        from rewards_ganancia g where g.id = 1;
      if not found then v_pesos := 14; v_tope := 100; v_activo := true; end if;
      if not v_activo then return NEW; end if;

      -- Las recargas no generan puntos: ya traen su bono incluido.
      select coalesce(sum(oi.precio_unitario * oi.cantidad), 0)
        into v_recargas
        from orden_items oi
        join paquetes_saldo ps on ps.producto_id = oi.producto_id
       where oi.orden_id = NEW.id;

      -- Lo que gerencia sacó (por producto o por categoría), y los extras
      -- colgados de algo que no suma.
      with it as (
        select oi.id, oi.padre_item_id, oi.precio_unitario * oi.cantidad as monto,
               exists (select 1 from rewards_no_acumulan r
                        where r.producto_id = p.id or r.categoria_id = p.categoria_id) as fuera
          from orden_items oi
          join productos p on p.id = oi.producto_id
         where oi.orden_id = NEW.id
           and not exists (select 1 from paquetes_saldo ps where ps.producto_id = oi.producto_id)
      )
      select coalesce(sum(i.monto), 0) into v_no_suma
        from it i
       where i.fuera or exists (select 1 from it pa where pa.id = i.padre_item_id and pa.fuera);

      v_base := greatest(0, NEW.total - v_recargas - v_no_suma);

      gana := least(v_tope, floor(v_base / v_pesos)::int);
      if gana > 0 then
        update clientes set mancuernas = mancuernas + gana where id = NEW.cliente_id returning mancuernas into saldo;
        insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
          values (NEW.cliente_id, gana, 'ganadas', NEW.id, 'Compra folio ' || NEW.folio);
        loop
          select count(*) into activos from cupones where cliente_id = NEW.cliente_id and estado='activo' and tipo<>'cumpleanos';
          exit when saldo < 100 or activos >= 5;
          insert into cupones (cliente_id, tipo, vence_en) values (NEW.cliente_id, 'mancuernas', now() + interval '1 year');
          update clientes set mancuernas = mancuernas - 100 where id = NEW.cliente_id returning mancuernas into saldo;
          insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
            values (NEW.cliente_id, -100, 'canje', NEW.id, 'Cupón generado por 100 mancuernas');
        end loop;
      end if;
    exception when others then
      raise warning 'fn_acumular_mancuernas (orden %): %', NEW.id, sqlerrm;
    end;
  end if;
  return NEW;
end;
$function$;

-- Lo que el kiosko y la caja leen para prometer lo mismo.
create or replace function public.fn_rewards_reglas()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'activo', coalesce(g.activo, true),
    'pesos_por_mancuerna', coalesce(g.pesos_por_mancuerna, 14),
    'tope_por_orden', coalesce(g.tope_por_orden, 100),
    'no_acumulan', coalesce((
      select jsonb_agg(distinct p.id)
        from productos p
        join rewards_no_acumulan r on r.producto_id = p.id or r.categoria_id = p.categoria_id
       where p.archivado_en is null), '[]'::jsonb)
  )
  from (select 1) x left join rewards_ganancia g on g.id = 1;
$function$;
grant execute on function public.fn_rewards_reglas() to anon, authenticated;

-- Gerencia: cuánto se gana.
create or replace function public.fn_rewards_ganancia_guardar(p_pesos numeric, p_tope int, p_activo boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar cómo se ganan las mancuernas';
  end if;
  if p_pesos is null or p_pesos < 1 or p_pesos > 10000 then
    raise exception 'Los pesos por mancuerna van de $1 a $10,000';
  end if;
  if p_tope is null or p_tope < 1 or p_tope > 100000 then
    raise exception 'El tope por ticket va de 1 a 100,000 mancuernas';
  end if;
  update rewards_ganancia
     set pesos_por_mancuerna = round(p_pesos, 2), tope_por_orden = p_tope,
         activo = coalesce(p_activo, true), actualizado_en = now(),
         actualizado_por = (select e.id from empleados e where e.auth_user_id = auth.uid() limit 1)
   where id = 1;
  return fn_rewards_reglas();
end;
$function$;

-- Gerencia: una categoría o un producto deja de sumar (o vuelve a sumar).
create or replace function public.fn_rewards_no_acumula(p_categoria uuid, p_producto uuid, p_suma boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede elegir qué suma mancuernas';
  end if;
  if num_nonnulls(p_categoria, p_producto) <> 1 then
    raise exception 'Elige una categoría o un producto';
  end if;
  if p_suma then
    delete from rewards_no_acumulan
     where (p_categoria is not null and categoria_id = p_categoria)
        or (p_producto is not null and producto_id = p_producto);
  elsif p_categoria is not null then
    insert into rewards_no_acumulan (categoria_id, creado_por)
      values (p_categoria, (select e.id from empleados e where e.auth_user_id = auth.uid() limit 1))
      on conflict (categoria_id) where categoria_id is not null do nothing;
  else
    insert into rewards_no_acumulan (producto_id, creado_por)
      values (p_producto, (select e.id from empleados e where e.auth_user_id = auth.uid() limit 1))
      on conflict (producto_id) where producto_id is not null do nothing;
  end if;
  return fn_rewards_no_acumulan_admin();
end;
$function$;

-- Gerencia: la lista, con nombres.
create or replace function public.fn_rewards_no_acumulan_admin()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia';
  end if;
  return jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'categoria_id', c.id, 'nombre', c.nombre,
               'productos', (select count(*) from productos p where p.categoria_id = c.id and p.activo and p.archivado_en is null),
               'desde', r.creado_en) order by c.nombre)
        from rewards_no_acumulan r join categorias c on c.id = r.categoria_id), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'producto_id', p.id, 'nombre', p.nombre, 'precio', p.precio,
               'categoria', c.nombre, 'activo', p.activo, 'desde', r.creado_en) order by p.nombre)
        from rewards_no_acumulan r join productos p on p.id = r.producto_id
        left join categorias c on c.id = p.categoria_id), '[]'::jsonb)
  );
end;
$function$;

-- El panel «Cómo está armado» lee la tabla, no un número escrito a mano
-- (decía $10 desde el 17/10, cuando el servidor ya daba 1 por cada $14).
do $$
declare v text; a text;
begin
  select pg_get_functiondef('public.fn_rewards_parametros()'::regprocedure) into v;
  a := '''pesos_por_mancuerna'', 10,';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla pesos'; end if;
  v := replace(v, a, '''pesos_por_mancuerna'', (select pesos_por_mancuerna from rewards_ganancia where id = 1), ''activo'', (select activo from rewards_ganancia where id = 1),');
  a := '''tope_por_orden'', 100,';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla tope'; end if;
  v := replace(v, a, '''tope_por_orden'', (select tope_por_orden from rewards_ganancia where id = 1),');
  a := '''donde'', ''fn_acumular_mancuernas (trigger sobre ordenes)'',';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla donde'; end if;
  v := replace(v, a, '''donde'', ''Admin → Rewards (tabla rewards_ganancia)'',');
  a := '''editable_aqui'', false';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla editable'; end if;
  v := replace(v, a, '''editable_aqui'', true');
  execute v;
end $$;
