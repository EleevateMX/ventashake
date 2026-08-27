-- Energy Drinks por marca, y Snacks por tipo.
--
-- Se sigue el patron que ya usa el catalogo, "Padre - Hijo": el nombre trae
-- la jerarquia y `agruparCategorias` la pliega sola en el kiosko, asi que
-- no hay que tocar ni una linea de frontend. Los chips quedan en dos
-- niveles (familia arriba, marca/tipo abajo) igual que Scoops.
--
-- Primero se renumera todo x10. El `orden` venia denso (1..26) y no habia
-- hueco para meter seis subcategorias donde van sin empujar el resto. Con
-- multiplos de 10 queda espacio para las que vengan despues sin volver a
-- renumerar. El sync de Costeos NO escribe `categorias` (se verifico), asi
-- que este orden no se lo lleva el siguiente guardado.
update categorias set orden = orden * 10 where orden < 30;

-- Las hijas heredan cocina y `va_a_pantalla` de su padre. Esto ultimo es
-- lo que importa: Energy Drinks y Snacks van en false porque los sirve el
-- cajero. Si una hija naciera en true, cada lata mandaria comanda a barra.
insert into categorias (nombre, cocina_id, activa, orden, va_a_pantalla, nombre_singular)
select v.nombre, p.cocina_id, true, v.orden, p.va_a_pantalla, v.singular
from (values
  ('Energy Drinks - BUM',      91, 'Energy Drink'),
  ('Energy Drinks - Ghost',    92, 'Energy Drink'),
  ('Energy Drinks - Monster',  93, 'Energy Drink'),
  ('Energy Drinks - Sting',    94, 'Energy Drink'),
  ('Energy Drinks - Volt',     95, 'Energy Drink'),
  -- Predator no venia en la lista del negocio, pero tiene dos productos
  -- vivos. Sin su propia gaveta se quedarian colgando de un padre vacio.
  ('Energy Drinks - Predator', 96, 'Energy Drink')
) as v(nombre, orden, singular)
cross join categorias p
where p.nombre = 'Energy Drinks'
  and not exists (select 1 from categorias c where c.nombre = v.nombre);

insert into categorias (nombre, cocina_id, activa, orden, va_a_pantalla, nombre_singular)
select v.nombre, p.cocina_id, true, v.orden, p.va_a_pantalla, p.nombre_singular
from (values
  ('Snacks - Barras Proteicas',   111),
  ('Snacks - Galletas Proteicas', 112),
  ('Snacks - Pastries Proteicas', 113),
  ('Snacks - Nuts',               114),
  ('Snacks - Salados',            115),
  ('Snacks - Dulces',             116)
) as v(nombre, orden)
cross join categorias p
where p.nombre = 'Snacks'
  and not exists (select 1 from categorias c where c.nombre = v.nombre);

-- ------------------------------------------------------------------
-- El reparto
-- ------------------------------------------------------------------

-- Los Energy Drinks se reparten por `marca`, no por el nombre: el campo ya
-- viene lleno y es lo que el negocio realmente quiso decir con "por marca".
-- ('STING ' trae un espacio de mas, de ahi el trim.)
update productos p
set categoria_id = c.id
from categorias c, categorias padre
where padre.nombre = 'Energy Drinks'
  and p.categoria_id = padre.id
  and c.nombre = 'Energy Drinks - ' || case upper(trim(p.marca))
        when 'CBUM'           then 'BUM'
        when 'GHOST'          then 'Ghost'
        when 'MONSTER ENERGY' then 'Monster'
        when 'STING'          then 'Sting'
        when 'VOLT'           then 'Volt'
        when 'PREDATOR'       then 'Predator'
      end;

-- Los Snacks se reparten por lo que SON, que es como los pidio el negocio.
-- Se hace por patron de nombre y no por marca porque una misma marca vende
-- de todo: Raw Nutrition hace barras, galletas y pastries.
--
-- Se mueven tambien los apagados: si alguno revive, revive en su gaveta.
update productos p
set categoria_id = c.id
from categorias c, categorias padre
where padre.nombre = 'Snacks'
  and p.categoria_id = padre.id
  and c.nombre = 'Snacks - ' || case
        -- Barras: las que se llaman barra (o barrita), mas Wild Protein.
        when p.nombre ilike 'Barra%'                then 'Barras Proteicas'
        when p.nombre ilike 'Wild Protein%'         then 'Barras Proteicas'
        -- Galletas proteicas: las dos marcas que vendemos.
        when p.nombre ilike 'Lenny %'               then 'Galletas Proteicas'
        when p.nombre ilike '%Complete Cookie%'     then 'Galletas Proteicas'
        when p.nombre ilike 'My Cookie Dealer%'     then 'Galletas Proteicas'
        -- Pastries: el frosted de Raw, que no es galleta.
        when p.nombre ilike 'My Cookie Pastry%'     then 'Pastries Proteicas'
        -- Nuts.
        when p.nombre ilike 'Almendras%'            then 'Nuts'
        when p.nombre ilike 'Cacahuate%'            then 'Nuts'
        when p.nombre ilike 'Nueces%'               then 'Nuts'
        when p.nombre ilike 'Botana Surtida%'       then 'Nuts'
        -- Salados.
        when p.nombre ilike 'Veggie%'               then 'Salados'
        when p.nombre ilike 'Palito de Carne%'      then 'Salados'
        -- Dulces: la galleta y el muffin de la casa, que NO son proteicos.
        when p.nombre ilike 'Cookie%'               then 'Dulces'
        when p.nombre ilike 'Muffin%'               then 'Dulces'
      end;
