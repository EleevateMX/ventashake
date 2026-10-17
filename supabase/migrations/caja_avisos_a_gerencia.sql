-- Avisos a gerencia cuando se mueve la caja (17/10/26).
--
-- Lo pidió el dueño: «cuando se vaya a hacer un corte o un cambio de turno,
-- avisar siempre a las apps de los admins». Cuatro momentos:
--   · conteo_cierre — alguien empezó a contar la caja para el corte (kiosko)
--   · cambio_turno  — alguien va a entregar la caja a quien sigue (kiosko)
--   · apertura      — se abrió caja (trigger sobre caja_cortes)
--   · cierre        — se cerró, con lo contado, lo esperado y la diferencia
--
-- Cada aviso es un renglón en `caja_avisos`; un trigger sobre esa tabla lo
-- encola en `push_cola` para cada teléfono de gerencia (por empleado, por
-- sesión o por el correo que gerencia registró en Admin → Personal). Nada
-- se manda desde SQL: `push-cola` es la única que habla con Apple y con el
-- navegador, como siempre.
--
-- Por qué una tabla y un trigger y no una función «avisar»: una función
-- SECURITY DEFINER nace ejecutable por `anon`, y quitárselo exige un
-- `revoke` que el conector no aplica sin aprobación. A `caja_avisos` solo
-- pueden escribir las funciones de aquí (RLS sin política de escritura), y
-- una función de trigger no se puede llamar por la API.
--
-- Todo lo que corre dentro del cierre del corte va en un bloque que se traga
-- cualquier error: un aviso que no sale no puede tumbar un corte.

set lock_timeout = '3s';

create table if not exists public.caja_avisos (
  id         bigserial primary key,
  tipo       text not null,
  pantalla   text,
  quien      text,
  titulo     text not null,
  cuerpo     text not null,
  datos      jsonb not null default '{}'::jsonb,
  encolados  int not null default 0,
  creado_en  timestamptz not null default now()
);
create index if not exists caja_avisos_creado on public.caja_avisos (creado_en desc);
alter table public.caja_avisos enable row level security;

-- ── El trigger que reparte el aviso a los teléfonos de gerencia ─────────
create or replace function public.trg_caja_aviso_a_gerencia()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare n int := 0;
begin
  begin
    with jefes as (
      select e.id, e.auth_user_id, lower(e.correo) as correo
        from empleados e join roles r on r.id = e.rol_id
       where e.activo and r.slug in ('admin', 'administrador', 'gerente', 'desarrollo')
    ), destinos as (
      select distinct d.auth_user_id
        from push_dispositivos d
       where d.activo and d.auth_user_id is not null
         and exists (select 1 from jefes j
                      where d.empleado_id = j.id
                         or d.auth_user_id = j.auth_user_id
                         or (j.correo is not null and d.auth_user_id in
                               (select u.id from auth.users u where lower(u.email) = j.correo)))
    ), ins as (
      insert into push_cola (auth_user_id, titulo, cuerpo, datos)
      select auth_user_id, new.titulo, new.cuerpo,
             new.datos || jsonb_build_object('tipo', 'caja', 'aviso', new.tipo)
        from destinos
      returning 1
    )
    select count(*) into n from ins;
    update caja_avisos set encolados = n where id = new.id;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger caja_avisos_a_gerencia
  after insert on public.caja_avisos
  for each row execute function public.trg_caja_aviso_a_gerencia();

-- ── Apertura y cierre de caja ────────────────────────────────────────────
create or replace function public.trg_caja_corte_avisar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_quien text; r record;
begin
  begin
    if tg_op = 'INSERT' then
      select nombre into v_quien from empleados where id = new.empleado_apertura_id;
      insert into caja_avisos (tipo, quien, titulo, cuerpo, datos)
      values ('apertura', v_quien, 'Se abrió la caja',
              coalesce(v_quien, 'Alguien') || ' abrió caja con ' || to_char(coalesce(new.fondo_inicial, 0), 'FM$999,999,990.00') || ' de fondo.',
              jsonb_build_object('corte_id', new.id));
    elsif new.cerrado_en is not null and old.cerrado_en is null then
      select nombre into v_quien from empleados where id = new.empleado_cierre_id;
      select efectivo_esperado, diferencia into r from vw_corte_resumen where corte_id = new.id;
      insert into caja_avisos (tipo, quien, titulo, cuerpo, datos)
      values ('cierre', v_quien, 'Corte de caja cerrado',
              coalesce(v_quien, 'Alguien') || ' contó ' || to_char(coalesce(new.efectivo_contado, 0), 'FM$999,999,990.00')
              || ' (esperado ' || to_char(coalesce(r.efectivo_esperado, 0), 'FM$999,999,990.00')
              || case when coalesce(r.diferencia, 0) = 0 then ', cuadró'
                      when r.diferencia < 0 then ', faltan ' || to_char(-r.diferencia, 'FM$999,999,990.00')
                      else ', sobran ' || to_char(r.diferencia, 'FM$999,999,990.00') end
              || ')' || case when coalesce(new.retiro, 0) > 0 then '. Retiro ' || to_char(new.retiro, 'FM$999,999,990.00') else '' end || '.',
              jsonb_build_object('corte_id', new.id));
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger caja_corte_avisar
  after insert or update of cerrado_en on public.caja_cortes
  for each row execute function public.trg_caja_corte_avisar();

-- ── El kiosko avisa que empezó a contar o a entregar ─────────────────────
-- Misma firma que la de caja_en_vivo.sql: se reemplaza, no se duplica.
create or replace function public.fn_caja_espejo_publicar(p_pantalla text, p_estado jsonb, p_eventos jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_corte uuid; e jsonb; n int := 0; v_tipo text; v_quien text;
begin
  if coalesce(p_pantalla, '') !~ '^[a-z]+:[a-z0-9]{2,12}$' then return; end if;
  if p_estado is null or length(p_estado::text) > 20000 then return; end if;

  insert into pantalla_espejo (pantalla, estado, actualizado_en)
  values (p_pantalla, p_estado, now())
  on conflict (pantalla) do update set estado = excluded.estado, actualizado_en = now();

  if jsonb_typeof(p_eventos) = 'array' and jsonb_array_length(p_eventos) > 0 then
    select id into v_corte from caja_cortes where cerrado_en is null order by abierto_en desc limit 1;
    for e in select * from jsonb_array_elements(p_eventos) loop
      n := n + 1;
      exit when n > 20;
      continue when length(e::text) > 4000;
      v_tipo := coalesce(e->>'tipo', '');
      v_quien := left(e->>'cajero', 80);

      if v_tipo in ('conteo_cierre', 'cambio_turno') then
        -- Uno por tipo cada 10 minutos: abrir y cerrar la ventana del corte
        -- no puede llenarle el teléfono de avisos a nadie.
        continue when exists (select 1 from caja_avisos
                               where tipo = v_tipo and creado_en > now() - interval '10 minutes');
        insert into caja_avisos (tipo, pantalla, quien, titulo, cuerpo, datos)
        values (v_tipo, p_pantalla, v_quien,
                case v_tipo when 'conteo_cierre' then 'Están contando la caja' else 'Cambio de turno en la caja' end,
                coalesce(v_quien, 'Alguien')
                  || case v_tipo when 'conteo_cierre' then ' empezó a contar la caja para el corte.'
                                 else ' va a entregar la caja a quien sigue.' end
                  || ' Míralo en vivo: Admin → Caja en vivo.',
                jsonb_build_object('corte_id', v_corte));
        continue;
      end if;

      continue when v_tipo not in ('quito', 'vacio');
      insert into caja_eventos (pantalla, corte_id, cajero, tipo, detalle, importe)
      values (p_pantalla, v_corte, v_quien, v_tipo, coalesce(e->'detalle', '{}'::jsonb),
              case when (e->>'importe') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e->>'importe')::numeric end);
    end loop;
  end if;
end;
$$;

-- ── Caja en vivo enseña cuándo empezaron a contar o a entregar ──────────
do $$
declare
  v_def text;
  a text := '        union all
        select jsonb_build_object(''ts'', c.abierto_en, ''tipo'', ''apertura''';
  n text := '        union all
        select jsonb_build_object(''ts'', av.creado_en, ''tipo'', av.tipo, ''cajero'', av.quien,
                 ''texto'', av.cuerpo, ''encolados'', av.encolados)
          from caja_avisos av
         where av.creado_en >= v_desde and av.tipo in (''conteo_cierre'', ''cambio_turno'')
        union all
        select jsonb_build_object(''ts'', c.abierto_en, ''tipo'', ''apertura''';
begin
  v_def := pg_get_functiondef('public.fn_caja_en_vivo()'::regprocedure);
  if (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 then
    raise exception 'ancla de fn_caja_en_vivo no aparece exactamente una vez';
  end if;
  execute replace(v_def, a, n);
end $$;
