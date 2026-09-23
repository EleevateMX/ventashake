-- Los precios que mando gerencia, sembrados contra el catalogo real.
--
-- Lo que NO se siembra queda sin precio de personal, o sea **se cobra
-- completo**. Es el lado seguro: un producto que deberia tener beneficio y
-- no lo tiene se reporta el mismo dia ("no me dejo"); uno que no deberia
-- tenerlo y lo tiene se va en silencio, venta tras venta.
--
-- Cuatro quedaron fuera a proposito, porque son decisiones de negocio y no
-- de mapeo. Estan levantadas en Admin -> Peticiones:
--   * Jugo Verde esta en la categoria Shakes a $69; la lista lo pone en
--     BEBIDAS a $49. Cambia que lugar del limite consume.
--   * Shake Mexa ($79) no aparece en la lista.
--   * La proteina Sascha cuesta hoy +$12, no +$16: El Clasico con Sascha
--     daria $61 y la lista dice $65.
--   * "Hazlo Crunchy" no existe como extra en el catalogo.

update productos p set precio_personal = 95, grupo_personal = 'shake'
  from categorias c
 where c.id = p.categoria_id and c.nombre = 'Shakes'
   and p.activo and not p.es_extra and p.precio = 125;

update productos set precio_personal = 49, grupo_personal = 'shake'
 where nombre = 'El Clásico' and activo and not es_extra;

update productos set precio_personal = 49, grupo_personal = 'alimento'
 where nombre = 'Chapata' and activo and not es_extra;

update productos p set precio_personal = 99, grupo_personal = 'alimento'
  from categorias c
 where c.id = p.categoria_id and c.nombre = 'Alimentos'
   and p.activo and not p.es_extra
   and (p.nombre like 'Sándwich%' or p.nombre like 'Wrap%' or p.nombre like 'Ensalada%');

update productos p set precio_personal = 69, grupo_personal = 'bebida'
  from categorias c
 where c.id = p.categoria_id and c.nombre = 'Collagen Drinks'
   and p.activo and not p.es_extra;

update productos p set precio_personal = 39, grupo_personal = 'bebida'
  from categorias c
 where c.id = p.categoria_id
   and c.nombre in ('Amino Refreshers', 'Hydration Drinks', 'Tés', 'Kombuchas')
   and p.activo and not p.es_extra;

-- Cafe, uno por uno: cada renglon de la lista trae su propio precio.
update productos p set precio_personal = 39, grupo_personal = 'bebida'
  from categorias c
 where c.id = p.categoria_id and c.nombre = 'Café'
   and p.activo and not p.es_extra and p.nombre like 'Americano%';

update productos p set precio_personal = 49, grupo_personal = 'bebida'
  from categorias c
 where c.id = p.categoria_id and c.nombre = 'Café'
   and p.activo and not p.es_extra and (p.nombre like 'Latte%' or p.nombre = 'Cold Brew');

update productos p set precio_personal = 35, grupo_personal = 'bebida'
  from categorias c
 where c.id = p.categoria_id and c.nombre = 'Café'
   and p.activo and not p.es_extra and p.nombre = 'Espresso';

update productos p set precio_personal = 39, grupo_personal = 'bebida'
  from categorias c
 where c.id = p.categoria_id and c.nombre = 'Café'
   and p.activo and not p.es_extra and p.nombre = 'Double Espresso';
