-- El checador desde el telefono: con geocerca, y sin fingir que prueba lo
-- mismo que el de la barra.
--
-- Un checador existe para probar que alguien estuvo AQUI a esta hora. El
-- de la barra lo prueba porque esa pantalla esta clavada en la barra. El
-- del telefono NO lo prueba: las coordenadas las manda el telefono, y un
-- telefono puede mentir (Android trae simulacion de ubicacion en las
-- opciones de desarrollador). Por eso aqui no se pone un candado que
-- pretenda ser prueba; se ponen tres cosas honestas:
--
--   1. La geocerca se valida EN EL SERVIDOR, no en la pantalla. Lo que
--      llega del telefono son coordenadas crudas; la decision de si eso
--      cae dentro la toma esta funcion. Una pantalla no puede aprobarse
--      sola su propia checada.
--   2. Se guarda a que DISTANCIA quedo y con que PRECISION la reporto el
--      telefono. "Checo a 8 m con +/-12 m" y "checo a 119 m con +/-450 m"
--      no valen lo mismo, y el historico tiene que poder distinguirlas.
--      Una precision vaga se rechaza: un radio de error de media cuadra
--      convierte la geocerca en un adorno.
--   3. La checada queda marcada como origen='telefono' y se ve distinta
--      en Admin. Es evidencia mas debil y no se disfraza de la otra.
--
-- Viene apagado. Prenderlo es una decision de gerencia, no un valor por
-- omision que alguien se encuentre puesto.

-- ---------------------------------------------------------------- config
alter table asistencia_config
  add column if not exists telefono_activo boolean not null default false,
  add column if not exists tienda_lat double precision,
  add column if not exists tienda_lon double precision,
  add column if not exists radio_m int not null default 120,
  add column if not exists precision_max_m int not null default 150;

comment on column asistencia_config.radio_m is
  'Que tan lejos de la tienda se acepta una checada de telefono, en metros.';
comment on column asistencia_config.precision_max_m is
  'Si el telefono reporta un error mayor a esto, no se acepta: una ubicacion vaga no acota nada.';

-- --------------------------------------------------------------- eventos
alter table asistencia_eventos
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists precision_m double precision,
  add column if not exists distancia_m double precision;

alter table asistencia_eventos drop constraint if exists asistencia_eventos_origen_check;
alter table asistencia_eventos add constraint asistencia_eventos_origen_check
  check (origen in ('kiosko', 'telefono', 'admin'));

-- ------------------------------------------------------------- distancia
-- Haversine a mano. `earthdistance` pide `cube`, y meter dos extensiones
-- para una resta de coordenadas no se paga sola.
create or replace function public.fn_metros_entre(
  p_lat1 double precision, p_lon1 double precision,
  p_lat2 double precision, p_lon2 double precision
) returns double precision
language sql immutable parallel safe
as $function$
  select 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lon2 - p_lon1) / 2), 2)
  ));
$function$;

-- ----------------------------------------------------------- la checada
-- Se EXTIENDE la de siempre en vez de escribir una gemela para telefono.
-- Las reglas de transicion (no puedes salir sin haber entrado, no puedes
-- regresar de una comida que no abriste) son las mismas vengas de donde
-- vengas, y dos copias de esas reglas se separan solas — ya nos paso con
-- kiosko y POS. Lo unico que agrega el telefono es un filtro ANTES de
-- insertar.
--
-- Cambiar la firma no reemplaza la funcion: la duplica. Por eso la vieja
-- se tira en esta misma transaccion, y los parametros nuevos llevan
-- DEFAULT para que la llamada de 3 argumentos del kiosko siga entrando
-- sin tocar el kiosko.
drop function if exists public.fn_asistencia_checar(text, text, text);

create or replace function public.fn_asistencia_checar(
  p_pin text,
  p_pantalla text default null,
  p_tipo text default null,
  p_origen text default 'kiosko',
  p_lat double precision default null,
  p_lon double precision default null,
  p_precision_m double precision default null
)
returns table(
  empleado_id uuid, nombre text, tipo text, ocurrio_en timestamptz,
  hora text, repetida boolean, minutos integer, distancia_m integer
)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  v_emp record; v_ult record; v_tipo text; v_id uuid; v_minutos int;
  v_horas int; v_abierto boolean; v_comiendo boolean;
  v_cfg record; v_origen text; v_dist double precision;
begin
  if fn_pin_fallos_recientes('checador') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  v_origen := case when p_origen = 'telefono' then 'telefono' else 'kiosko' end;
  select * into v_cfg from asistencia_config where id = 'default';

  -- La geocerca se revisa ANTES del PIN a proposito: quien esta lejos no
  -- tiene por que descubrir si un PIN existe o no probandolo desde su casa.
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

  -- Dos toques seguidos no son dos checadas.
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

-- Abierta a `anon` como la de siempre: el kiosko en modo cajero corre como
-- `anon` y el PIN ES la credencial. El telefono entra por la misma puerta.
grant execute on function public.fn_asistencia_checar(text, text, text, text, double precision, double precision, double precision) to anon, authenticated;
