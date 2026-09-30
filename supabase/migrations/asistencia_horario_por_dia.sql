-- Horario por dia de la semana dentro de una regla, y excepciones de una
-- fecha (pedido de Perla, 30/09).
--
-- El turno de tarde es 14:30-22:30 entre semana y 14:00-22:00 el fin de
-- semana; hay quien repone horas en sabado. Con UN horario por regla el
-- sistema marcaba retardos que no eran y dejaba pasar los que si.
--
-- Como se resuelve cada campo de un dia, del mas especifico al general:
--   excepcion de esa fecha  ->  el dia de la semana de su regla
--   ->  la regla  ->  la regla general
-- Un campo vacio en cualquier nivel hereda el siguiente. Una regla sin
-- dias configurados se comporta exactamente como antes: el dia del
-- despliegue no se mueve ningun numero.
--
-- Las checadas no se tocan (siguen siendo eventos que nada edita); lo que
-- cambia es contra que se comparan.

create table if not exists asistencia_regla_dias (
  regla_id       uuid not null references asistencia_reglas(id) on delete cascade,
  -- 0 = domingo ... 6 = sabado, igual que extract(dow).
  dow            smallint not null check (dow between 0 and 6),
  hora_entrada   time,
  hora_salida    time,
  jornada_min    int check (jornada_min between 0 and 1440),
  tolerancia_min int check (tolerancia_min between 0 and 240),
  comida_min     int check (comida_min between 0 and 240),
  comida_max_min int check (comida_max_min between 0 and 480),
  comida_se_paga boolean,
  actualizado_en timestamptz not null default now(),
  primary key (regla_id, dow)
);
alter table asistencia_regla_dias enable row level security;
revoke all on asistencia_regla_dias from public, anon, authenticated;

create table if not exists asistencia_excepciones (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references empleados(id) on delete cascade,
  dia            date not null,
  hora_entrada   time,
  hora_salida    time,
  jornada_min    int check (jornada_min between 0 and 1440),
  tolerancia_min int check (tolerancia_min between 0 and 240),
  -- Obligatoria: una excepcion sin motivo es un retardo borrado sin rastro.
  nota           text not null check (length(trim(nota)) > 0),
  creada_por     uuid references empleados(id),
  creada_en      timestamptz not null default now(),
  unique (empleado_id, dia)
);
alter table asistencia_excepciones enable row level security;
revoke all on asistencia_excepciones from public, anon, authenticated;

-- ------------------------------------------------------------------------
-- El resumen, resuelto por dia. Cambia el tipo de retorno (cuatro columnas
-- nuevas al final), asi que se tira y se crea: create or replace no puede,
-- y dejar la vieja al lado seria tener dos resumenes.
-- ------------------------------------------------------------------------
drop function if exists public.fn_asistencia_resumen(date, date);
create function public.fn_asistencia_resumen(p_desde date, p_hasta date)
returns table(
  empleado_id uuid, nombre text, dia date,
  entrada timestamptz, salida timestamptz, entrada_hora text, salida_hora text,
  minutos_bruto integer, minutos_comida integer, minutos_trabajados integer,
  sin_salida boolean, comida_abierta boolean, comida_larga boolean, corregido boolean,
  regla text, jornada_min integer, comida_esperada_min integer, comida_se_paga boolean,
  minutos_tarde integer,
  entrada_esperada text, salida_esperada text, minutos_antes integer, excepcion text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (select * from asistencia_config where id = 'default'),
  reglaDe as (
    select e.id as empleado_id, e.nombre, r.id as regla_id, r.nombre as regla,
           coalesce(r.jornada_min,    c.jornada_min)    as jornada_min,
           coalesce(r.tolerancia_min, c.tolerancia_min) as tolerancia_min,
           coalesce(r.comida_min,     c.comida_min)     as comida_min,
           coalesce(r.comida_max_min, c.comida_max_min) as comida_max_min,
           coalesce(r.comida_se_paga, c.comida_se_paga) as comida_se_paga,
           r.hora_entrada, r.hora_salida
      from empleados e
      cross join cfg c
      left join asistencia_reglas r on r.id = e.asistencia_regla_id and r.activo
  ),
  vigentes as (
    select a.* from asistencia_eventos a
     where not exists (select 1 from asistencia_eventos c where c.corrige_evento_id = a.id)
  ),
  conDia as (
    select v.*, (v.ocurrio_en at time zone 'America/Merida')::date as dia
      from vigentes v
     where (v.ocurrio_en at time zone 'America/Merida')::date between p_desde and p_hasta
  ),
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
  ),
  -- Cada campo del dia: excepcion -> dia de la semana -> regla -> general.
  efectivo as (
    select d.empleado_id, d.dia, d.entrada, d.salida, d.corregido,
           g.nombre, g.regla,
           coalesce(x.jornada_min,    rd.jornada_min,    g.jornada_min)    as jornada_min,
           coalesce(x.tolerancia_min, rd.tolerancia_min, g.tolerancia_min) as tolerancia_min,
           coalesce(rd.comida_min,     g.comida_min)     as comida_min,
           coalesce(rd.comida_max_min, g.comida_max_min) as comida_max_min,
           coalesce(rd.comida_se_paga, g.comida_se_paga) as comida_se_paga,
           coalesce(x.hora_entrada, rd.hora_entrada, g.hora_entrada) as hora_entrada,
           coalesce(x.hora_salida,  rd.hora_salida,  g.hora_salida)  as hora_salida,
           x.nota as excepcion
      from porDia d
      join reglaDe g on g.empleado_id = d.empleado_id
      left join asistencia_regla_dias rd
             on rd.regla_id = g.regla_id and rd.dow = extract(dow from d.dia)::int
      left join asistencia_excepciones x
             on x.empleado_id = d.empleado_id and x.dia = d.dia
  )
  select f.empleado_id, f.nombre, f.dia, f.entrada, f.salida,
         to_char(f.entrada at time zone 'America/Merida', 'HH24:MI'),
         to_char(f.salida  at time zone 'America/Merida', 'HH24:MI'),
         bruto.min,
         coalesce(cm.minutos, 0),
         case when bruto.min is null then null
              when f.comida_se_paga then bruto.min
              else greatest(0, bruto.min - coalesce(cm.minutos, 0)) end,
         f.entrada is not null and f.salida is null,
         coalesce(cm.abierta, false),
         coalesce(cm.minutos, 0) > f.comida_max_min,
         f.corregido,
         f.regla, f.jornada_min, f.comida_min, f.comida_se_paga,
         -- null = no hay horario con que comparar. 0 = dentro de tolerancia.
         case when f.hora_entrada is null or f.entrada is null then null
              when tarde.min > f.tolerancia_min then tarde.min
              else 0 end,
         to_char(f.hora_entrada, 'HH24:MI'),
         to_char(f.hora_salida,  'HH24:MI'),
         -- Salida anticipada, con la misma tolerancia. Se compara contra el
         -- MOMENTO esperado de salida (un turno que cruza la medianoche sale
         -- al dia siguiente), no contra la hora del reloj suelta.
         case when f.hora_salida is null or f.salida is null then null
              when antes.min > f.tolerancia_min then antes.min
              else 0 end,
         f.excepcion
    from efectivo f
    left join comidaPorDia cm on cm.empleado_id = f.empleado_id and cm.dia = f.dia
    cross join lateral (
      select case when f.entrada is not null and f.salida is not null
                  then (extract(epoch from (f.salida - f.entrada)) / 60)::int end as min
    ) bruto
    cross join lateral (
      select case when f.hora_entrada is not null and f.entrada is not null
                  then (extract(epoch from (
                         (f.entrada at time zone 'America/Merida')::time - f.hora_entrada
                       )) / 60)::int end as min
    ) tarde
    cross join lateral (
      select case when f.hora_salida is not null and f.salida is not null
                  then (extract(epoch from (
                         ((f.dia + f.hora_salida
                           + case when f.hora_entrada is not null and f.hora_salida <= f.hora_entrada
                                  then interval '1 day' else interval '0' end)
                          at time zone 'America/Merida')
                         - f.salida
                       )) / 60)::int end as min
    ) antes
   where fn_es_jefe()
   order by f.dia desc, f.nombre;
$function$;

revoke execute on function public.fn_asistencia_resumen(date, date) from public, anon;
grant execute on function public.fn_asistencia_resumen(date, date) to authenticated;

-- ------------------------------------------------------------------------
-- Horario por dia de una regla (Admin -> Reloj checador -> Reglas por persona)
-- ------------------------------------------------------------------------
create or replace function public.fn_asistencia_reglas_dias()
returns table(regla_id uuid, dow smallint, hora_entrada time, hora_salida time,
              jornada_min int, tolerancia_min int, comida_min int, comida_max_min int,
              comida_se_paga boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select d.regla_id, d.dow, d.hora_entrada, d.hora_salida, d.jornada_min, d.tolerancia_min,
         d.comida_min, d.comida_max_min, d.comida_se_paga
    from asistencia_regla_dias d
   where fn_es_jefe()
   order by d.regla_id, d.dow;
$function$;

-- Pone el MISMO horario a varios dias a la vez ("S-D -> 14:00 a 22:00").
create or replace function public.fn_asistencia_regla_dias_guardar(
  p_regla_id uuid, p_dias int[],
  p_hora_entrada time, p_hora_salida time,
  p_jornada_min int, p_tolerancia_min int,
  p_comida_min int, p_comida_max_min int, p_comida_se_paga boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar horarios.';
  end if;
  if not exists (select 1 from asistencia_reglas where id = p_regla_id and activo) then
    raise exception 'Esa regla ya no existe: recarga la pagina.';
  end if;
  if p_dias is null or cardinality(p_dias) = 0 then
    raise exception 'Marca al menos un dia.';
  end if;
  if exists (select 1 from unnest(p_dias) d where d not between 0 and 6) then
    raise exception 'Dia invalido.';
  end if;
  if (p_hora_entrada is null) <> (p_hora_salida is null) then
    raise exception 'Pon entrada Y salida, o ninguna de las dos.';
  end if;
  if p_hora_entrada is null and p_hora_salida is null and p_jornada_min is null
     and p_tolerancia_min is null and p_comida_min is null and p_comida_max_min is null
     and p_comida_se_paga is null then
    raise exception 'No hay nada que guardar: deja al menos un campo, o quita esos dias.';
  end if;

  insert into asistencia_regla_dias as t
    (regla_id, dow, hora_entrada, hora_salida, jornada_min, tolerancia_min,
     comida_min, comida_max_min, comida_se_paga)
  select p_regla_id, d::smallint, p_hora_entrada, p_hora_salida, p_jornada_min, p_tolerancia_min,
         p_comida_min, p_comida_max_min, p_comida_se_paga
    from unnest(p_dias) d
  on conflict (regla_id, dow) do update set
    hora_entrada = excluded.hora_entrada, hora_salida = excluded.hora_salida,
    jornada_min = excluded.jornada_min, tolerancia_min = excluded.tolerancia_min,
    comida_min = excluded.comida_min, comida_max_min = excluded.comida_max_min,
    comida_se_paga = excluded.comida_se_paga, actualizado_en = now();
end;
$function$;

-- Esos dias vuelven al horario de la regla.
create or replace function public.fn_asistencia_regla_dias_quitar(p_regla_id uuid, p_dias int[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar horarios.';
  end if;
  delete from asistencia_regla_dias
   where regla_id = p_regla_id and dow = any (p_dias::smallint[]);
end;
$function$;

-- ------------------------------------------------------------------------
-- Excepciones de una fecha, por persona.
-- ------------------------------------------------------------------------
create or replace function public.fn_asistencia_excepciones(p_desde date, p_hasta date)
returns table(id uuid, empleado_id uuid, nombre text, dia date,
              hora_entrada time, hora_salida time, jornada_min int, tolerancia_min int,
              nota text, creada_por text, creada_en timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select x.id, x.empleado_id, e.nombre, x.dia, x.hora_entrada, x.hora_salida,
         x.jornada_min, x.tolerancia_min, x.nota, c.nombre, x.creada_en
    from asistencia_excepciones x
    join empleados e on e.id = x.empleado_id
    left join empleados c on c.id = x.creada_por
   where fn_es_jefe() and x.dia between p_desde and p_hasta
   order by x.dia desc, e.nombre;
$function$;

create or replace function public.fn_asistencia_excepcion_guardar(
  p_empleado_id uuid, p_dia date,
  p_hora_entrada time, p_hora_salida time,
  p_jornada_min int, p_tolerancia_min int, p_nota text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede poner excepciones de horario.';
  end if;
  if nullif(trim(coalesce(p_nota, '')), '') is null then
    raise exception 'Escribe el motivo: una excepcion sin motivo es un retardo borrado sin rastro.';
  end if;
  if p_dia is null then
    raise exception 'Elige la fecha.';
  end if;
  if (p_hora_entrada is null) <> (p_hora_salida is null) then
    raise exception 'Pon entrada Y salida, o ninguna de las dos.';
  end if;
  if p_hora_entrada is null and p_jornada_min is null and p_tolerancia_min is null then
    raise exception 'La excepcion no cambia nada: pon el horario de ese dia.';
  end if;
  if not exists (select 1 from empleados where id = p_empleado_id) then
    raise exception 'Esa persona no existe.';
  end if;

  insert into asistencia_excepciones as t
    (empleado_id, dia, hora_entrada, hora_salida, jornada_min, tolerancia_min, nota, creada_por)
  values (p_empleado_id, p_dia, p_hora_entrada, p_hora_salida, p_jornada_min, p_tolerancia_min,
          trim(p_nota), fn_empleado_actual())
  on conflict (empleado_id, dia) do update set
    hora_entrada = excluded.hora_entrada, hora_salida = excluded.hora_salida,
    jornada_min = excluded.jornada_min, tolerancia_min = excluded.tolerancia_min,
    nota = excluded.nota, creada_por = excluded.creada_por, creada_en = now()
  returning t.id into v_id;
  return v_id;
end;
$function$;

create or replace function public.fn_asistencia_excepcion_borrar(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede quitar excepciones de horario.';
  end if;
  delete from asistencia_excepciones where id = p_id;
end;
$function$;

revoke execute on function public.fn_asistencia_reglas_dias() from public, anon;
revoke execute on function public.fn_asistencia_regla_dias_guardar(uuid, int[], time, time, int, int, int, int, boolean) from public, anon;
revoke execute on function public.fn_asistencia_regla_dias_quitar(uuid, int[]) from public, anon;
revoke execute on function public.fn_asistencia_excepciones(date, date) from public, anon;
revoke execute on function public.fn_asistencia_excepcion_guardar(uuid, date, time, time, int, int, text) from public, anon;
revoke execute on function public.fn_asistencia_excepcion_borrar(uuid) from public, anon;
grant execute on function public.fn_asistencia_reglas_dias() to authenticated;
grant execute on function public.fn_asistencia_regla_dias_guardar(uuid, int[], time, time, int, int, int, int, boolean) to authenticated;
grant execute on function public.fn_asistencia_regla_dias_quitar(uuid, int[]) to authenticated;
grant execute on function public.fn_asistencia_excepciones(date, date) to authenticated;
grant execute on function public.fn_asistencia_excepcion_guardar(uuid, date, time, time, int, int, text) to authenticated;
grant execute on function public.fn_asistencia_excepcion_borrar(uuid) to authenticated;
