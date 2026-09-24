-- Reglas del checador por persona, no una sola para todos.
--
-- Perla lo pidio con el caso enfrente: la mayoria hace 8 horas con 35
-- minutos de comida, Silvana entra 5:45 y sale 1:15, y hay medios turnos.
-- Con una sola regla global el sistema calcula bien a la mayoria y mal a
-- todos los demas, que es peor que no calcular: un numero equivocado en
-- nomina se firma igual que uno bueno.
--
-- Se hace con REGLAS CON NOMBRE que se le asignan a la gente, no con una
-- columna por persona. La razon es que asi lo dijo el negocio -- "medio
-- turno", "turno completo" son grupos, no individuos -- y porque cambiar
-- el medio turno de 4 a 5 horas se hace una vez y no persona por persona.
-- Quien necesita lo suyo (Silvana) tiene su propia regla de una persona.
--
-- REGLA DE RESPALDO, la de siempre: un campo vacio HEREDA el de la regla
-- general, y quien no tenga regla asignada se comporta exactamente como
-- hasta hoy. El dia del despliegue no se mueve ni un numero de nomina.
--
-- El horario de reloj (hora_entrada / hora_salida) no es adorno: es lo
-- unico que permite decir "llego tarde", y alimenta minutos_tarde en el
-- resumen. Sin el, el historico cuenta horas pero no las compara.

create table if not exists asistencia_reglas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  -- Todos NULL a proposito: null = "usa la general".
  jornada_min     int,
  tolerancia_min  int,
  comida_min      int,
  comida_max_min  int,
  comida_se_paga  boolean,
  hora_entrada    time,
  hora_salida     time,
  activo          boolean not null default true,
  creada_en       timestamptz not null default now(),
  actualizada_en  timestamptz not null default now()
);

create unique index if not exists ux_asistencia_reglas_nombre
  on asistencia_reglas (lower(nombre)) where activo;

alter table asistencia_reglas enable row level security;
revoke all on asistencia_reglas from public, anon, authenticated;

alter table empleados
  add column if not exists asistencia_regla_id uuid
    references asistencia_reglas(id) on delete set null;

create or replace function fn_asistencia_reglas()
returns table(
  id uuid, nombre text, jornada_min int, tolerancia_min int,
  comida_min int, comida_max_min int, comida_se_paga boolean,
  hora_entrada time, hora_salida time, personas int
)
language sql stable security definer set search_path to 'public' as $$
  select r.id, r.nombre, r.jornada_min, r.tolerancia_min,
         r.comida_min, r.comida_max_min, r.comida_se_paga,
         r.hora_entrada, r.hora_salida,
         (select count(*)::int from empleados e where e.asistencia_regla_id = r.id)
    from asistencia_reglas r
   where fn_es_jefe() and r.activo
   order by r.nombre;
$$;

-- Cada persona con su regla y con los valores YA RESUELTOS. La pantalla no
-- vuelve a mezclar: si lo hiciera, la mezcla viviria en dos lugares y se
-- separarian solos, que es como se cobro el doble scoop de menos.
create or replace function fn_asistencia_personas()
returns table(
  empleado_id uuid, nombre text, activo boolean,
  regla_id uuid, regla text,
  jornada_min int, tolerancia_min int, comida_min int,
  comida_max_min int, comida_se_paga boolean,
  hora_entrada time, hora_salida time
)
language sql stable security definer set search_path to 'public' as $$
  select e.id, e.nombre, e.activo, r.id, r.nombre,
         coalesce(r.jornada_min,    c.jornada_min),
         coalesce(r.tolerancia_min, c.tolerancia_min),
         coalesce(r.comida_min,     c.comida_min),
         coalesce(r.comida_max_min, c.comida_max_min),
         coalesce(r.comida_se_paga, c.comida_se_paga),
         r.hora_entrada, r.hora_salida
    from empleados e
    cross join (select * from asistencia_config where id = 'default') c
    left join asistencia_reglas r on r.id = e.asistencia_regla_id and r.activo
   where fn_es_jefe()
   order by e.activo desc, e.nombre;
$$;

create or replace function fn_asistencia_regla_guardar(
  p_id uuid, p_nombre text,
  p_jornada_min int, p_tolerancia_min int, p_comida_min int,
  p_comida_max_min int, p_comida_se_paga boolean,
  p_hora_entrada time default null, p_hora_salida time default null
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede tocar las reglas del checador.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'La regla necesita un nombre: es como se le asigna a la gente.';
  end if;
  -- Mismos topes de cordura que la regla general, y por la misma razon: una
  -- jornada de 30 horas no es una configuracion, es un error de dedo que
  -- despues se firma en nomina.
  if p_jornada_min is not null and p_jornada_min not between 60 and 900 then
    raise exception 'La jornada va entre 60 y 900 minutos.';
  end if;
  if p_tolerancia_min is not null and p_tolerancia_min not between 0 and 120 then
    raise exception 'La tolerancia va entre 0 y 120 minutos.';
  end if;
  if p_comida_min is not null and p_comida_min not between 0 and 240 then
    raise exception 'Los minutos de comida van entre 0 y 240.';
  end if;
  if p_comida_max_min is not null and p_comida_max_min not between 0 and 480 then
    raise exception 'La comida larga va entre 0 y 480 minutos.';
  end if;

  if p_id is null then
    insert into asistencia_reglas(
      nombre, jornada_min, tolerancia_min, comida_min, comida_max_min,
      comida_se_paga, hora_entrada, hora_salida)
    values (btrim(p_nombre), p_jornada_min, p_tolerancia_min, p_comida_min,
            p_comida_max_min, p_comida_se_paga, p_hora_entrada, p_hora_salida)
    returning id into v_id;
  else
    update asistencia_reglas set
      nombre = btrim(p_nombre),
      jornada_min = p_jornada_min, tolerancia_min = p_tolerancia_min,
      comida_min = p_comida_min, comida_max_min = p_comida_max_min,
      comida_se_paga = p_comida_se_paga,
      hora_entrada = p_hora_entrada, hora_salida = p_hora_salida,
      actualizada_en = now()
    where id = p_id and activo
    returning id into v_id;
    if v_id is null then raise exception 'Esa regla ya no existe.'; end if;
  end if;
  return v_id;
end;
$$;

-- Borrar una regla NO borra historia: la apaga y devuelve a su gente a la
-- regla general. Dejarlos apuntando a una regla apagada seria dejarlos
-- calculados con numeros que ya nadie puede ver ni corregir.
create or replace function fn_asistencia_regla_borrar(p_id uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede tocar las reglas del checador.';
  end if;
  update empleados set asistencia_regla_id = null where asistencia_regla_id = p_id;
  update asistencia_reglas set activo = false, actualizada_en = now() where id = p_id;
end;
$$;

create or replace function fn_asistencia_asignar_regla(
  p_empleado_id uuid, p_regla_id uuid
) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede tocar las reglas del checador.';
  end if;
  if p_regla_id is not null
     and not exists (select 1 from asistencia_reglas where id = p_regla_id and activo) then
    raise exception 'Esa regla ya no existe.';
  end if;
  update empleados set asistencia_regla_id = p_regla_id where id = p_empleado_id;
  if not found then raise exception 'Esa persona no existe.'; end if;
end;
$$;

-- Las dos caras de la misma trampa: revocar solo a anon deja el EXECUTE de
-- PUBLIC, y revocar solo a PUBLIC deja el de anon. Van los dos.
revoke execute on function fn_asistencia_reglas() from public, anon;
revoke execute on function fn_asistencia_personas() from public, anon;
revoke execute on function fn_asistencia_regla_guardar(uuid, text, int, int, int, int, boolean, time, time) from public, anon;
revoke execute on function fn_asistencia_regla_borrar(uuid) from public, anon;
revoke execute on function fn_asistencia_asignar_regla(uuid, uuid) from public, anon;
grant execute on function fn_asistencia_reglas() to authenticated;
grant execute on function fn_asistencia_personas() to authenticated;
grant execute on function fn_asistencia_regla_guardar(uuid, text, int, int, int, int, boolean, time, time) to authenticated;
grant execute on function fn_asistencia_regla_borrar(uuid) to authenticated;
grant execute on function fn_asistencia_asignar_regla(uuid, uuid) to authenticated;
