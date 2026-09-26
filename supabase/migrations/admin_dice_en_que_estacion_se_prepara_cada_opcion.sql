-- Admin -> Extras: en que estacion se prepara cada opcion de un producto.
-- Para los combos que vengan: el cafe del combo en Barra, el wrap en
-- Cocina. Vacio = sigue a su producto, que es lo correcto para casi todo
-- (la creatina va con su shake, el queso extra con su sandwich).

drop function if exists fn_extra_bebida_productos(uuid);
create function fn_extra_bebida_productos(p_extra_id uuid)
 returns table(producto_id uuid, nombre text, categoria text, ofrecido boolean, precio_propio numeric,
               precio_base numeric, grupo text, por_defecto boolean, requiere_grupo text, estacion text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.nombre,
         coalesce(k.nombre || ' · ' || c.nombre, '—'),
         pe.producto_id is not null,
         pe.precio,
         (select e.precio from productos e where e.id = p_extra_id),
         pe.grupo,
         coalesce(pe.por_defecto, false),
         pe.requiere_grupo,
         pe.estacion
  from productos p
  join categorias c on c.id = p.categoria_id
  join cocinas k on k.id = c.cocina_id
  left join producto_extras pe on pe.producto_id = p.id and pe.extra_id = p_extra_id
  where p.activo and not p.es_extra
  order by k.slug, c.orden, p.nombre
$function$;
-- Mismos permisos que tenia: la lee Admin y nada que ver con dinero.
grant execute on function fn_extra_bebida_productos(uuid) to anon, authenticated;

create or replace function fn_extra_bebida_estacion(p_extra_id uuid, p_producto_id uuid, p_estacion text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede decir donde se prepara un extra.';
  end if;
  if p_estacion is not null and p_estacion not in ('bebidas', 'alimentos') then
    raise exception 'La estacion va en bebidas o alimentos.';
  end if;
  update producto_extras set estacion = p_estacion
   where producto_id = p_producto_id and extra_id = p_extra_id;
  if not found then
    raise exception 'Ese extra no se ofrece en ese producto todavia: marcalo primero.';
  end if;
end;
$function$;
revoke execute on function fn_extra_bebida_estacion(uuid, uuid, text) from public, anon;
grant execute on function fn_extra_bebida_estacion(uuid, uuid, text) to authenticated;
