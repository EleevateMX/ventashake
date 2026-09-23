-- El cajero tiene que ver el total CON descuento antes de tomar el
-- dinero. Sin esto, la pantalla dice $349 y la caja cobra $253: el cajero
-- pide de mas, el cliente paga de mas, y eso se descubre al cuadrar.
--
-- La cuenta se saca a una sola funcion y **la usan las dos** —la que
-- cotiza y la que cobra—. Dos copias de una regla de precios se separan
-- solas: asi fue como el doble scoop cobro $10 de menos durante semanas.
create or replace function public.fn_personal_calcular(
  p_empleado_id uuid,
  p_items jsonb
) returns table(
  descuento numeric, n_shake int, n_alimento int, n_bebida int, importe numeric
)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_item jsonb; v_p record; v_cant int;
begin
  descuento := 0; n_shake := 0; n_alimento := 0; n_bebida := 0; importe := 0;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Los hijos se saltan SIEMPRE: son extras y van a precio normal. Y
    -- ademas su precio no es `productos.precio` sino el del vinculo, asi
    -- que aqui ni siquiera se podria calcular bien.
    continue when coalesce(v_item->>'padre_linea', '') <> '';

    v_cant := greatest(coalesce((v_item->>'cantidad')::int, 1), 1);
    select id, precio, precio_personal, grupo_personal into v_p
      from productos where id = (v_item->>'producto_id')::uuid;
    if v_p.id is null or v_p.precio_personal is null then continue; end if;

    descuento := descuento + greatest(v_p.precio - v_p.precio_personal, 0) * v_cant;

    if v_p.grupo_personal = 'shake' then n_shake := n_shake + v_cant;
    elsif v_p.grupo_personal = 'alimento' then n_alimento := n_alimento + v_cant;
    elsif v_p.grupo_personal = 'bebida' then n_bebida := n_bebida + v_cant;
    else continue;
    end if;
    importe := importe + v_p.precio_personal * v_cant;
  end loop;

  return next;
end;
$function$;

-- Cotizar: lo mismo que va a pasar al cobrar, pero sin crear nada.
-- Devuelve tambien el motivo por el que NO se va a poder, para que la
-- pantalla lo diga antes y no despues.
create or replace function public.fn_personal_cotizar(p_clave text, p_items jsonb)
returns table(nombre text, descuento numeric, motivo text)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v_emp record; v_c record; v_r record; v_motivo text;
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
  select * into v_c from fn_personal_calcular(v_emp.id, p_items);
  select * into v_r from fn_personal_restante(v_emp.id);

  if v_motivo is null then
    if v_c.descuento <= 0 then
      v_motivo := 'Nada de este pedido tiene precio de personal.';
    elsif v_r.usado_shake + v_c.n_shake > v_r.max_shake then
      v_motivo := format('Solo %s shake o Clasico al dia. Hoy ya lleva %s.', v_r.max_shake, v_r.usado_shake);
    elsif v_r.usado_alimento + v_c.n_alimento > v_r.max_alimento then
      v_motivo := format('Solo %s alimento al dia. Hoy ya lleva %s.', v_r.max_alimento, v_r.usado_alimento);
    elsif v_r.usado_bebida + v_c.n_bebida > v_r.max_bebida then
      v_motivo := format('Solo %s bebida al dia. Hoy ya lleva %s.', v_r.max_bebida, v_r.usado_bebida);
    elsif v_r.usado_importe + v_c.importe > v_r.tope then
      v_motivo := format('Pasa su tope de $%s. Hoy lleva $%s y esto suma $%s.',
        round(v_r.tope), round(v_r.usado_importe), round(v_c.importe));
    end if;
  end if;

  return query select v_emp.nombre,
                      case when v_motivo is null then v_c.descuento else 0::numeric end,
                      v_motivo;
end;
$function$;

grant execute on function public.fn_personal_cotizar(text, jsonb) to anon, authenticated;
revoke execute on function public.fn_personal_calcular(uuid, jsonb) from anon;
revoke execute on function public.fn_personal_calcular(uuid, jsonb) from public;

-- Y el cobro usa exactamente esa misma cuenta: ver
-- `el_cobro_de_personal_usa_la_misma_cuenta_que_la_cotizacion.sql`.
