-- =============================================================================
-- Checador: una sola comida por jornada, y la salida manda (06/10/26).
--
-- Lo que pasaba: con el turno abierto la pantalla ofrecía «Salgo a comer» y
-- «Salida» como iguales, y la gente al terminar tocaba «Salgo a comer» por
-- error. Y después de regresar de comer, el sistema volvía a ofrecer la
-- comida, que ya no corresponde.
--
-- Lo que cambia, EN EL SERVIDOR (la pantalla solo pinta lo que `puede`):
--   fuera                     → entrada
--   dentro, sin comida aún    → salida, inicio_comida   (salida primero)
--   comiendo                  → fin_comida
--   dentro, ya comió          → salida                  (comer ya no existe)
--   salida                    → fuera; no hay más movimientos de esa jornada
-- fn_asistencia_checar vuelve a validarlo: una segunda comida se rechaza
-- aunque una pantalla vieja la mande. Nada se edita ni se borra, como
-- siempre; la historia sigue siendo de eventos.
-- =============================================================================

-- Cambia el tipo de retorno (dos columnas nuevas): hay que tirarla, crearla
-- y volver a dar los permisos. Abierta a anon a propósito: el kiosko en
-- modo cajero corre como anon y el PIN es la credencial (CLAUDE.md 2.8).
drop function if exists public.fn_asistencia_estado(text);
create function public.fn_asistencia_estado(p_pin text)
returns table(nombre text, estado text, puede text[], desde_hora text, comio boolean, comida_hora text)
language plpgsql stable security definer set search_path to 'public', 'extensions'
as $function$
declare v_emp record; v_ult record; v_horas int; v_entrada timestamptz; v_ini timestamptz; v_fin timestamptz;
begin
  if fn_pin_fallos_recientes('checador') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  select e.id, e.nombre into v_emp
    from empleados e
   where e.activo and e.pin_hash is not null and e.pin_hash = crypt(p_pin, e.pin_hash)
   order by e.created_at limit 1;

  if v_emp.id is null then
    raise exception 'Ese PIN no es de nadie. Vuelve a intentar.';
  end if;

  select turno_max_horas into v_horas from asistencia_config where id = 'default';

  select a.* into v_ult from asistencia_eventos a
   where a.empleado_id = v_emp.id order by a.ocurrio_en desc limit 1;

  -- Una entrada vieja ya no cuenta como turno abierto: es de ayer.
  if v_ult.id is null
     or v_ult.tipo = 'salida'
     or v_ult.ocurrio_en < now() - make_interval(hours => coalesce(v_horas, 16)) then
    return query select v_emp.nombre, 'fuera'::text, array['entrada']::text[], null::text, false, null::text;
    return;
  end if;

  -- La jornada empieza en la última entrada; la comida de ESTA jornada es
  -- la que cae después de ella.
  select max(a.ocurrio_en) into v_entrada from asistencia_eventos a
   where a.empleado_id = v_emp.id and a.tipo = 'entrada'
     and a.ocurrio_en >= now() - make_interval(hours => coalesce(v_horas, 16));
  select min(a.ocurrio_en) into v_ini from asistencia_eventos a
   where a.empleado_id = v_emp.id and a.tipo = 'inicio_comida' and a.ocurrio_en > coalesce(v_entrada, '-infinity');
  select min(a.ocurrio_en) into v_fin from asistencia_eventos a
   where a.empleado_id = v_emp.id and a.tipo = 'fin_comida' and a.ocurrio_en > coalesce(v_ini, 'infinity');

  if v_ult.tipo = 'inicio_comida' then
    return query select v_emp.nombre, 'comiendo'::text, array['fin_comida']::text[],
                        to_char(v_ult.ocurrio_en at time zone 'America/Merida', 'HH24:MI'), false, null::text;
  elsif v_fin is not null then
    -- Ya comió: lo único que sigue es la salida.
    return query select v_emp.nombre, 'dentro'::text, array['salida']::text[],
                        to_char(coalesce(v_entrada, v_ult.ocurrio_en) at time zone 'America/Merida', 'HH24:MI'), true,
                        to_char(v_ini at time zone 'America/Merida', 'HH24:MI') || '–' || to_char(v_fin at time zone 'America/Merida', 'HH24:MI');
  else
    -- La salida va primero: es la que manda y la que más se confundía.
    return query select v_emp.nombre, 'dentro'::text, array['salida', 'inicio_comida']::text[],
                        to_char(coalesce(v_entrada, v_ult.ocurrio_en) at time zone 'America/Merida', 'HH24:MI'), false, null::text;
  end if;
end;
$function$;
grant execute on function public.fn_asistencia_estado(text) to anon, authenticated;

-- Misma firma: se reemplaza. Único cambio: una segunda comida en la misma
-- jornada se rechaza con un mensaje que dice qué sigue.
create or replace function public.fn_asistencia_checar(p_pin text, p_pantalla text default null::text, p_tipo text default null::text, p_origen text default 'kiosko'::text, p_lat double precision default null::double precision, p_lon double precision default null::double precision, p_precision_m double precision default null::double precision)
returns table(empleado_id uuid, nombre text, tipo text, ocurrio_en timestamp with time zone, hora text, repetida boolean, minutos integer, distancia_m integer)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  v_emp record; v_ult record; v_tipo text; v_id uuid; v_minutos int;
  v_horas int; v_abierto boolean; v_comiendo boolean;
  v_cfg record; v_origen text; v_dist double precision;
  v_entrada timestamptz; v_ini timestamptz; v_fin timestamptz;
begin
  if fn_pin_fallos_recientes('checador') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  v_origen := case when p_origen = 'telefono' then 'telefono' else 'kiosko' end;
  select * into v_cfg from asistencia_config where id = 'default';

  if v_origen = 'telefono' then
    if not coalesce(v_cfg.telefono_activo, false) then
      raise exception 'Checar desde el telefono esta apagado. Checa en la barra.';
    end if;
    if v_cfg.tienda_lat is null or v_cfg.tienda_lon is null then
      raise exception 'Todavia no esta marcado donde esta la tienda. Avisale a gerencia.';
    end if;
    if p_lat is null or p_lon is null then
      raise exception 'No pudimos leer tu ubicacion. Dale permiso al navegador y vuelve a intentar.';
    end if;
    if p_precision_m is not null and p_precision_m > v_cfg.precision_max_m then
      raise exception 'Tu telefono esta dando una ubicacion muy vaga (mas o menos % m). Sal al aire libre un momento o checa en la barra.',
        round(p_precision_m);
    end if;
    v_dist := fn_metros_entre(v_cfg.tienda_lat, v_cfg.tienda_lon, p_lat, p_lon);
    if v_dist > v_cfg.radio_m then
      raise exception 'Estas a % m de la tienda y el limite son % m. Hay que checar desde aqui.',
        round(v_dist), v_cfg.radio_m;
    end if;
  end if;

  select e.id, e.nombre into v_emp
    from empleados e
   where e.activo and e.pin_hash is not null and e.pin_hash = crypt(p_pin, e.pin_hash)
   order by e.created_at limit 1;

  if v_emp.id is null then
    perform fn_pin_registrar_intento('checador', false);
    raise exception 'Ese PIN no es de nadie. Vuelve a intentar.';
  end if;
  perform fn_pin_registrar_intento('checador', true);

  v_horas := coalesce(v_cfg.turno_max_horas, 16);
  select a.* into v_ult from asistencia_eventos a
   where a.empleado_id = v_emp.id order by a.ocurrio_en desc limit 1;

  if v_ult.id is not null and now() - v_ult.ocurrio_en < interval '2 minutes' then
    return query select v_emp.id, v_emp.nombre, v_ult.tipo, v_ult.ocurrio_en,
      to_char(v_ult.ocurrio_en at time zone 'America/Merida', 'HH24:MI'), true,
      null::int, round(v_dist)::int;
    return;
  end if;

  v_abierto := v_ult.id is not null
               and v_ult.tipo <> 'salida'
               and v_ult.ocurrio_en >= now() - make_interval(hours => v_horas);
  v_comiendo := v_abierto and v_ult.tipo = 'inicio_comida';

  v_tipo := coalesce(nullif(btrim(coalesce(p_tipo, '')), ''),
                     case when not v_abierto then 'entrada'
                          when v_comiendo then 'fin_comida'
                          else 'salida' end);

  -- La comida de ESTA jornada: la que cae después de la última entrada.
  if v_abierto then
    select max(a.ocurrio_en) into v_entrada from asistencia_eventos a
     where a.empleado_id = v_emp.id and a.tipo = 'entrada'
       and a.ocurrio_en >= now() - make_interval(hours => v_horas);
    select min(a.ocurrio_en) into v_ini from asistencia_eventos a
     where a.empleado_id = v_emp.id and a.tipo = 'inicio_comida' and a.ocurrio_en > coalesce(v_entrada, '-infinity');
    select min(a.ocurrio_en) into v_fin from asistencia_eventos a
     where a.empleado_id = v_emp.id and a.tipo = 'fin_comida' and a.ocurrio_en > coalesce(v_ini, 'infinity');
  end if;

  if v_tipo = 'entrada' and v_abierto then
    raise exception 'Ya tienes un turno abierto. Checa tu salida.';
  elsif v_tipo in ('salida', 'inicio_comida') and not v_abierto then
    raise exception 'Todavia no has checado tu entrada.';
  elsif v_tipo = 'inicio_comida' and v_comiendo then
    raise exception 'Ya estabas en tu comida.';
  elsif v_tipo = 'inicio_comida' and v_fin is not null then
    raise exception 'Ya tomaste tu comida de hoy (% a %). Lo que sigue es tu salida.',
      to_char(v_ini at time zone 'America/Merida', 'HH24:MI'), to_char(v_fin at time zone 'America/Merida', 'HH24:MI');
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
       and a.ocurrio_en >= now() - make_interval(hours => v_horas);
  elsif v_tipo = 'fin_comida' then
    v_minutos := (extract(epoch from (now() - v_ult.ocurrio_en)) / 60)::int;
  end if;

  insert into asistencia_eventos
    (empleado_id, tipo, pantalla, origen, lat, lon, precision_m, distancia_m)
  values (v_emp.id, v_tipo, left(coalesce(p_pantalla, ''), 40), v_origen,
          p_lat, p_lon, p_precision_m, v_dist)
  returning id into v_id;

  return query select v_emp.id, v_emp.nombre, v_tipo, a.ocurrio_en,
    to_char(a.ocurrio_en at time zone 'America/Merida', 'HH24:MI'), false,
    v_minutos, round(v_dist)::int
    from asistencia_eventos a where a.id = v_id;
end;
$function$;
