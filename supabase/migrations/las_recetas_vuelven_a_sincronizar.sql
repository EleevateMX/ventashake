-- Las recetas llevaban meses congeladas y nadie se entero.
--
-- El sync borra las recetas de los productos que aparecen en Costeos y las
-- vuelve a escribir. Ese borrado decia:
--
--   jsonb_array_elements(data->'bebidas'||data->'snacks'||...)
--
-- Sin parentesis, `||` se aplica antes que `->`, asi que aquello se parsea
-- como `data -> ('bebidas' || data) -> ...` y devuelve NULL. Y como `->`
-- con una llave que no existe devuelve NULL en vez de fallar, el
-- `jsonb_array_elements(NULL)` no produjo filas, el DELETE no borro nada,
-- y nadie vio un error jamas.
--
-- El insert que sigue trae `and not exists (... from recetas ...)`, o sea
-- que solo escribe la receta si el producto no tiene ninguna. Con el
-- borrado muerto, eso significa: la receta se escribe UNA VEZ, la primera,
-- y ya nunca cambia.
--
-- Consecuencia real: editar una receta en Costeos no llegaba a ningun
-- lado. El Wrap Smoky Chipotle decia en Costeos "Queso Mozzarella
-- (rallado) 45 g, pechuga 70 g" y la base seguia con "(rebanado) 2 pz,
-- pechuga 90 g" -- que es lo que se le descontaba al inventario en cada
-- venta y lo que Admin mostraba.
do $mig$
declare
  d text := pg_get_functiondef('fn_sync_app_data()'::regprocedure);
  ancla text := 'data->''bebidas''||data->''snacks''||data->''shakeRecipes''||data->''foodRecipes''';
  veces int;
begin
  veces := (length(d) - length(replace(d, ancla, ''))) / length(ancla);
  if veces < 1 then
    raise exception 'No encontre la concatenacion sin parentesis';
  end if;
  d := replace(d, ancla,
    '(data->''bebidas'') || (data->''snacks'') || (data->''shakeRecipes'') || (data->''foodRecipes'')');
  execute d;
  raise notice 'Parentesis puestos en % lugar(es)', veces;
end
$mig$;
