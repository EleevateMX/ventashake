-- El kiosko pedia los 30 nombres mas frecuentes y hay 660 registrados: el
-- 95% de la clientela no se podia sugerir aunque estuviera escrita en la
-- base, y desde la barra eso se ve identico a "no esta registrada". El
-- cajero la volvia a teclear y nacia un nombre casi igual, que parte el
-- historial de esa persona en dos.
--
-- El tope se sube a 1000 y **se queda ahi a proposito**: PostgREST corta
-- en 1000 filas sin avisar (seccion 4 de CLAUDE.md), asi que mas alla de
-- eso el corte lo haria el transporte en silencio. Prefiero que lo haga
-- esta funcion, por frecuencia, y que se sepa: si algun dia hay mas de mil
-- nombres distintos, los que se caen son los de una sola visita.
create or replace function public.fn_nombres_pedido_frecuentes(p_limite integer default 30)
returns table(nombre text, veces bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select initcap(min(trim(o.nombre_cliente))) as nombre, count(*) as veces
  from ordenes o
  where o.nombre_cliente is not null
    and not o.es_demo
    and length(trim(o.nombre_cliente)) between 2 and 20
    and trim(o.nombre_cliente) ~ '^[[:alpha:]áéíóúüñÁÉÍÓÚÜÑ. ]+$'
  group by lower(trim(o.nombre_cliente))
  order by count(*) desc, max(o.created_at) desc
  limit least(greatest(coalesce(p_limite, 30), 1), 1000)
$function$;
