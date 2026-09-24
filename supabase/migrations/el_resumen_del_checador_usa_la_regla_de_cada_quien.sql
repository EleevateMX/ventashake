-- El historico del checador calcula a cada quien con SU regla.
--
-- Cambia la firma (devuelve columnas nuevas), asi que hay que soltar la
-- anterior: cambiar la firma de una funcion no la reemplaza, la duplica.
--
-- Lo que NO cambia: las horas salen de las checadas, que no se tocan ni se
-- reescriben. Lo que cambia es contra que se comparan y cuanto se descuenta.
--
-- Y aqui queda contestada de una vez la pregunta que movia la nomina: con
-- "la comida se paga" APAGADO se resta el TIEMPO REAL entre inicio_comida y
-- fin_comida, no los minutos esperados de la configuracion. comida_min es
-- referencia; comida_max_min solo marca "comida larga".

drop function if exists fn_asistencia_resumen(date, date);

create function fn_asistencia_resumen(p_desde date, p_hasta date)
returns table(
  empleado_id uuid, nombre text, dia date,
  entrada timestamptz, salida timestamptz,
  entrada_hora text, salida_hora text,
  minutos_bruto int, minutos_comida int, minutos_trabajados int,
  sin_salida boolean, comida_abierta boolean, comida_larga boolean,
  corregido boolean,
  regla text, jornada_min int, comida_esperada_min int,
  comida_se_paga boolean, minutos_tarde int
)
language sql stable security definer set search_path to 'public' as $$
  with cfg as (select * from asistencia_config where id = 'default'),
  -- La regla de cada quien, ya resuelta contra la general. Un campo vacio
  -- en la regla hereda el general; quien no tiene regla queda exactamente
  -- como estaba antes de que existieran las reglas.
  reglaDe as (
    select e.id as empleado_id, e.nombre, r.nombre as regla,
           coalesce(r.jornada_min,    c.jornada_min)    as jornada_min,
           coalesce(r.tolerancia_min, c.tolerancia_min) as tolerancia_min,
           coalesce(r.comida_min,     c.comida_min)     as comida_min,
           coalesce(r.comida_max_min, c.comida_max_min) as comida_max_min,
           coalesce(r.comida_se_paga, c.comida_se_paga) as comida_se_paga,
           r.hora_entrada
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
  )
  select d.empleado_id, g.nombre, d.dia, d.entrada, d.salida,
         to_char(d.entrada at time zone 'America/Merida', 'HH24:MI'),
         to_char(d.salida  at time zone 'America/Merida', 'HH24:MI'),
         bruto.min,
         coalesce(cm.minutos, 0),
         case when bruto.min is null then null
              when g.comida_se_paga then bruto.min
              else greatest(0, bruto.min - coalesce(cm.minutos, 0)) end,
         d.entrada is not null and d.salida is null,
         coalesce(cm.abierta, false),
         coalesce(cm.minutos, 0) > g.comida_max_min,
         d.corregido,
         g.regla, g.jornada_min, g.comida_min, g.comida_se_paga,
         -- null = esa persona no tiene horario de reloj, asi que no hay
         -- con que decir si llego tarde. 0 = llego dentro de tolerancia.
         case when g.hora_entrada is null or d.entrada is null then null
              when tarde.min > g.tolerancia_min then tarde.min
              else 0 end
    from porDia d
    join reglaDe g on g.empleado_id = d.empleado_id
    left join comidaPorDia cm on cm.empleado_id = d.empleado_id and cm.dia = d.dia
    cross join lateral (
      select case when d.entrada is not null and d.salida is not null
                  then (extract(epoch from (d.salida - d.entrada)) / 60)::int end as min
    ) bruto
    cross join lateral (
      select case when g.hora_entrada is not null and d.entrada is not null
                  then (extract(epoch from (
                         (d.entrada at time zone 'America/Merida')::time - g.hora_entrada
                       )) / 60)::int end as min
    ) tarde
   where fn_es_jefe()
   order by d.dia desc, g.nombre;
$$;

revoke execute on function fn_asistencia_resumen(date, date) from public, anon;
grant execute on function fn_asistencia_resumen(date, date) to authenticated;
