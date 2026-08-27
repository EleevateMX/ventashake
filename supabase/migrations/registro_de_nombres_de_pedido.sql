/*
 * El registro de nombres, para Admin.
 *
 * No hay tabla de nombres y no hace falta: se aprenden solos de
 * `ordenes.nombre_cliente` cada vez que alguien cobra con nombre. Esto solo
 * los junta y los cuenta.
 *
 * Va aparte de `fn_nombres_pedido_frecuentes` (la que alimenta los chips
 * del kiosko) porque ensena DINERO, y eso no puede salir por la llave
 * publica. Se pide ser jefe.
 *
 * Cuenta solo lo cobrado: una orden que quedo colgada sin pagar no es un
 * cliente, es un intento.
 */
create or replace function fn_nombres_registro(
  p_dias integer default 90,
  p_limite integer default 200
)
returns table(
  nombre text,
  veces bigint,
  total numeric,
  ticket numeric,
  primera_vez timestamptz,
  ultima_vez timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede ver el registro de nombres';
  end if;

  return query
  select initcap(min(trim(o.nombre_cliente)))            as nombre,
         count(*)                                        as veces,
         sum(o.total)                                    as total,
         round(avg(o.total), 2)                          as ticket,
         min(o.created_at)                               as primera_vez,
         max(o.created_at)                               as ultima_vez
  from ordenes o
  where o.nombre_cliente is not null
    and o.pagado
    and not o.es_demo
    and o.created_at >= now() - make_interval(days => greatest(coalesce(p_dias, 90), 1))
    and length(trim(o.nombre_cliente)) between 2 and 20
  group by lower(trim(o.nombre_cliente))
  order by count(*) desc, max(o.created_at) desc
  limit greatest(coalesce(p_limite, 200), 1);
end;
$function$;

revoke all on function fn_nombres_registro(integer, integer) from public, anon;
grant execute on function fn_nombres_registro(integer, integer) to authenticated;
