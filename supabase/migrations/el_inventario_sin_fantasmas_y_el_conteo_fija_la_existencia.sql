-- El inventario deja de tener fantasmas, y el conteo fisico de Costeos fija
-- la existencia real (26/09).
--
-- Lo que vio Perla: en Costeos tecleo 10 barras Think!, en Admin decian -5
-- y al vender una "no la descontaba". El sistema SI descontaba cada venta
-- (30 Cookies & Cream desde el 24/08, sin que nadie hubiera dado de alta
-- existencia: de ahi el negativo). Lo que pasaba es que Costeos lleva su
-- propio numero, que no ve las ventas, y al guardar manda la DIFERENCIA
-- contra su numero anterior: los 10 se sumaron al -16 real y quedo -6. El
-- "10" de Costeos nunca bajo porque las ventas no le llegan.
--
-- Y lo que hacia Admin -> Inventario ilegible: 630 renglones fantasma con
-- 1 422 piezas que no existen. Costeos guarda mientras uno escribe, y cada
-- pausa creaba un insumo con el nombre a medias ("Ad - Colageno", "Advan -
-- Colageno", "Advance N - Colageno"...) y le copiaba la existencia del
-- renglon. El renglon real quedaba bien; los fantasmas duplicaban su stock.
--
-- Tres cosas:
--  1. Limpieza de una vez: los fantasmas vuelven a 0 con un movimiento de
--     ajuste que dice por que, y se apagan. Criterio estrecho a proposito:
--     nombre que ya no existe en Costeos, NINGUN movimiento que no sea del
--     propio sync de Costeos (ni una venta, ni una entrada del kiosko) y
--     ninguna receta de un producto activo. Uno que se haya vendido nunca
--     cae aqui.
--  2. Lo mismo al guardar Costeos, para los fantasmas que nazcan despues.
--  3. fn_costos_aplicar_conteo: el boton "Aplicar conteo a existencias"
--     decia "sobrescribe el stock del sistema" y no lo hacia -- sumaba la
--     diferencia contra el numero viejo de Costeos. Ahora es un evento: fija
--     la existencia real en lo contado y deja escrito cuanto decia el
--     sistema. Un evento y no un "estado que se reconcilia al guardar",
--     porque con dos pestanas de Costeos abiertas (como las tiene Perla) un
--     estado viejo guardado despues deshace ventas; un evento no.

create index if not exists inventario_movimientos_insumo_idx on inventario_movimientos (insumo_id);
create index if not exists recetas_insumo_idx on recetas (insumo_id);

-- ── 1. Limpieza de una vez ─────────────────────────────────────────────
with costeo as (
  select lower(trim(x->>'marca') || ' - ' || trim(x->>'sabor')) n from app_data, jsonb_array_elements(data->'proteins') x
  union select lower(trim(x->>'nombre')) from app_data, jsonb_array_elements(data->'shakeIngs') x
  union select lower(trim(x->>'nombre')) from app_data, jsonb_array_elements(data->'foodIngs') x
  union select lower(trim(x->>'nombre')) from app_data, jsonb_array_elements(data->'empaque') x
  union select lower(trim(x->>'nombre')) from app_data, jsonb_array_elements(data->'bebidas') x
  union select lower(trim(x->>'nombre')) from app_data, jsonb_array_elements(data->'snacks') x
),
fantasma as (
  select i.id from insumos i
   where lower(i.nombre) not in (select n from costeo where n is not null)
     and not exists (select 1 from inventario_movimientos m where m.insumo_id = i.id
                      and (m.nota is null or m.nota not like 'Sync costosshake%'))
     and not exists (select 1 from recetas r join productos p on p.id = r.producto_id
                      where r.insumo_id = i.id and p.activo)
),
con_stock as (
  select s.id stock_id, s.insumo_id, s.almacen_id, s.stock_actual
    from inventario_stock s where s.stock_actual <> 0 and s.insumo_id in (select id from fantasma)
),
mov as (
  insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, nota)
  select insumo_id, almacen_id, -stock_actual, 'ajuste',
         'Fantasma de Costeos: nombre a medio escribir, su existencia duplicaba la del renglon real'
    from con_stock returning 1
),
stk as (update inventario_stock s set stock_actual = 0 from con_stock c where s.id = c.stock_id returning 1),
syn as (update costos_stock_sync ss set ultimo_valor = 0, updated_at = now()
          from con_stock c where ss.insumo_id = c.insumo_id and ss.almacen_id = c.almacen_id returning 1)
update insumos set activo = false where id in (select id from fantasma);

-- ── 2. Admin ve si el insumo esta apagado ─────────────────────────────
-- create or replace view borra las reloptions: se vuelve a declarar.
create or replace view vw_stock_almacen with (security_invoker = true) as
 select s.id, s.almacen_id, a.nombre as almacen, a.tipo as almacen_tipo,
        s.insumo_id, i.nombre as insumo, i.tipo as insumo_tipo, i.unidad,
        s.stock_actual, s.stock_minimo,
        (s.stock_actual <= s.stock_minimo) as bajo_minimo,
        i.activo as insumo_activo
   from inventario_stock s
   join almacenes a on a.id = s.almacen_id
   join insumos i on i.id = s.insumo_id;

-- ── 3. Al guardar Costeos: sin fantasmas nuevos ───────────────────────
create or replace function public.fn_sync_stock_costos()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_kiosko uuid;
  v_bodega uuid;
begin
  select id into v_kiosko from almacenes where tipo = 'kiosko' order by id limit 1;
  select id into v_bodega from almacenes where tipo = 'bodega' order by id limit 1;
  if v_kiosko is null then
    return;
  end if;

  drop table if exists _stk;
  create temp table _stk on commit drop as
  select distinct on (i.id)
    i.id as insumo_id,
    coalesce(nullif(c.kiosko, '')::numeric, 0) as kiosko_val,
    coalesce(nullif(c.bodega, '')::numeric, 0) as bodega_val
  from (
    select trim(x->>'marca') || ' - ' || trim(x->>'sabor') nombre,
           x->>'invIndividual' kiosko, x->>'invOriginal' bodega
    from app_data, jsonb_array_elements(data->'proteins') x
    where coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'shakeIngs') x where coalesce(trim(x->>'nombre'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'foodIngs') x where coalesce(trim(x->>'nombre'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'empaque') x where coalesce(trim(x->>'nombre'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'bebidas') x where coalesce(trim(x->>'nombre'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'snacks') x where coalesce(trim(x->>'nombre'),'')<>''
  ) c
  join insumos i on lower(i.nombre) = lower(c.nombre)
  order by i.id, coalesce(nullif(c.kiosko,'')::numeric,0) desc, coalesce(nullif(c.bodega,'')::numeric,0) desc;

  perform _aplicar_delta_almacen(v_kiosko, 'kiosko', 'traspaso');
  if v_bodega is not null then
    perform _aplicar_delta_almacen(v_bodega, 'bodega', 'ajuste');
  end if;

  -- Lo que Costeos vuelve a nombrar esta vivo: si alguien lo apago por
  -- fantasma y el nombre regresa, regresa con el.
  update insumos set activo = true
   where not activo and id in (select insumo_id from _stk);

  -- El renglon que se renombro deja atras un fantasma con la existencia que
  -- Costeos le puso. Se le quita, con el mismo criterio estrecho de la
  -- limpieza: nunca un insumo que se haya vendido o recibido por el kiosko.
  with fantasma as (
    select s.id stock_id, s.insumo_id, s.almacen_id, s.stock_actual
      from inventario_stock s
      join costos_stock_sync ss on ss.insumo_id = s.insumo_id and ss.almacen_id = s.almacen_id
     where s.almacen_id in (v_kiosko, v_bodega)
       and s.stock_actual <> 0
       and s.insumo_id not in (select insumo_id from _stk)
       and not exists (select 1 from inventario_movimientos m where m.insumo_id = s.insumo_id
                        and (m.nota is null or m.nota not like 'Sync costosshake%'))
       and not exists (select 1 from recetas r join productos p on p.id = r.producto_id
                        where r.insumo_id = s.insumo_id and p.activo)
  ),
  mov as (
    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, nota)
    select insumo_id, almacen_id, -stock_actual, 'ajuste',
           'Fantasma de Costeos: nombre a medio escribir, su existencia duplicaba la del renglon real'
      from fantasma returning 1
  ),
  stk as (update inventario_stock s set stock_actual = 0 from fantasma f where s.id = f.stock_id returning 1),
  syn as (update costos_stock_sync ss set ultimo_valor = 0, updated_at = now()
            from fantasma f where ss.insumo_id = f.insumo_id and ss.almacen_id = f.almacen_id returning 1)
  update insumos set activo = false where id in (select insumo_id from fantasma);
end $function$;

-- ── 4. Lo que el sistema tiene de verdad, para que Costeos lo ensene ──
create or replace function public.fn_costos_existencias(p_token uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v_k uuid; v_b uuid; v jsonb;
begin
  if fn_costos_sesion(p_token) is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  select id into v_k from almacenes where tipo = 'kiosko' order by id limit 1;
  select id into v_b from almacenes where tipo = 'bodega' order by id limit 1;
  select coalesce(jsonb_object_agg(n, jsonb_strip_nulls(jsonb_build_object('k', k, 'b', b))), '{}'::jsonb)
    into v
    from (
      select lower(i.nombre) n,
             trim_scale(sum(s.stock_actual) filter (where s.almacen_id = v_k)) k,
             trim_scale(sum(s.stock_actual) filter (where s.almacen_id = v_b)) b
        from insumos i join inventario_stock s on s.insumo_id = i.id
       where i.activo and s.almacen_id in (v_k, v_b)
       group by lower(i.nombre)
    ) t;
  return v;
end $function$;

-- ── 5. El conteo fisico FIJA la existencia real ───────────────────────
-- p_items: [{nombre, almacen: 'kiosko'|'bodega', contado}]. El nombre es el
-- mismo con el que empata el sync (marca - sabor en proteinas, nombre en
-- lo demas). Deja ultimo_valor = contado para que el guardado que sigue no
-- vuelva a sumar la diferencia.
create or replace function public.fn_costos_aplicar_conteo(p_token uuid, p_firma text, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_usuario text; v_k uuid; v_b uuid; v_alm uuid;
  r record; v_ins uuid; v_actual numeric; v_hubo boolean;
  v_aplicados int := 0; v_cambios int := 0; v_sin text[] := '{}';
begin
  v_usuario := fn_costos_sesion(p_token);
  if v_usuario is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'No llego ningun conteo.';
  end if;
  select id into v_k from almacenes where tipo = 'kiosko' order by id limit 1;
  select id into v_b from almacenes where tipo = 'bodega' order by id limit 1;

  for r in
    select trim(x->>'nombre') nombre, x->>'almacen' almacen,
           nullif(trim(x->>'contado'), '')::numeric contado
      from jsonb_array_elements(p_items) x
  loop
    if r.contado is null or coalesce(r.nombre, '') = '' then continue; end if;
    v_alm := case r.almacen when 'kiosko' then v_k when 'bodega' then v_b end;
    if v_alm is null then continue; end if;

    v_hubo := false;
    for v_ins in select id from insumos where lower(nombre) = lower(r.nombre) loop
      v_hubo := true;
      -- for update: una venta que cae en medio no se pierde.
      select stock_actual into v_actual from inventario_stock
       where insumo_id = v_ins and almacen_id = v_alm for update;
      v_actual := coalesce(v_actual, 0);
      if r.contado <> v_actual then
        insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, nota)
        values (v_ins, v_alm, r.contado - v_actual, 'ajuste',
                'Conteo fisico desde Costeos (' || coalesce(nullif(trim(p_firma), ''), v_usuario)
                || '). El sistema decia ' || trim_scale(v_actual) || ', se contaron ' || trim_scale(r.contado));
        v_cambios := v_cambios + 1;
      end if;
      insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
      values (v_alm, v_ins, r.contado, 0)
      on conflict (almacen_id, insumo_id) do update set stock_actual = excluded.stock_actual;
      insert into costos_stock_sync (insumo_id, almacen_id, ultimo_valor)
      values (v_ins, v_alm, r.contado)
      on conflict (insumo_id, almacen_id) do update set ultimo_valor = excluded.ultimo_valor, updated_at = now();
      update insumos set activo = true where id = v_ins and not activo;
      v_aplicados := v_aplicados + 1;
    end loop;
    if not v_hubo then v_sin := array_append(v_sin, r.nombre); end if;
  end loop;

  return jsonb_build_object('aplicados', v_aplicados, 'cambiaron', v_cambios, 'sin_empate', to_jsonb(v_sin));
end $function$;

-- Costeos no usa Supabase Auth: habla como anon y se identifica con su
-- token, igual que fn_costos_leer / fn_costos_guardar.
revoke execute on function fn_costos_existencias(uuid) from public;
revoke execute on function fn_costos_aplicar_conteo(uuid, text, jsonb) from public;
grant execute on function fn_costos_existencias(uuid) to anon, authenticated;
grant execute on function fn_costos_aplicar_conteo(uuid, text, jsonb) to anon, authenticated;
