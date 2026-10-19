-- Bebida y proteína con el mismo nombre (19/10/26).
--
-- Ghost vende bebida energética y proteína con los mismos sabores. En
-- Costeos quedaron «Ghost - Blue Raspberry» (bebida) y «GHOST - Blue
-- Raspberry» (proteína), y lo mismo con Bubblicious Strawberry Splash y
-- Welchs Grape. La sincronización reconoce cada insumo SOLO por su nombre,
-- así que los dos renglones caían en el mismo insumo:
--
--   - Blue Raspberry: la bebida nunca tuvo insumo propio (se vendía a $89
--     sin descontar nada).
--   - Bubblicious: la bebida y la proteína compartían el insumo de la
--     bebida. La proteína le escribía encima su costo ($533), su clave y sus
--     30 scoops, y el «Scoop GHOST - Bubblicious…» no descontaba.
--   - Welchs Grape: igual que Bubblicious, sin ventas de la bebida.
--   - Y la entrada de mercancía tomaba la caja de la bebida como bote de
--     proteína: 1 caja = 30.
--
-- El arreglo de fondo es que ningún nombre se repita entre secciones de
-- Costeos (Costeos ahora lo avisa arriba y no deja dar entrada mientras
-- tanto). Las bebidas se renombran en Costeos a «Ghost Energy - …». Aquí:
--
--   1. El insumo de la bebida Bubblicious (con sus 22 ventas) toma el nombre
--      nuevo y recupera sus datos de bebida. Así su historia sigue con la
--      bebida cuando Costeos la renombre.
--   2. El de Welchs Grape (sin ventas) se retira con un nombre que dice qué
--      era: «Ghost Energy - Welchs Grape» ya existe y la bebida vuelve a él.
--   3. La entrada de mercancía solo multiplica por scoops si el insumo ES
--      proteína.
--   4. Se corre la sincronización: nacen los insumos de proteína que faltaban
--      y sus scoops se ligan.
--
-- Todo con existencia en 0: no se mueve ningún número.

set lock_timeout = '3s';

-- 1. Bubblicious: el insumo es de la bebida.
update insumos
   set nombre = 'Ghost Energy - Bubblicious Strawberry Splash',
       contenido = 1, codigo = null, presentacion = 'Pack 12/16oz',
       costo_compra = round(577 / 12.0, 2)
 where id = '925f5fee-a348-48d9-9d84-bf7c522b1017'
   and nombre = 'Ghost - Bubblicious Strawberry Splash';

-- 2. Welchs Grape: se retira el que estaba mezclado.
update insumos
   set nombre = 'Ghost - Welchs Grape (bebida, retirado 19/10)',
       codigo = null, activo = false
 where id = '45a1570c-6eec-4b34-81c4-b294fc6e0bd1'
   and nombre = 'Ghost - Welchs Grape';

-- «Ghost - Blle Raspberry» (el nombre con la errata, de hoy): sin existencia
-- ni movimientos, su producto ya está apagado.
update insumos set activo = false
 where id = 'dd9f88d0-8b76-48a7-bb8f-39ca88b2d958'
   and not exists (select 1 from inventario_movimientos m where m.insumo_id = insumos.id);

-- 3. La entrada solo cuenta en scoops lo que es proteína (parche anclado).
do $$
declare
  v_def text := pg_get_functiondef('public.fn_entrada_confirmar(uuid, text, text, text, date, numeric, jsonb, text)'::regprocedure);
  v_ancla text := E'       where lower(trim(x->>''marca'') || '' - '' || trim(x->>''sabor'')) = lower(v_nombre)\n       limit 1;';
  v_nuevo text := E'       where lower(trim(x->>''marca'') || '' - '' || trim(x->>''sabor'')) = lower(v_nombre)\n         and exists (select 1 from insumos t where t.id = v_insumo and t.tipo = ''proteina'')\n       limit 1;';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_n <> 1 then
    raise exception 'fn_entrada_confirmar: el ancla aparece % veces (se esperaba 1)', v_n;
  end if;
  execute replace(v_def, v_ancla, v_nuevo);
end $$;

-- 4. La sincronización, como al guardar Costeos.
select fn_sync_app_data();
select fn_sync_stock_costos();
select fn_proteina_recetas_alinear();
