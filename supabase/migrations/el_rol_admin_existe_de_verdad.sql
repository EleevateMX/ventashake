/*
 * El rol `admin` estaba muerto.
 *
 * En la tabla `roles` el slug es 'admin', pero fn_es_jefe() y el candado de
 * Admin comparan contra 'administrador'. O sea que alguien con ese rol no
 * pasaba el candado y tampoco contaba como jefe: entraba con su PIN
 * correcto y el panel le decia que no era para su puesto.
 *
 * No exploto nunca porque no hay ningun empleado con ese rol -- la tienda
 * corre con 'gerente'. Es de las fallas que esperan a que alguien la use.
 *
 * Se arregla aceptando los dos nombres, y de paso ese rol pasa a tener un
 * proposito claro: 'gerente' es la duena del negocio, que administra su
 * tienda; 'admin' es quien mantiene el sistema. Lo que ve cada uno no es lo
 * mismo, y ahora se puede distinguir.
 */
create or replace function fn_es_jefe()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(fn_rol_staff() in ('admin', 'administrador', 'gerente'), false)
$function$;

/** Solo quien mantiene el sistema. La consola de soporte se apoya en esto. */
create or replace function fn_es_soporte()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(fn_rol_staff() in ('admin', 'administrador'), false)
$function$;

grant execute on function fn_es_soporte() to authenticated;

-- Las notas de trabajo de quien atiende: van aparte de `respuesta`, que es
-- lo que lee quien pidio. Mezclarlas obliga a escribir para dos publicos a
-- la vez y acaba sin servirle a ninguno.
alter table reportes_soporte
  add column if not exists notas_internas text;

comment on column reportes_soporte.notas_internas is
  'Notas de quien mantiene el sistema. NO las ve la tienda: para eso esta `respuesta`.';

create or replace function fn_anotar_reporte(p_id uuid, p_notas text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not fn_es_soporte() then
    raise exception 'Solo soporte puede anotar';
  end if;
  update reportes_soporte set notas_internas = nullif(trim(p_notas), '') where id = p_id;
end;
$function$;

revoke all on function fn_anotar_reporte(uuid, text) from public, anon;
grant execute on function fn_anotar_reporte(uuid, text) to authenticated;

-- Agregar una columna al RETURNS TABLE cambia el tipo de retorno, y eso
-- Postgres no lo hace con `create or replace`: hay que tirarla y rehacerla.
drop function if exists public.fn_reportes_soporte(integer, text);

create function fn_reportes_soporte(
  p_limite integer default 20,
  p_tipo text default null
)
returns table(
  id uuid, creado_en timestamptz, quien text, sintoma text, ficha text,
  tipo text, estado text, prioridad integer, para_sesion boolean,
  respuesta text, notas_internas text, contexto jsonb
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select r.id, r.creado_en, coalesce(e.nombre, 'alguien'), r.sintoma, r.ficha,
         r.tipo, r.estado, r.prioridad, r.para_sesion, r.respuesta,
         -- Las notas internas solo salen para soporte. La tienda ve la
         -- respuesta, no el borrador de como se llego a ella.
         case when fn_es_soporte() then r.notas_internas else null end,
         r.contexto
  from reportes_soporte r
  left join empleados e on e.id = r.empleado_id
  where fn_rol_staff() is not null
    and (p_tipo is null or r.tipo = p_tipo)
  order by
    (r.estado = 'cerrado'),
    r.para_sesion desc,
    r.prioridad nulls last,
    r.creado_en desc
  limit greatest(coalesce(p_limite, 20), 1);
$function$;

revoke all on function fn_reportes_soporte(integer, text) from public, anon;
grant execute on function fn_reportes_soporte(integer, text) to authenticated;
