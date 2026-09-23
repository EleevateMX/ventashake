-- Las funciones del reloj checador. Registro de lo aplicado en produccion
-- el 23/09/26. Reglas de diseno en CLAUDE.md seccion 2.8.
--
-- Quien puede que: `checar` y `estado` estan abiertas a anon porque el
-- kiosko en modo cajero corre como anon (CLAUDE.md 2.2) y el PIN ES la
-- credencial, comparado contra bcrypt igual que fn_staff_por_pin. Todo lo
-- demas pide personal o gerencia y esta cerrado a anon Y a PUBLIC.

-- En que estado esta quien trae este PIN, y que puede hacer ahora. La
-- pantalla no adivina: pregunta. Asi solo ofrece transiciones que existen.
create or replace function public.fn_asistencia_estado(p_pin text)
returns table(nombre text, estado text, puede text[], desde_hora text)
language plpgsql stable security definer
set search_path to 'public', 'extensions'
as $function$
declare v_emp record; v_ult record; v_horas int;
begin
  if fn_pin_fallos_recientes('checador') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  select e.id, e.nombre into v_emp from empleados e
   where e.activo and e.pin_hash is not null and e.pin_hash = crypt(p_pin, e.pin_hash)
   order by e.created_at limit 1;
  if v_emp.id is null then
    raise exception 'Ese PIN no es de nadie. Vuelve a intentar.';
  end if;

  select turno_max_horas into v_horas from asistencia_config where id = 'default';
  select a.* into v_ult from asistencia_eventos a
   where a.empleado_id = v_emp.id order by a.ocurrio_en desc limit 1;

  if v_ult.id is null or v_ult.tipo = 'salida'
     or v_ult.ocurrio_en < now() - make_interval(hours => coalesce(v_horas, 16)) then
    return query select v_emp.nombre, 'fuera'::text, array['entrada']::text[], null::text;
  elsif v_ult.tipo = 'inicio_comida' then
    return query select v_emp.nombre, 'comiendo'::text, array['fin_comida']::text[],
                        to_char(v_ult.ocurrio_en at time zone 'America/Merida', 'HH24:MI');
  else
    return query select v_emp.nombre, 'dentro'::text,
                        array['inicio_comida', 'salida']::text[],
                        to_char(v_ult.ocurrio_en at time zone 'America/Merida', 'HH24:MI');
  end if;
end;
$function$;

revoke execute on function public.fn_asistencia_estado(text) from public;
grant execute on function public.fn_asistencia_estado(text) to anon, authenticated;

-- Checar. El servidor VUELVE A VALIDAR la transicion aunque la pantalla ya
-- haya filtrado los botones: una pantalla vieja podria mandar "salida" de
-- alguien que ya se fue y partir el historico en dos.
--
-- La hora la pone el servidor (now()), nunca la pantalla: con la hora del
-- navegador, cambiarle el reloj a la PC bastaria para falsear un turno.
create or replace function public.fn_asistencia_checar(
  p_pin text, p_pantalla text default null, p_tipo text default null
)
returns table(empleado_id uuid, nombre text, tipo text,
              ocurrio_en timestamptz, hora text, repetida boolean, minutos int)
language plpgsql security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_emp record; v_ult record; v_tipo text; v_id uuid; v_minutos int;
  v_horas int; v_abierto boolean; v_comiendo boolean;
begin
  if fn_pin_fallos_recientes('checador') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  select e.id, e.nombre into v_emp from empleados e
   where e.activo and e.pin_hash is not null and e.pin_hash = crypt(p_pin, e.pin_hash)
   order by e.created_at limit 1;
  if v_emp.id is null then
    perform fn_pin_registrar_intento('checador', false);
    raise exception 'Ese PIN no es de nadie. Vuelve a intentar.';
  end if;
  perform fn_pin_registrar_intento('checador', true);

  select turno_max_horas into v_horas from asistencia_config where id = 'default';
  select a.* into v_ult from asistencia_eventos a
   where a.empleado_id = v_emp.id order by a.ocurrio_en desc limit 1;

  -- Dos toques seguidos no son dos checadas.
  if v_ult.id is not null and now() - v_ult.ocurrio_en < interval '2 minutes' then
    return query select v_emp.id, v_emp.nombre, v_ult.tipo, v_ult.ocurrio_en,
      to_char(v_ult.ocurrio_en at time zone 'America/Merida', 'HH24:MI'), true, null::int;
    return;
  end if;

  v_abierto := v_ult.id is not null and v_ult.tipo <> 'salida'
               and v_ult.ocurrio_en >= now() - make_interval(hours => coalesce(v_horas, 16));
  v_comiendo := v_abierto and v_ult.tipo = 'inicio_comida';

  v_tipo := coalesce(nullif(btrim(coalesce(p_tipo, '')), ''),
                     case when not v_abierto then 'entrada'
                          when v_comiendo then 'fin_comida'
                          else 'salida' end);

  if v_tipo = 'entrada' and v_abierto then
    raise exception 'Ya tienes un turno abierto. Checa tu salida.';
  elsif v_tipo in ('salida', 'inicio_comida') and not v_abierto then
    raise exception 'Todavia no has checado tu entrada.';
  elsif v_tipo = 'inicio_comida' and v_comiendo then
    raise exception 'Ya estabas en tu comida.';
  elsif v_tipo = 'fin_comida' and not v_comiendo then
    raise exception 'No tienes una comida abierta.';
  elsif v_tipo = 'salida' and v_comiendo then
    raise exception 'Regresa de comer antes de checar tu salida.';
  elsif v_tipo not in ('entrada', 'salida', 'inicio_comida', 'fin_comida') then
    raise exception 'Tipo de checada desconocido.';
  end if;

  if v_tipo = 'salida' then
    select (extract(epoch from (now() - min(a.ocurrio_en))) / 60)::int into v_minutos
      from asistencia_eventos a
     where a.empleado_id = v_emp.id and a.tipo = 'entrada'
       and a.ocurrio_en >= now() - make_interval(hours => coalesce(v_horas, 16));
  elsif v_tipo = 'fin_comida' then
    v_minutos := (extract(epoch from (now() - v_ult.ocurrio_en)) / 60)::int;
  end if;

  insert into asistencia_eventos (empleado_id, tipo, pantalla, origen)
  values (v_emp.id, v_tipo, left(coalesce(p_pantalla, ''), 40), 'kiosko')
  returning id into v_id;

  return query select v_emp.id, v_emp.nombre, v_tipo, a.ocurrio_en,
    to_char(a.ocurrio_en at time zone 'America/Merida', 'HH24:MI'), false, v_minutos
    from asistencia_eventos a where a.id = v_id;
end;
$function$;

revoke execute on function public.fn_asistencia_checar(text, text, text) from public;
grant execute on function public.fn_asistencia_checar(text, text, text) to anon, authenticated;
