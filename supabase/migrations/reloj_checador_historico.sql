-- El historico que ve gerencia, y las correcciones.
--
-- El turno SE CALCULA de los eventos, no se guarda. Es la decision mas
-- importante del diseno: si guardaramos "turno con entrada y salida", el
-- dia que alguien se va sin checar -y va a pasar- el registro se rompe o
-- hay que inventarle una hora. Con eventos sueltos, un olvido se ve como
-- lo que es: un pendiente.
drop function if exists public.fn_asistencia_resumen(date, date);

create function public.fn_asistencia_resumen(p_desde date, p_hasta date)
returns table(
  empleado_id uuid, nombre text, dia date,
  entrada timestamptz, salida timestamptz,
  entrada_hora text, salida_hora text,
  minutos_bruto int, minutos_comida int, minutos_trabajados int,
  sin_salida boolean, comida_abierta boolean, comida_larga boolean, corregido boolean
)
language sql stable security definer set search_path to 'public'
as $function$
  with cfg as (select * from asistencia_config where id = 'default'),
  vigentes as (
    -- Lo corregido se cae; su correccion ocupa su lugar. El original NO se
    -- borra: se sigue viendo en fn_asistencia_eventos_dia.
    select a.* from asistencia_eventos a
     where not exists (select 1 from asistencia_eventos c where c.corrige_evento_id = a.id)
  ),
  conDia as (
    select v.*, (v.ocurrio_en at time zone 'America/Merida')::date as dia
      from vigentes v
     where (v.ocurrio_en at time zone 'America/Merida')::date between p_desde and p_hasta
  ),
  -- Cada comida se empareja con el siguiente "fin_comida" de esa persona
  -- ese dia. Una comida sin regreso no suma minutos y se marca aparte:
  -- inventarle una hora de regreso seria inventar el dato.
  comidas as (
    select c.empleado_id, c.dia, c.ocurrio_en as inicio,
           (select min(f.ocurrio_en) from conDia f
             where f.empleado_id = c.empleado_id and f.dia = c.dia
               and f.tipo = 'fin_comida' and f.ocurrio_en > c.ocurrio_en) as fin
      from conDia c where c.tipo = 'inicio_comida'
  ),
  porDia as (
    select c.empleado_id, c.dia,
           min(c.ocurrio_en) filter (where c.tipo = 'entrada') as entrada,
           max(c.ocurrio_en) filter (where c.tipo = 'salida')  as salida,
           bool_or(c.corrige_evento_id is not null)            as corregido
      from conDia c group by c.empleado_id, c.dia
  ),
  comidaPorDia as (
    select m.empleado_id, m.dia,
           coalesce(sum((extract(epoch from (m.fin - m.inicio)) / 60)::int)
                    filter (where m.fin is not null), 0) as minutos,
           bool_or(m.fin is null) as abierta
      from comidas m group by m.empleado_id, m.dia
  )
  select d.empleado_id, e.nombre, d.dia, d.entrada, d.salida,
         to_char(d.entrada at time zone 'America/Merida', 'HH24:MI'),
         to_char(d.salida  at time zone 'America/Merida', 'HH24:MI'),
         bruto.min,
         coalesce(cm.minutos, 0),
         case when bruto.min is null then null
              when (select comida_se_paga from cfg) then bruto.min
              else greatest(0, bruto.min - coalesce(cm.minutos, 0)) end,
         d.entrada is not null and d.salida is null,
         coalesce(cm.abierta, false),
         coalesce(cm.minutos, 0) > (select comida_max_min from cfg),
         d.corregido
    from porDia d
    join empleados e on e.id = d.empleado_id
    left join comidaPorDia cm on cm.empleado_id = d.empleado_id and cm.dia = d.dia
    cross join lateral (
      select case when d.entrada is not null and d.salida is not null
                  then (extract(epoch from (d.salida - d.entrada)) / 60)::int end as min
    ) bruto
   where fn_es_jefe()
   order by d.dia desc, e.nombre;
$function$;

revoke execute on function public.fn_asistencia_resumen(date, date) from public;
revoke execute on function public.fn_asistencia_resumen(date, date) from anon;

-- Las checadas sueltas de un dia, para auditar: incluye las corregidas y
-- desde que pantalla se checo cada una.
create or replace function public.fn_asistencia_eventos_dia(p_dia date)
returns table(id uuid, empleado_id uuid, nombre text, tipo text,
              hora text, pantalla text, origen text, nota text,
              corrige_evento_id uuid, reemplazado boolean, autorizo text)
language sql stable security definer set search_path to 'public'
as $function$
  select a.id, a.empleado_id, e.nombre, a.tipo,
         to_char(a.ocurrio_en at time zone 'America/Merida', 'HH24:MI'),
         a.pantalla, a.origen, a.nota, a.corrige_evento_id,
         exists (select 1 from asistencia_eventos c where c.corrige_evento_id = a.id),
         (select x.nombre from empleados x where x.id = a.autorizado_por)
    from asistencia_eventos a
    join empleados e on e.id = a.empleado_id
   where fn_es_jefe() and (a.ocurrio_en at time zone 'America/Merida')::date = p_dia
   order by a.ocurrio_en;
$function$;

revoke execute on function public.fn_asistencia_eventos_dia(date) from public;
revoke execute on function public.fn_asistencia_eventos_dia(date) from anon;

-- Corregir es AGREGAR, nunca tocar lo que ya esta. Queda quien autorizo y
-- por que. Sin motivo no se puede: una correccion que no dice por que no
-- sirve de nada el dia que alguien pregunte.
create or replace function public.fn_asistencia_corregir(
  p_evento_id uuid, p_hora timestamptz, p_nota text
) returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_orig record; v_yo uuid; v_id uuid;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede corregir una checada.';
  end if;
  if nullif(btrim(coalesce(p_nota, '')), '') is null then
    raise exception 'Escribe por que se corrige: una correccion sin motivo no sirve de nada.';
  end if;

  select * into v_orig from asistencia_eventos where id = p_evento_id;
  if v_orig.id is null then
    raise exception 'Esa checada no existe.';
  end if;
  if exists (select 1 from asistencia_eventos c where c.corrige_evento_id = p_evento_id) then
    raise exception 'Esa checada ya fue corregida. Corrige la correccion.';
  end if;
  if p_hora > now() + interval '5 minutes' then
    raise exception 'No se puede checar en el futuro.';
  end if;

  v_yo := fn_empleado_actual();

  insert into asistencia_eventos
    (empleado_id, tipo, ocurrio_en, origen, nota, corrige_evento_id, autorizado_por)
  values (v_orig.empleado_id, v_orig.tipo, p_hora, 'admin', btrim(p_nota), p_evento_id, v_yo)
  returning id into v_id;

  return v_id;
end;
$function$;

revoke execute on function public.fn_asistencia_corregir(uuid, timestamptz, text) from public;
revoke execute on function public.fn_asistencia_corregir(uuid, timestamptz, text) from anon;
