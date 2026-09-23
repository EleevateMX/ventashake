-- `fn_crear_orden_personal` ahora saca el descuento de
-- `fn_personal_calcular`, que es exactamente la misma funcion que usa la
-- cotizacion. Antes la cuenta estaba escrita dos veces —una aqui y otra
-- en la de cotizar— y esa es justo la forma en que se separan: el doble
-- scoop cobro $10 de menos durante semanas por tener la regla en dos
-- lados.
--
-- Lo que se cotiza y lo que se cobra ahora no pueden diferir, porque son
-- el mismo codigo corriendo dos veces.
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
  v_emp record; v_motivo text; v_r record; v_c record;
  v_dia date; v_orden ordenes; v_item jsonb; v_p record; v_cant int;
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

  select * into v_c from fn_personal_calcular(v_emp.id, p_items);
  select * into v_r from fn_personal_restante(v_emp.id);
  v_dia := (now() at time zone 'America/Merida')::date;

  if v_c.descuento <= 0 then
    raise exception 'Nada de este pedido tiene precio de personal.';
  end if;

  -- Los limites son POR GRUPO y no se sustituyen entre si: no pedir
  -- alimento no da derecho a un segundo shake.
  if v_r.usado_shake + v_c.n_shake > v_r.max_shake then
    raise exception 'Solo % shake o Clasico al dia. Hoy ya llevas %.', v_r.max_shake, v_r.usado_shake;
  end if;
  if v_r.usado_alimento + v_c.n_alimento > v_r.max_alimento then
    raise exception 'Solo % alimento al dia. Hoy ya llevas %.', v_r.max_alimento, v_r.usado_alimento;
  end if;
  if v_r.usado_bebida + v_c.n_bebida > v_r.max_bebida then
    raise exception 'Solo % bebida al dia. Hoy ya llevas %.', v_r.max_bebida, v_r.usado_bebida;
  end if;
  if v_r.usado_importe + v_c.importe > v_r.tope then
    raise exception 'Pasa tu tope diario de $%. Hoy llevas $% y esto suma $%.',
      round(v_r.tope), round(v_r.usado_importe), round(v_c.importe);
  end if;

  v_orden := fn_crear_orden(
    p_sucursal_id, p_almacen_id, p_canal, p_items, p_corte_id, p_empleado_id,
    p_cliente_id, v_c.descuento, p_es_demo,
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
