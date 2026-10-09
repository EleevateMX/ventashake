-- Proteína: todo en SCOOPS, con botes de cara a la gente (09/10/26).
--
-- El insumo de proteína siempre fue `unidad = 'scoop'` y lo vendido se
-- descuenta en scoops. Pero:
--   * la sync de Costeos leía el kiosko de `invIndividual` y las proteínas
--     guardan `invScoops`: el kiosko nunca recibía scoops y solo bajaba
--     (31 insumos en negativo, de −10 a −17);
--   * la bodega recibía `invOriginal` — BOTES — en un insumo de scoops, sin
--     convertir;
--   * «¿Llegó mercancía?» sacaba las piezas por caja del primer número de
--     `presentacion`, que en proteína son GRAMOS: «+1 caja» metía 1,224.
--
-- Ahora: la sync convierte bodega = botes × scoops por bote y lee el kiosko
-- de `invScoops`; el catálogo del kiosko dice qué es proteína y cuántos
-- scoops trae un bote (`insumos.contenido`), y la pantalla carga por bote o
-- por scoop. Costeos enseña y cuenta la bodega en botes y convierte al
-- mandar (apps/costos/index.html).
--
-- Se aplicó con todo en 0 (el reinicio de Perla del 07/10): ni existencias
-- de bodega ni `costos_stock_sync.ultimo_valor` de proteína tenían nada
-- que convertir, así que el cambio de unidad no movió ningún número.

-- 1. Lo que la barra puede cargar, ahora con bote/scoop.
create or replace function public.fn_inventario_catalogo_kiosko()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_res jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver el inventario';
  end if;

  select coalesce(jsonb_agg(x order by x.nombre), '[]'::jsonb) into v_res
  from (
    select i.id, i.nombre, i.unidad, i.presentacion,
           (i.tipo = 'proteina') as es_proteina,
           nullif(i.contenido, 0) as contenido,
           (select round(s.stock_actual, 2) from inventario_stock s
             where s.insumo_id = i.id
               and s.almacen_id = (select id from almacenes where nombre = 'Kiosko' limit 1)
           ) as en_kiosko,
           (select round(s.stock_actual, 2) from inventario_stock s
             where s.insumo_id = i.id
               and s.almacen_id = (select id from almacenes where nombre = 'Bodega' limit 1)
           ) as en_bodega,
           -- En proteína «una caja» es UN BOTE: sus scoops. En lo demás,
           -- el primer número de la presentación («Pack 21/1L» → 21).
           case when i.tipo = 'proteina' then nullif(round(i.contenido), 0)::int
                else nullif((regexp_match(coalesce(i.presentacion, ''), '(\d+)'))[1], '')::int
           end as por_caja
    from insumos i
    where i.activo
      and (exists (select 1 from recetas r join productos p on p.id = r.producto_id
                   where r.insumo_id = i.id and p.activo)
        or exists (select 1 from inventario_stock s
                   where s.insumo_id = i.id and s.stock_actual <> 0))
  ) x;

  return v_res;
end $function$;

-- 2. La sync de Costeos, parchada con ancla (la función completa usa una
--    tabla temporal y no se reescribe aquí). Si el ancla no aparece
--    exactamente una vez, no se toca nada.
do $$
declare d text; ancla text; nuevo text; n int;
begin
  d := pg_get_functiondef('public.fn_sync_stock_costos()'::regprocedure);
  ancla := 'x->>''invIndividual'' kiosko, x->>''invOriginal'' bodega
    from app_data, jsonb_array_elements(data->''proteins'') x';
  nuevo := 'x->>''invScoops'' kiosko,
           case when nullif(x->>''invOriginal'', '''') is null then x->>''invOriginal''
                else ((x->>''invOriginal'')::numeric * coalesce(nullif(x->>''scoops'', '''')::numeric, 1))::text
           end bodega
    from app_data, jsonb_array_elements(data->''proteins'') x';
  n := (length(d) - length(replace(d, ancla, ''))) / length(ancla);
  if n <> 1 then
    raise exception 'El ancla de fn_sync_stock_costos aparece % veces (se esperaba 1): no se parcha.', n;
  end if;
  execute replace(d, ancla, nuevo);
end $$;
