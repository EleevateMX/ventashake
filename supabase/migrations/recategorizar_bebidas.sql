-- ============================================================================
-- Mover cada bebida a su categoría real (pedido de la sucursal)
-- ============================================================================
-- Todo vivía amontonado en "Shakes". Los chips del kiosko salen de las
-- categorías con productos, así que este movimiento hace aparecer los
-- botones de Hydration Drinks, Amino Refreshers y Café solos.
--
-- Solo se mueve lo INEQUÍVOCO por nombre. Tés, Kombuchas y Collagen Drinks
-- los reparte la sucursal desde Admin → Menú (selector de categoría en la
-- misma tabla): los nombres no dicen cuál es cuál — hay pistas de que
-- "Blueberry Açaí" es un té y "Violetas Açaí" una kombucha, pero eso lo
-- sabe quien los prepara, no el esquema.
--
-- La sincronización desde costeo NO pisa la categoría al actualizar (solo
-- al crear un producto nuevo), así que el movimiento es permanente.
-- ============================================================================

update productos p
set categoria_id = (select id from categorias where nombre = 'Hydration Drinks')
where p.nombre like 'Hydration Drink%' and not p.es_extra;

update productos p
set categoria_id = (select id from categorias where nombre = 'Amino Refreshers')
where p.nombre like 'Amino Refresher%' and not p.es_extra;

update productos p
set categoria_id = (select id from categorias where nombre = 'Café')
where not p.es_extra and (
  p.nombre like 'Americano%' or p.nombre like 'Latte%'
  or p.nombre like 'Cold Brew%' or p.nombre like 'Café%'
  or p.nombre like 'CafAmericano%'
);

-- Los chips del kiosko salen por `orden`: las familias de bebida van juntas,
-- pegadas a Shakes, en el orden que dictó la sucursal.
update categorias set orden = case nombre
  when 'Shakes'           then 1
  when 'Collagen Drinks'  then 2
  when 'Amino Refreshers' then 3
  when 'Hydration Drinks' then 4
  when 'Café'             then 5
  when 'Tés'              then 6
  when 'Kombuchas'        then 7
  when 'Alimentos'        then 10
  when 'Bebidas'          then 11
  when 'Snacks'           then 12
  when 'Combos'           then 13
  when 'Suplementos'      then 14
  when 'Scoops'           then 15
  else orden
end
where nombre in ('Shakes','Collagen Drinks','Amino Refreshers','Hydration Drinks',
                 'Café','Tés','Kombuchas','Alimentos','Bebidas','Snacks',
                 'Combos','Suplementos','Scoops');
