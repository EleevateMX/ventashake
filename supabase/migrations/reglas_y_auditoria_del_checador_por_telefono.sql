-- Las reglas nuevas se escriben desde Admin, como las demas. Y el
-- historico tiene que poder DISTINGUIR una checada de telefono de una de
-- barra: si las pinta iguales, la evidencia mas debil se disfraza de la
-- fuerte y el punto de la geocerca se pierde.
--
-- Las dos funciones cambian de firma, asi que hay que tirar la anterior
-- en la misma transaccion: cambiar la firma no reemplaza, duplica.

drop function if exists public.fn_asistencia_config_guardar(int, int, int, boolean, int, int);

create or replace function public.fn_asistencia_config_guardar(
  p_jornada_min int, p_tolerancia_min int, p_comida_min int,
  p_comida_se_paga boolean, p_comida_max_min int, p_turno_max_horas int,
  p_telefono_activo boolean default null,
  p_tienda_lat double precision default null,
  p_tienda_lon double precision default null,
  p_radio_m int default null,
  p_precision_max_m int default null
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las reglas del checador.';
  end if;
  if p_turno_max_horas not between 4 and 24 then
    raise exception 'El turno maximo va entre 4 y 24 horas.';
  end if;
  if p_comida_min not between 0 and 240 or p_comida_max_min not between 0 and 480 then
    raise exception 'Los minutos de comida no tienen sentido.';
  end if;
  if p_jornada_min not between 60 and 900 or p_tolerancia_min not between 0 and 120 then
    raise exception 'La jornada o la tolerancia no tienen sentido.';
  end if;
  -- Topes de cordura de la geocerca. Un radio de 5 km no es una geocerca,
  -- es media ciudad; uno de 5 m rebota a quien esta parado en la barra
  -- porque el GPS de un telefono no es tan fino bajo techo.
  if p_radio_m is not null and p_radio_m not between 25 and 2000 then
    raise exception 'El radio va entre 25 y 2000 metros.';
  end if;
  if p_precision_max_m is not null and p_precision_max_m not between 20 and 2000 then
    raise exception 'La precision maxima va entre 20 y 2000 metros.';
  end if;
  if p_tienda_lat is not null and (p_tienda_lat not between -90 and 90 or p_tienda_lon not between -180 and 180) then
    raise exception 'Esas coordenadas no existen.';
  end if;

  update asistencia_config set
    jornada_min = p_jornada_min,
    tolerancia_min = p_tolerancia_min,
    comida_min = p_comida_min,
    comida_se_paga = p_comida_se_paga,
    comida_max_min = p_comida_max_min,
    turno_max_horas = p_turno_max_horas,
    telefono_activo = coalesce(p_telefono_activo, telefono_activo),
    tienda_lat = coalesce(p_tienda_lat, tienda_lat),
    tienda_lon = coalesce(p_tienda_lon, tienda_lon),
    radio_m = coalesce(p_radio_m, radio_m),
    precision_max_m = coalesce(p_precision_max_m, precision_max_m),
    actualizado_en = now()
  where id = 'default';
end;
$function$;

-- A los DOS, que es la trampa que ya nos comimos por las dos caras.
revoke execute on function public.fn_asistencia_config_guardar(int, int, int, boolean, int, int, boolean, double precision, double precision, int, int) from public;
revoke execute on function public.fn_asistencia_config_guardar(int, int, int, boolean, int, int, boolean, double precision, double precision, int, int) from anon;

-- El historico de un dia, ahora con de donde vino cada checada.
drop function if exists public.fn_asistencia_eventos_dia(date);

create or replace function public.fn_asistencia_eventos_dia(p_dia date)
returns table(
  id uuid, empleado_id uuid, nombre text, tipo text, hora text,
  pantalla text, origen text, nota text, corrige_evento_id uuid,
  reemplazado boolean, autorizo text,
  distancia_m integer, precision_m integer
)
language sql stable security definer set search_path to 'public'
as $function$
  select a.id, a.empleado_id, e.nombre, a.tipo,
         to_char(a.ocurrio_en at time zone 'America/Merida', 'HH24:MI'),
         a.pantalla, a.origen, a.nota, a.corrige_evento_id,
         exists (select 1 from asistencia_eventos c where c.corrige_evento_id = a.id),
         (select x.nombre from empleados x where x.id = a.autorizado_por),
         round(a.distancia_m)::int, round(a.precision_m)::int
    from asistencia_eventos a
    join empleados e on e.id = a.empleado_id
   where fn_es_jefe()
     and (a.ocurrio_en at time zone 'America/Merida')::date = p_dia
   order by a.ocurrio_en;
$function$;

revoke execute on function public.fn_asistencia_eventos_dia(date) from public;
revoke execute on function public.fn_asistencia_eventos_dia(date) from anon;
