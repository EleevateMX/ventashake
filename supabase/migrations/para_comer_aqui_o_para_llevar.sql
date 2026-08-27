-- Para comer aqui o para llevar.
--
-- Hoy la estacion lo adivina o lo pregunta a gritos. Se decide al tomar la
-- orden y viaja con ella hasta la comanda y la etiqueta, que es donde lo
-- necesita quien prepara: el vaso, la tapa y la bolsa no son los mismos.
--
-- NULL a proposito para todo lo que ya existe: no vamos a inventar que las
-- ventas de ayer fueron para llevar. Un dato que no se capturo se ve como
-- lo que es, vacio.
--
-- Este archivo es el REGISTRO del estado final. En produccion se aplico en
-- varios pasos (columna, payload de la comanda, y las dos funciones que
-- crean ordenes); aqui va consolidado y en orden de dependencia.
alter table ordenes
  add column if not exists para_llevar boolean;

comment on column ordenes.para_llevar is
  'true = para llevar, false = para comer aqui, null = no se pregunto '
  '(ventas anteriores a que existiera la opcion).';

-- 1) Que viaje en el payload de la comanda, para la etiqueta y la pantalla.
--    Parche por ancla: la funcion es larga y reescribirla entera aqui la
--    dejaria congelada en esta version. Si el ancla no aparece exactamente
--    una vez, el parche falla ruidosamente en vez de corromperla.
do $mig$
declare
  d text := pg_get_functiondef('fn_encolar_comanda_para_pedido(uuid)'::regprocedure);
  ancla text := '''cliente'', coalesce(o.nombre_cliente, cl.nombre),';
  veces int;
begin
  if position('''para_llevar''' in d) > 0 then
    return;  -- ya lo trae
  end if;
  veces := (length(d) - length(replace(d, ancla, ''))) / length(ancla);
  if veces <> 1 then
    raise exception 'El ancla del cliente aparece % veces, no 1', veces;
  end if;
  d := replace(d, ancla, ancla || '
    ''para_llevar'', o.para_llevar,');
  execute d;
end
$mig$;

-- 2) fn_crear_orden: nuevo parametro al final.
--    Cambiar la firma NO reemplaza la funcion, la duplica -- hay que tirar
--    la anterior o conviven dos y Postgres elige la que quiera.
drop function if exists public.fn_crear_orden(uuid,uuid,canal_orden,jsonb,uuid,uuid,uuid,numeric,boolean,text);

CREATE OR REPLACE FUNCTION public.fn_crear_orden(p_sucursal_id uuid, p_almacen_id uuid, p_canal canal_orden, p_items jsonb, p_corte_id uuid DEFAULT NULL::uuid, p_empleado_id uuid DEFAULT NULL::uuid, p_cliente_id uuid DEFAULT NULL::uuid, p_descuento numeric DEFAULT 0, p_es_demo boolean DEFAULT false, p_nombre_cliente text DEFAULT NULL::text, p_para_llevar boolean DEFAULT NULL::boolean)
 RETURNS ordenes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orden ordenes;
  v_subtotal numeric := 0;
  v_total numeric;
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

  -- El subtotal resuelve el padre de cada linea para aplicar el
  -- sobreprecio por producto. Mismo calculo que usa el insert de abajo.
  with entrada as (
    select nullif(item->>'linea','') as linea,
           nullif(item->>'padre_linea','') as padre_linea,
           item
    from jsonb_array_elements(p_items) item
  )
  select coalesce(sum(
    fn_precio_linea(
      (e.item->>'producto_id')::uuid,
      (padre.item->>'producto_id')::uuid
    ) * (e.item->>'cantidad')::integer), 0)
  into v_subtotal
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  v_total := greatest(0, v_subtotal - greatest(0, coalesce(p_descuento, 0)));

  if p_canal = 'kiosko' then
    select expira_minutos into v_expira_minutos from configuracion_kiosko where sucursal_id = p_sucursal_id;
    v_expira_en := now() + make_interval(mins => coalesce(v_expira_minutos, 15));
  end if;

  insert into ordenes (
    sucursal_id, almacen_id, canal, corte_id, empleado_id, cliente_id, descuento, total,
    estado_pago_orden, expira_en, es_demo, nombre_cliente, para_llevar
  ) values (
    p_sucursal_id, p_almacen_id, p_canal, p_corte_id, p_empleado_id, p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'pending_payment', v_expira_en, coalesce(p_es_demo, false),
    nullif(trim(p_nombre_cliente), ''), p_para_llevar
  ) returning * into v_orden;

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

-- 3) La otra puerta: el kiosko que deja la orden para pagar en caja.
--    Si solo se arregla fn_crear_orden, la mitad de las ordenes llega a
--    barra sin el dato y nadie sabe por que a veces sale y a veces no.
drop function if exists public.fn_crear_orden_kiosko_caja(uuid,uuid,jsonb,uuid,numeric,text);

CREATE OR REPLACE FUNCTION public.fn_crear_orden_kiosko_caja(p_sucursal_id uuid, p_almacen_id uuid, p_items jsonb, p_cliente_id uuid DEFAULT NULL::uuid, p_descuento numeric DEFAULT 0, p_nombre_cliente text DEFAULT NULL::text, p_para_llevar boolean DEFAULT NULL::boolean)
 RETURNS ordenes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orden ordenes;
  v_subtotal numeric := 0;
  v_total numeric;
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
  select coalesce(sum(
    fn_precio_linea(
      (e.item->>'producto_id')::uuid,
      (padre.item->>'producto_id')::uuid
    ) * (e.item->>'cantidad')::integer), 0)
  into v_subtotal
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  v_total := greatest(0, v_subtotal - greatest(0, coalesce(p_descuento, 0)));

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
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'awaiting_counter_payment', now() + make_interval(mins => coalesce(v_expira_minutos, 15)), v_codigo,
    nullif(trim(p_nombre_cliente), ''), p_para_llevar
  ) returning * into v_orden;

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

grant execute on function public.fn_crear_orden_kiosko_caja(uuid,uuid,jsonb,uuid,numeric,text,boolean) to anon, authenticated;
