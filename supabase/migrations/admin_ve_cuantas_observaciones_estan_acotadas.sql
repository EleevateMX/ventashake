-- Admin necesita ver de un vistazo cuales observaciones ya estan acotadas
-- y cuales siguen saliendo en toda su estacion. Sin ese numero hay que
-- abrir las 30 una por una para saber que falta.
--
-- Cambiar el "returns table" NO se puede con create or replace: hay que
-- borrar y volver a crear. Se hace en la misma migracion para que no
-- exista un instante sin la funcion.
drop function if exists public.fn_observaciones_admin();

create function public.fn_observaciones_admin()
returns table (
  id uuid, cocina_id uuid, cocina text, texto text, orden integer,
  activa boolean, alcances integer
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.cocina_id, k.nombre, o.texto, o.orden, o.activa,
         (select count(*)::int from observacion_alcance a where a.observacion_id = o.id)
  from observaciones o
  join cocinas k on k.id = o.cocina_id
  order by k.nombre, o.orden, o.texto
$$;

revoke all on function public.fn_observaciones_admin() from public;
grant execute on function public.fn_observaciones_admin() to anon, authenticated, service_role;
