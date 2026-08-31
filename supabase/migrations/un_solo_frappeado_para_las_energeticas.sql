-- Frappeado: uno solo, no uno por marca.
--
-- Barra improviso cinco extras -"Bum Frappeado", "Ghost Frappeado"...- por
-- una razon que ya no aplica: creia que el sabor no llegaba a la pantalla y
-- que habia que meterlo en el nombre del extra. Se probo hoy y no es asi:
-- desde `el_extra_no_viaja_solo_a_pantalla` (27/08) el producto padre viaja
-- con su hijo, y la barra ve "Ghost - Citrus + Ghost Frappeado".
--
-- O sea que la marca en el extra es informacion repetida, y para cubrir los
-- seis sabores de cada marca habria que dar de alta decenas de extras.
--
-- Con un unico "Frappeado" pegado a todas las energeticas, la comanda dice
-- "Ghost - Citrus + Frappeado": el sabor lo pone el producto, la preparacion
-- la pone el extra, y cada cosa se escribe una sola vez.

-- 1. El extra unico. $20, el mismo precio que traian los improvisados.
insert into productos (nombre, precio, activo, es_extra, categoria_id, iva_incluido, es_reventa)
select 'Frappeado', 20, true, true, c.id, true, false
from categorias c
where c.nombre = 'Extras Bebidas'
  and not exists (
    select 1 from productos p where p.es_extra and lower(p.nombre) = 'frappeado' and p.activo);

-- 2. Pegarlo a TODAS las energeticas activas, las seis marcas.
--    Predator incluido: no venia en la lista de barra pero tiene producto
--    vivo, y si no se le pega queda como la unica que no se puede frappear.
insert into producto_extras (producto_id, extra_id, precio, grupo)
select p.id, e.id, 20, null
from productos p
join categorias c on c.id = p.categoria_id
cross join (select id from productos where es_extra and lower(nombre)='frappeado' and activo limit 1) e
where p.activo and c.nombre like 'Energy Drinks%'
on conflict do nothing;

-- 3. Apagar los cinco por marca y despegarlos, o el menu ofrece dos
--    frappeados y nadie sabe cual escoger.
delete from producto_extras pe
using productos e
where pe.extra_id = e.id
  and e.es_extra and e.nombre ilike '% Frappeado';

update productos set activo = false
where es_extra and nombre ilike '% Frappeado';
