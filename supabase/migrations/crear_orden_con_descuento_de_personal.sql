-- Crear una orden con precio de personal.
--
-- ⚠ SUPERSEDIDA en parte por
-- `el_cobro_de_personal_usa_la_misma_cuenta_que_la_cotizacion.sql`: el
-- descuento ya no se calcula aqui adentro, sale de `fn_personal_calcular`,
-- que es la misma funcion que usa la cotizacion. Este archivo se queda
-- como registro de por que la funcion existe y de que envuelve.
--
-- ENVUELVE a `fn_crear_orden` en vez de modificarla. El descuento se
-- calcula aqui, en el servidor, a partir de `productos.precio_personal` —
-- el cajero manda una clave, no un precio ni un descuento.
--
-- **El descuento solo toca los renglones BASE, nunca los extras.** Lo
-- pidio gerencia asi ("los adicionales deberan cobrarse normalmente"),
-- pero ademas hay una razon tecnica que lo vuelve obligatorio: el precio
-- de un extra no es `productos.precio`, es el del VINCULO
-- (`producto_extras.precio`, que puede ser distinto en cada producto). La
-- leche de almendras vale $0 como producto y $10 colgada de un shake.
-- Calcular su descuento desde `productos.precio` daria un numero que no es
-- el que se esta cobrando, y mirar el vinculo seria copiar aqui la logica
-- de precios de `fn_crear_orden` — dos copias de la misma regla que se
-- separan solas, que es como se cobro de menos el doble scoop.
--
-- Lo que cuenta para el limite y lo que no, tal como lo pidio gerencia:
--   * Solo los productos con `grupo_personal` consumen lugar y suman al
--     tope, y suman **su precio de personal**, no lo que se pago.
--   * Todo lo demas -boosters, extras, leches vegetales, combos- se cobra
--     completo, porque no tiene `precio_personal` o porque es un hijo.
create or replace function public.fn_crear_orden_personal(
  p_clave text,
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_canal canal_orden,
  p_items jsonb,
  p_corte_id uuid default null,
  p_empleado_id uuid default null,
  p_cliente_id uuid default null,
  p_es_demo boolean default false,
  p_nombre_cliente text default null,
  p_para_llevar boolean default null
) returns ordenes
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  v_emp record; v_motivo text; v_cfg record; v_r record;
  v_descuento numeric := 0; v_dia date;
  v_n_shake int := 0; v_n_alimento int := 0; v_n_bebida int := 0;
  v_importe numeric := 0;
  v_orden ordenes; v_item jsonb; v_p record; v_cant int;
begin
  if fn_pin_fallos_recientes('personal') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  select e.id, e.nombre into v_emp
    from empleados e
   where e.activo and e.beneficio_personal
     and e.clave_personal_hash is not null
     and e.clave_personal_hash = crypt(p_clave, e.clave_personal_hash)
   order by e.created_at limit 1;

  if v_emp.id is null then
    perform fn_pin_registrar_intento('personal', false);
    raise exception 'Esa clave no es de nadie.';
  end if;
  perform fn_pin_registrar_intento('personal', true);

  v_motivo := fn_personal_puede(v_emp.id);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;

  select * into v_cfg from personal_config where id = 'default';
  select * into v_r from fn_personal_restante(v_emp.id);
  v_dia := (now() at time zone 'America/Merida')::date;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Los hijos se saltan SIEMPRE: son extras y van a precio normal.
    continue when coalesce(v_item->>'padre_linea', '') <> '';

    v_cant := greatest(coalesce((v_item->>'cantidad')::int, 1), 1);
    select id, nombre, precio, precio_personal, grupo_personal into v_p
      from productos where id = (v_item->>'producto_id')::uuid;
    if v_p.id is null or v_p.precio_personal is null then continue; end if;

    v_descuento := v_descuento + greatest(v_p.precio - v_p.precio_personal, 0) * v_cant;

    if v_p.grupo_personal = 'shake' then v_n_shake := v_n_shake + v_cant;
    elsif v_p.grupo_personal = 'alimento' then v_n_alimento := v_n_alimento + v_cant;
    elsif v_p.grupo_personal = 'bebida' then v_n_bebida := v_n_bebida + v_cant;
    else continue;
    end if;
    v_importe := v_importe + v_p.precio_personal * v_cant;
  end loop;

  if v_descuento <= 0 then
    raise exception 'Nada de este pedido tiene precio de personal.';
  end if;

  -- Los limites son POR GRUPO y no se sustituyen entre si: no pedir
  -- alimento no da derecho a un segundo shake. Se rechaza con el nombre
  -- del grupo, para que el cajero sepa que renglon quitar.
  if v_r.usado_shake + v_n_shake > v_r.max_shake then
    raise exception 'Solo % shake o Clasico al dia. Hoy ya llevas %.', v_r.max_shake, v_r.usado_shake;
  end if;
  if v_r.usado_alimento + v_n_alimento > v_r.max_alimento then
    raise exception 'Solo % alimento al dia. Hoy ya llevas %.', v_r.max_alimento, v_r.usado_alimento;
  end if;
  if v_r.usado_bebida + v_n_bebida > v_r.max_bebida then
    raise exception 'Solo % bebida al dia. Hoy ya llevas %.', v_r.max_bebida, v_r.usado_bebida;
  end if;
  if v_r.usado_importe + v_importe > v_r.tope then
    raise exception 'Pasa tu tope diario de $%. Hoy llevas $% y esto suma $%.',
      round(v_r.tope), round(v_r.usado_importe), round(v_importe);
  end if;

  v_orden := fn_crear_orden(
    p_sucursal_id, p_almacen_id, p_canal, p_items, p_corte_id, p_empleado_id,
    p_cliente_id, v_descuento, p_es_demo,
    coalesce(nullif(btrim(coalesce(p_nombre_cliente, '')), ''), v_emp.nombre),
    p_para_llevar
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    continue when coalesce(v_item->>'padre_linea', '') <> '';
    v_cant := greatest(coalesce((v_item->>'cantidad')::int, 1), 1);
    select id, nombre, precio, precio_personal, grupo_personal into v_p
      from productos where id = (v_item->>'producto_id')::uuid;
    if v_p.id is null or v_p.precio_personal is null or v_p.grupo_personal is null then
      continue;
    end if;
    insert into personal_consumos (
      empleado_id, orden_id, dia, grupo, producto_id, producto,
      cantidad, importe_personal, precio_publico
    ) values (
      v_emp.id, v_orden.id, v_dia, v_p.grupo_personal, v_p.id, v_p.nombre,
      v_cant, v_p.precio_personal * v_cant, v_p.precio * v_cant
    );
  end loop;

  return v_orden;
end;
$function$;

grant execute on function public.fn_crear_orden_personal(
  text, uuid, uuid, canal_orden, jsonb, uuid, uuid, uuid, boolean, text, boolean
) to anon, authenticated;
