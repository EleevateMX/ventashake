-- Lo que se vende y no descuenta nada.
--
-- El motor de descuento funciona: se cobra, se escribe el movimiento y
-- baja el stock. El problema nunca fue que fallara, es que cuando NO
-- tenia nada que descontar se quedaba callado. Treinta dias asi, y nadie
-- lo noto hasta que en la tienda contaron cajas a mano.
--
-- Esta funcion convierte esa falla invisible en una lista que alguien
-- puede cerrar. Cinco huecos, cada uno con su causa, porque el arreglo de
-- cada uno es distinto:
--
--   sin_receta     -> se vendio y no hay nada que bajar. Se arregla en
--                     Costeos. Si trae `hay_gemelo_con_receta`, el
--                     arreglo NO es inventar una receta: se esta
--                     vendiendo el gemelo equivocado (el extra suelto en
--                     vez del producto costeado).
--   sin_renglon_de_stock -> habia movimientos contra un renglon que no
--                     existia. Desde `el_descuento_de_inventario_deja_de
--                     _perderse` el renglon nace solo en la siguiente
--                     venta, asi que esta lista se vacia sola.
--   catalogo       -> cuantos insumos sobran. Los nombres a medias del
--                     rebote de Costeos ("Canada Dry Gi", "Canada Dry
--                     Ginger A") viven aqui, cada uno con su stock,
--                     repartiendo el inventario real entre fantasmas.
--   combos_vacios  -> se venden y no tienen partes que descontar.
--   traspasos      -> un traspaso que solo suma en el destino no es un
--                     traspaso: es una entrada, y bodega se queda
--                     diciendo que todavia tiene lo que ya mando.
--
-- Solo gerencia. Aqui SI se puede exigir sesion sin riesgo, al reves que
-- en el camino del cobro: esto es una pantalla de consulta. Si falla, se
-- sigue vendiendo igual. Y truena en vez de devolver vacio, porque una
-- pantalla que se ve normal cuando no tiene permiso es una que miente.
create or replace function public.fn_inventario_huecos(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(1, coalesce(p_dias, 30)));
  v_res jsonb;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede ver los huecos de inventario';
  end if;

  select jsonb_build_object(
    'desde', v_desde,
    'dias', greatest(1, coalesce(p_dias, 30)),

    'sin_receta', (
      select coalesce(jsonb_agg(x order by x.piezas desc), '[]'::jsonb) from (
        select p.id, p.nombre, coalesce(c.nombre, 'sin categoria') as categoria,
               p.es_extra, p.precio, sum(oi.cantidad) as piezas,
               exists (
                 select 1 from productos p2
                 where lower(p2.nombre) = lower(p.nombre) and p2.id <> p.id
                   and exists (select 1 from recetas r2 where r2.producto_id = p2.id)
               ) as hay_gemelo_con_receta,
               exists (select 1 from combo_items ci where ci.combo_id = p.id) as es_combo_armado
        from orden_items oi
        join ordenes o on o.id = oi.orden_id
        join productos p on p.id = oi.producto_id
        left join categorias c on c.id = p.categoria_id
        where o.pagado and not o.es_demo and o.created_at >= v_desde
          and not exists (select 1 from recetas r where r.producto_id = p.id)
        group by p.id, p.nombre, c.nombre, p.es_extra, p.precio
      ) x),

    'resumen', (
      select jsonb_build_object(
        'piezas_sin_descontar', coalesce(sum(oi.cantidad) filter (
          where not exists (select 1 from recetas r where r.producto_id = oi.producto_id)), 0),
        'piezas_totales', coalesce(sum(oi.cantidad), 0))
      from orden_items oi join ordenes o on o.id = oi.orden_id
      where o.pagado and not o.es_demo and o.created_at >= v_desde),

    'sin_renglon_de_stock', (
      select coalesce(jsonb_agg(x order by x.movido desc), '[]'::jsonb) from (
        select i.nombre as insumo, a.nombre as almacen,
               abs(sum(m.cantidad)) as movido
        from inventario_movimientos m
        join insumos i on i.id = m.insumo_id
        join almacenes a on a.id = m.almacen_id
        where m.created_at >= v_desde
          and not exists (select 1 from inventario_stock s
                          where s.insumo_id = m.insumo_id and s.almacen_id = m.almacen_id)
        group by i.nombre, a.nombre
        having abs(sum(m.cantidad)) > 0
        limit 60
      ) x),

    'catalogo', (
      select jsonb_build_object(
        'insumos', count(*),
        'sin_producto_que_los_use', count(*) filter (
          where not exists (select 1 from recetas r where r.insumo_id = i.id)),
        'sin_un_solo_movimiento', count(*) filter (
          where not exists (select 1 from inventario_movimientos m where m.insumo_id = i.id)),
        'con_stock_pero_sin_uso', count(*) filter (
          where not exists (select 1 from recetas r where r.insumo_id = i.id)
            and exists (select 1 from inventario_stock s
                        where s.insumo_id = i.id and s.stock_actual <> 0)))
      from insumos i),

    'combos_vacios', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', p.nombre, 'piezas', v.piezas) order by v.piezas desc), '[]'::jsonb)
      from productos p
      join (
        select oi.producto_id, sum(oi.cantidad) as piezas
        from orden_items oi join ordenes o on o.id = oi.orden_id
        where o.pagado and not o.es_demo and o.created_at >= v_desde
        group by oi.producto_id
      ) v on v.producto_id = p.id
      left join categorias c on c.id = p.categoria_id
      where coalesce(c.nombre,'') ilike '%combo%'
        and not exists (select 1 from combo_items ci where ci.combo_id = p.id)),

    'traspasos', (
      select jsonb_build_object(
        'suman', count(*) filter (where cantidad > 0),
        'restan', count(*) filter (where cantidad < 0),
        'almacenes', (select coalesce(jsonb_agg(distinct a.nombre), '[]'::jsonb)
                      from inventario_movimientos m2 join almacenes a on a.id = m2.almacen_id
                      where m2.tipo = 'traspaso'))
      from inventario_movimientos where tipo = 'traspaso')
  ) into v_res;

  return v_res;
end $function$;

revoke execute on function public.fn_inventario_huecos(integer) from public, anon;
grant execute on function public.fn_inventario_huecos(integer) to authenticated;
