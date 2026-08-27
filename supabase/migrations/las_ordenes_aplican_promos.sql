-- Las dos puertas que crean ordenes aplican las promos automaticas.
--
-- El descuento se calcula AQUI, en el servidor, con los precios que el
-- servidor resolvio. El cliente no manda promos igual que no manda precios:
-- la caja tiene que poder confiar en el total que le llega.
--
-- Se suma a `ordenes.descuento` (que es lo que el ticket llama descuento) y
-- se deja constancia en promocion_aplicaciones de que promo entro en que
-- orden -- sin eso, al cerrar el mes nadie sabria cuanto costo la promo.
--
-- Arreglar solo una de las dos funciones dejaria la promo cobrando en caja
-- y no en el kiosko: la misma promo daria dos precios distintos segun por
-- donde entro el pedido.
--
-- Este archivo reemplaza los cuerpos que dejo
-- `para_comer_aqui_o_para_llevar.sql`; la firma no cambia.

CREATE OR REPLACE FUNCTION public.fn_crear_orden(p_sucursal_id uuid, p_almacen_id uuid, p_canal canal_orden, p_items jsonb, p_corte_id uuid DEFAULT NULL::uuid, p_empleado_id uuid DEFAULT NULL::uuid, p_cliente_id uuid DEFAULT NULL::uuid, p_descuento numeric DEFAULT 0, p_es_demo boolean DEFAULT false, p_nombre_cliente text DEFAULT NULL::text, p_para_llevar boolean DEFAULT NULL::boolean)
 RETURNS ordenes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orden ordenes;
  v_subtotal numeric := 0;
  v_promo numeric := 0;
  v_manual numeric;
  v_total numeric;
  v_lineas jsonb;
  v_item jsonb;
  v_cantidad integer;
  v_producto_id uuid;
  v_expira_minutos integer;
  v_expira_en timestamptz;
  v_repetida text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden no tiene productos';
  end if;

  select linea into v_repetida
  from (
    select nullif(item->>'linea','') as linea
    from jsonb_array_elements(p_items) item
  ) t
  where linea is not null
  group by linea having count(*) > 1
  limit 1;
  if v_repetida is not null then
    raise exception 'La orden trae dos lineas con la misma etiqueta "%".', v_repetida;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := nullif(v_item->>'producto_id','')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::integer, 0);
    if v_producto_id is null or v_cantidad <= 0 then
      raise exception 'Linea de orden invalida: %', v_item;
    end if;
    if nullif(v_item->>'linea','') is not null
       and nullif(v_item->>'linea','') = nullif(v_item->>'padre_linea','') then
      raise exception 'Una linea no puede acompanarse a si misma: %', v_item->>'linea';
    end if;
    if not exists (select 1 from productos where id = v_producto_id and activo = true) then
      raise exception 'Producto % no existe o no esta activo', v_producto_id;
    end if;
  end loop;

  -- Las lineas con su precio ya resuelto: sirven para el subtotal Y para
  -- las promos, que necesitan saber a que precio iba cada pieza.
  with entrada as (
    select nullif(item->>'linea','') as linea,
           nullif(item->>'padre_linea','') as padre_linea,
           item
    from jsonb_array_elements(p_items) item
  )
  select
    coalesce(sum(
      fn_precio_linea(
        (e.item->>'producto_id')::uuid,
        (padre.item->>'producto_id')::uuid
      ) * (e.item->>'cantidad')::integer), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'producto_id', e.item->>'producto_id',
      'cantidad', (e.item->>'cantidad')::integer,
      'precio', fn_precio_linea((e.item->>'producto_id')::uuid, (padre.item->>'producto_id')::uuid)
    )), '[]'::jsonb)
  into v_subtotal, v_lineas
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  select coalesce(sum(descuento), 0) into v_promo from fn_descuento_promos(v_lineas);

  v_manual := greatest(0, coalesce(p_descuento, 0));
  v_total := greatest(0, v_subtotal - v_manual - v_promo);

  if p_canal = 'kiosko' then
    select expira_minutos into v_expira_minutos from configuracion_kiosko where sucursal_id = p_sucursal_id;
    v_expira_en := now() + make_interval(mins => coalesce(v_expira_minutos, 15));
  end if;

  insert into ordenes (
    sucursal_id, almacen_id, canal, corte_id, empleado_id, cliente_id, descuento, total,
    estado_pago_orden, expira_en, es_demo, nombre_cliente, para_llevar
  ) values (
    p_sucursal_id, p_almacen_id, p_canal, p_corte_id, p_empleado_id, p_cliente_id,
    v_manual + v_promo, v_total,
    'pending_payment', v_expira_en, coalesce(p_es_demo, false),
    nullif(trim(p_nombre_cliente), ''), p_para_llevar
  ) returning * into v_orden;

  if not coalesce(p_es_demo, false) then
    insert into promocion_aplicaciones (promocion_id, cliente_id, orden_id)
    select promocion_id, p_cliente_id, v_orden.id from fn_descuento_promos(v_lineas);
  end if;

  with entrada as (
    select
      gen_random_uuid()                  as nuevo_id,
      nullif(item->>'linea', '')         as linea,
      nullif(item->>'padre_linea', '')   as padre_linea,
      item
    from jsonb_array_elements(p_items) item
  )
  insert into orden_items (
    id, orden_id, producto_id, cantidad, precio_unitario, personalizacion, padre_item_id
  )
  select
    e.nuevo_id,
    v_orden.id,
    (e.item->>'producto_id')::uuid,
    (e.item->>'cantidad')::integer,
    fn_precio_linea((e.item->>'producto_id')::uuid, (padre.item->>'producto_id')::uuid),
    nullif(e.item->>'personalizacion', ''),
    padre.nuevo_id
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  return v_orden;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_crear_orden_kiosko_caja(p_sucursal_id uuid, p_almacen_id uuid, p_items jsonb, p_cliente_id uuid DEFAULT NULL::uuid, p_descuento numeric DEFAULT 0, p_nombre_cliente text DEFAULT NULL::text, p_para_llevar boolean DEFAULT NULL::boolean)
 RETURNS ordenes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orden ordenes;
  v_subtotal numeric := 0;
  v_promo numeric := 0;
  v_manual numeric;
  v_total numeric;
  v_lineas jsonb;
  v_item jsonb;
  v_cantidad integer;
  v_producto_id uuid;
  v_expira_minutos integer;
  v_codigo text;
  v_intento integer := 0;
  v_repetida text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden no tiene productos';
  end if;

  select linea into v_repetida
  from (select nullif(item->>'linea','') as linea from jsonb_array_elements(p_items) item) t
  where linea is not null
  group by linea having count(*) > 1
  limit 1;
  if v_repetida is not null then
    raise exception 'La orden trae dos lineas con la misma etiqueta "%".', v_repetida;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := nullif(v_item->>'producto_id','')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::integer, 0);
    if v_producto_id is null or v_cantidad <= 0 then
      raise exception 'Linea de orden invalida: %', v_item;
    end if;
    if nullif(v_item->>'linea','') is not null
       and nullif(v_item->>'linea','') = nullif(v_item->>'padre_linea','') then
      raise exception 'Una linea no puede acompanarse a si misma: %', v_item->>'linea';
    end if;
    if not exists (select 1 from productos where id = v_producto_id and activo = true) then
      raise exception 'Producto % no existe o no esta activo', v_producto_id;
    end if;
  end loop;

  with entrada as (
    select nullif(item->>'linea','') as linea,
           nullif(item->>'padre_linea','') as padre_linea,
           item
    from jsonb_array_elements(p_items) item
  )
  select
    coalesce(sum(
      fn_precio_linea(
        (e.item->>'producto_id')::uuid,
        (padre.item->>'producto_id')::uuid
      ) * (e.item->>'cantidad')::integer), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'producto_id', e.item->>'producto_id',
      'cantidad', (e.item->>'cantidad')::integer,
      'precio', fn_precio_linea((e.item->>'producto_id')::uuid, (padre.item->>'producto_id')::uuid)
    )), '[]'::jsonb)
  into v_subtotal, v_lineas
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  select coalesce(sum(descuento), 0) into v_promo from fn_descuento_promos(v_lineas);

  v_manual := greatest(0, coalesce(p_descuento, 0));
  v_total := greatest(0, v_subtotal - v_manual - v_promo);

  select expira_minutos into v_expira_minutos from configuracion_kiosko where sucursal_id = p_sucursal_id;

  loop
    v_codigo := fn_generar_codigo_corto();
    exit when not exists (select 1 from ordenes where codigo_corto = v_codigo);
    v_intento := v_intento + 1;
    if v_intento > 5 then
      raise exception 'No se pudo generar un codigo corto unico, intenta de nuevo';
    end if;
  end loop;

  insert into ordenes (
    sucursal_id, almacen_id, canal, cliente_id, descuento, total,
    estado_pago_orden, expira_en, codigo_corto, nombre_cliente, para_llevar
  ) values (
    p_sucursal_id, p_almacen_id, 'kiosko', p_cliente_id,
    v_manual + v_promo, v_total,
    'awaiting_counter_payment', now() + make_interval(mins => coalesce(v_expira_minutos, 15)), v_codigo,
    nullif(trim(p_nombre_cliente), ''), p_para_llevar
  ) returning * into v_orden;

  insert into promocion_aplicaciones (promocion_id, cliente_id, orden_id)
  select promocion_id, p_cliente_id, v_orden.id from fn_descuento_promos(v_lineas);

  with entrada as (
    select
      gen_random_uuid()                as nuevo_id,
      nullif(item->>'linea', '')       as linea,
      nullif(item->>'padre_linea', '') as padre_linea,
      item
    from jsonb_array_elements(p_items) item
  )
  insert into orden_items (
    id, orden_id, producto_id, cantidad, precio_unitario, personalizacion, padre_item_id
  )
  select
    e.nuevo_id,
    v_orden.id,
    (e.item->>'producto_id')::uuid,
    (e.item->>'cantidad')::integer,
    fn_precio_linea((e.item->>'producto_id')::uuid, (padre.item->>'producto_id')::uuid),
    nullif(e.item->>'personalizacion', ''),
    padre.nuevo_id
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  return v_orden;
end;
$function$;
