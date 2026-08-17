-- ============================================================================
-- La categoría viaja con el costeo
-- ============================================================================
-- Costeo (app_data.data) es la fuente de verdad del catálogo, pero no sabía
-- de categorías: Admin movía productos y el JSON de costeo se quedaba como
-- estaba — dos mundos. Ahora:
--
--   · Mover en Admin escribe `categoria` DENTRO del item del JSON de costeo
--     (fn_producto_mover_categoria). La página de costeo conserva campos que
--     no conoce (muta los objetos en vez de reconstruirlos), así que el dato
--     sobrevive a sus guardados.
--   · La sincronización respeta `categoria` del JSON si viene (al crear Y al
--     actualizar), y si no viene, deja la actual — nunca regresa nada a
--     Shakes por su cuenta.
--   · La baja por desaparecer del costeo cubre también las categorías
--     nuevas: sin eso, un producto movido a Café y borrado de costeo
--     quedaría activo para siempre.
--
-- NOTA: este archivo es copia de la migración aplicada
-- `categoria_viaja_con_costeo`; la versión autoritativa de fn_sync_app_data
-- vive en el historial de migraciones de Supabase. Cambios clave respecto a
-- la versión anterior de fn_sync_app_data (catalogo_marca_orden_y_scoops):
--   1. _prod agrega la columna cat_json = nullif(x->>'categoria','') en las
--      ramas bebidas/snacks/shakeRecipes/foodRecipes (null en proteins).
--   2. El UPDATE de productos agrega:
--        categoria_id = coalesce((select id from categorias
--                                  where nombre = d.cat_json), p.categoria_id)
--   3. El INSERT usa coalesce(d.cat_json, d.cat) para la categoría.
--   4. La lista de categorías de la baja automática se extiende con:
--      Collagen Drinks, Amino Refreshers, Hydration Drinks, Café, Tés,
--      Kombuchas.
-- ============================================================================

create or replace function fn_producto_mover_categoria(p_producto_id uuid, p_categoria_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre   text;
  v_es_extra boolean;
  v_cat      text;
  v_llave    text;
begin
  select nombre, es_extra into v_nombre, v_es_extra from productos where id = p_producto_id;
  if not found then
    raise exception 'El producto no existe.';
  end if;
  if p_categoria_id is not null then
    select nombre into v_cat from categorias where id = p_categoria_id;
    if v_cat is null then
      raise exception 'La categoría no existe.';
    end if;
  end if;

  update productos set categoria_id = p_categoria_id where id = p_producto_id;

  -- Los extras no viven en los arreglos de costeo: solo se mueve el producto.
  if v_es_extra then
    return;
  end if;

  foreach v_llave in array array['shakeRecipes','foodRecipes','bebidas','snacks'] loop
    update app_data ad
       set data = jsonb_set(ad.data, array[v_llave], (
         select jsonb_agg(
           case when lower(trim(x->>'nombre')) = lower(trim(v_nombre))
                then case when v_cat is null then x - 'categoria'
                          else x || jsonb_build_object('categoria', v_cat) end
                else x end)
           from jsonb_array_elements(ad.data->v_llave) x
       ))
     where jsonb_typeof(ad.data->v_llave) = 'array'
       and exists (
         select 1 from jsonb_array_elements(ad.data->v_llave) x
         where lower(trim(x->>'nombre')) = lower(trim(v_nombre))
       );
  end loop;
end;
$$;

revoke execute on function fn_producto_mover_categoria(uuid, uuid) from public;
grant execute on function fn_producto_mover_categoria(uuid, uuid) to anon, authenticated;

-- Sello inicial: los movimientos ya hechos quedan escritos en el costeo.
do $$
declare r record;
begin
  for r in
    select p.id, p.categoria_id
      from productos p join categorias c on c.id = p.categoria_id
     where not p.es_extra
       and c.nombre in ('Collagen Drinks','Amino Refreshers','Hydration Drinks','Café','Tés','Kombuchas')
  loop
    perform fn_producto_mover_categoria(r.id, r.categoria_id);
  end loop;
end $$;
