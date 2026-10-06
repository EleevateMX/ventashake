-- =============================================================================
-- Los más pedidos de cada categoría, para el Menú de la app (06/10/26).
--
-- La app enseña arriba de cada familia (Shakes, Alimentos, Bebidas, Snacks)
-- lo que más se vende. `vw_productos_mas_vendidos` es security_invoker y
-- solo la lee gerencia; la app lee el menú como anon. Esta función devuelve
-- SOLO el lugar (1º, 2º, 3º) de cada producto dentro de su categoría en los
-- últimos 60 días, nunca cuántos se vendieron ni cuánto dinero: el ranking
-- es publicidad, las cifras no.
-- =============================================================================
create or replace function public.fn_menu_destacados(p_dias int default 60, p_por_categoria int default 3)
returns table(producto_id uuid, categoria_id uuid, lugar int)
language sql stable security definer set search_path to 'public'
as $$
  with vendido as (
    select oi.producto_id, sum(oi.cantidad) as n
      from orden_items oi
      join ordenes o on o.id = oi.orden_id
       and o.pagado and o.estado <> 'cancelada' and not coalesce(o.es_demo, false)
     where o.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 60), 365)))
       and oi.padre_item_id is null   -- los extras siguen a su producto, no compiten
     group by oi.producto_id
  ),
  ranking as (
    select p.id, p.categoria_id,
           row_number() over (partition by p.categoria_id order by v.n desc, p.nombre) as lugar
      from vendido v
      join productos p on p.id = v.producto_id
     where p.activo and not p.es_extra and p.archivado_en is null
  )
  select id, categoria_id, lugar::int
    from ranking
   where lugar <= greatest(1, least(coalesce(p_por_categoria, 3), 10));
$$;
grant execute on function public.fn_menu_destacados(int, int) to anon, authenticated;
