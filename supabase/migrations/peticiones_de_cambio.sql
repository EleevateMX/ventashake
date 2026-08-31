/*
 * Lo mismo que los reportes de falla, pero para lo que la gente PIDE.
 *
 * Hoy las peticiones llegan por WhatsApp: "seria bueno que...", "los
 * clientes piden...". Se mezclan con lo urgente, se contestan a medias y a
 * la semana nadie se acuerda de cuales quedaron. La lista de barra del
 * 29/08 traia siete cosas en un solo mensaje.
 *
 * Con esto quedan en una cola: quien pidio que, cuando, con que prioridad y
 * cual entra en la proxima sesion de trabajo. Y quien lo pidio ve en que
 * quedo -- que es lo unico que hace que la gente siga pidiendo por aqui en
 * vez de por mensaje.
 *
 * Se reusa la tabla de reportes en vez de hacer otra: el ciclo de vida es
 * identico (llega, se prioriza, se cierra con respuesta) y tenerlas
 * separadas obligaria a mirar en dos lados para saber que hay pendiente.
 */
alter table reportes_soporte
  add column if not exists tipo text not null default 'falla'
    check (tipo in ('falla', 'peticion')),
  -- 1 = ahora, 2 = pronto, 3 = algun dia. NULL = todavia sin clasificar.
  add column if not exists prioridad integer check (prioridad between 1 and 3),
  -- Lo que entra en la proxima sesion de trabajo. Es la agenda.
  add column if not exists para_sesion boolean not null default false;

comment on column reportes_soporte.tipo is
  'falla = algo se rompio. peticion = alguien quiere que el sistema haga algo nuevo.';
comment on column reportes_soporte.para_sesion is
  'Marcado por gerencia: entra en la proxima sesion de trabajo.';

create or replace function fn_reportar_soporte(
  p_sintoma text,
  p_ficha text default null,
  p_extra jsonb default '{}'::jsonb,
  p_tipo text default 'falla'
)
returns reportes_soporte
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v reportes_soporte;
  v_emp uuid;
  v_revision jsonb;
  v_impresoras jsonb;
  v_tipo text := case when p_tipo = 'peticion' then 'peticion' else 'falla' end;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede reportar';
  end if;
  if coalesce(trim(p_sintoma), '') = '' then
    raise exception 'Escribe que esta pasando: sin eso el reporte no sirve';
  end if;

  select e.id into v_emp from empleados e where e.auth_user_id = auth.uid() limit 1;

  -- La foto del sistema solo tiene sentido en una FALLA. En una peticion no
  -- dice nada -- que las impresoras esten bien no ayuda a entender que
  -- alguien quiere pagar mitad en efectivo y mitad con tarjeta.
  if v_tipo = 'falla' then
    select jsonb_agg(to_jsonb(r)) into v_revision from fn_revision_sistema() r;
    select jsonb_agg(jsonb_build_object(
             'nombre', i.nombre, 'activa', i.activa,
             'version', i.agente_version,
             'latido_hace_seg', round(extract(epoch from (now() - i.ultima_conexion)))
           )) into v_impresoras
    from impresoras i;
  end if;

  insert into reportes_soporte (empleado_id, sintoma, ficha, tipo, contexto)
  values (v_emp, trim(p_sintoma), nullif(trim(p_ficha), ''), v_tipo,
    jsonb_build_object(
      'revision', coalesce(v_revision, '[]'::jsonb),
      'impresoras', coalesce(v_impresoras, '[]'::jsonb),
      'hora_local', to_char(now() at time zone 'America/Merida', 'YYYY-MM-DD HH24:MI'),
      'del_navegador', coalesce(p_extra, '{}'::jsonb)
    ))
  returning * into v;

  return v;
end;
$function$;

create or replace function fn_reportes_soporte(
  p_limite integer default 20,
  p_tipo text default null
)
returns table(
  id uuid, creado_en timestamptz, quien text, sintoma text, ficha text,
  tipo text, estado text, prioridad integer, para_sesion boolean,
  respuesta text, contexto jsonb
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select r.id, r.creado_en, coalesce(e.nombre, 'alguien'), r.sintoma, r.ficha,
         r.tipo, r.estado, r.prioridad, r.para_sesion, r.respuesta, r.contexto
  from reportes_soporte r
  left join empleados e on e.id = r.empleado_id
  where fn_rol_staff() is not null
    and (p_tipo is null or r.tipo = p_tipo)
  order by
    -- Lo abierto arriba, y dentro de eso lo prioritario y lo que ya esta
    -- marcado para la sesion: es el orden en que se va a trabajar.
    (r.estado = 'cerrado'),
    r.para_sesion desc,
    r.prioridad nulls last,
    r.creado_en desc
  limit greatest(coalesce(p_limite, 20), 1);
$function$;

/** Clasificar: que tan urgente es y si entra en la proxima sesion. Solo gerencia. */
create or replace function fn_priorizar_reporte(
  p_id uuid,
  p_prioridad integer default null,
  p_para_sesion boolean default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede priorizar';
  end if;
  update reportes_soporte
     set prioridad = coalesce(p_prioridad, prioridad),
         para_sesion = coalesce(p_para_sesion, para_sesion),
         estado = case when estado = 'abierto' then 'atendido' else estado end
   where id = p_id;
end;
$function$;

revoke all on function fn_reportar_soporte(text, text, jsonb, text) from public, anon;
revoke all on function fn_reportes_soporte(integer, text) from public, anon;
revoke all on function fn_priorizar_reporte(uuid, integer, boolean) from public, anon;
grant execute on function fn_reportar_soporte(text, text, jsonb, text) to authenticated;
grant execute on function fn_reportes_soporte(integer, text) to authenticated;
grant execute on function fn_priorizar_reporte(uuid, integer, boolean) to authenticated;

-- La trampa de siempre, otra vez: cambiar la firma de una funcion NO la
-- reemplaza, la duplica. Al agregarle `p_tipo` a las dos quedaron ambas
-- versiones conviviendo, y llamarlas da "function is not unique".
--
-- Peor que el error: PostgREST elige por nombre de parametro, asi que un
-- dia podria resolver a la version vieja -la que no sabe de peticiones- y
-- todo lo capturado desde el kiosko entraria como falla sin que nadie lo
-- note.
drop function if exists public.fn_reportar_soporte(text, text, jsonb);
drop function if exists public.fn_reportes_soporte(integer);
