-- ============================================================================
-- Paquete Americano: $99, o $109 con galleta
-- ============================================================================
-- Pedido de la sucursal (punto 7): un paquete donde se elija americano frio o
-- caliente, y la galleta sea OPCIONAL entre chispas de chocolate y macadamia.
--
-- No se arma con `combo_items`. Esa tabla materializa una receta fija —tantas
-- piezas de esto, tantas de aquello— y no sabe decir "a elegir" ni "opcional",
-- que es justo lo que el paquete necesita. Se arma como un producto normal con
-- extras, que es el mecanismo que ya entiende ambas cosas:
--
--   · `producto_extras.grupo` = los extras que comparten grupo se ofrecen como
--     "elige uno", con el primero marcado por omision. Asi sale el americano.
--   · Los extras cuyo nombre dice "galleta" caen en el bloque de galletas del
--     modal, que ya nace en "ninguna" y se prende o apaga con un toque. Asi
--     sale la galleta opcional, sin inventar una opcion "sin galleta" que
--     habria que explicarle a alguien.
--
-- El precio del extra se guarda POR PRODUCTO (`producto_extras.precio`), no en
-- el extra: la galleta suma $10 dentro de este paquete y no le cambia el
-- precio a nada mas.
--
-- Para armar otro paquete no hace falta tocar codigo: crear el producto en
-- Admin -> Menu y ligarle sus extras en Admin -> Extras -> "Donde se ofrece",
-- poniendo el mismo texto en "grupo" a las opciones que sean a elegir.

-- ── 1. Las opciones ────────────────────────────────────────────────────────
-- Son extras propios y no los productos "Americano Caliente"/"Cookie - ..."
-- que ya existen, porque un extra lleva `es_extra=true` y eso los sacaria del
-- menu: hoy se venden solos y tienen que seguir haciendolo.
--
-- Los nombres llevan prefijo ("Cafe:", "Galleta:") por dos razones: se leen
-- bien en la comanda, y no chocan con ningun producto del catalogo — que ya
-- tiene de sobra nombres repetidos.
insert into productos (nombre, precio, categoria_id, es_extra, activo)
select x.nombre, x.precio, c.id, true, true
from categorias c
join (values
  ('Café: Americano Caliente', 0),
  ('Café: Americano Helado',   0),
  ('Galleta: Chispas de Chocolate', 10),
  ('Galleta: Macadamia',            10)
) as x(nombre, precio) on true
where c.nombre = 'Extras Bebidas'
  and not exists (select 1 from productos p where p.nombre = x.nombre);


-- ── 2. El paquete ──────────────────────────────────────────────────────────
-- $99 es el precio SIN galleta: con ella, el extra le suma los $10 y llega a
-- $109, que es como lo pidio el negocio.
--
-- `es_combo` se queda en false a proposito: no es un combo de los que arma
-- recetas fijas, es un producto con opciones. La categoria Combos no la
-- alimenta costosshake, asi que este producto no corre riesgo de que una
-- sincronizacion lo apague o le mueva el precio.
insert into productos (nombre, precio, categoria_id, es_extra, es_combo, activo, descripcion)
select 'Paquete Americano', 99, c.id, false, false, true,
       'Americano caliente o helado. Agrega galleta por $10.'
from categorias c
where c.nombre = 'Combos'
  and not exists (select 1 from productos p where p.nombre = 'Paquete Americano');


-- ── 3. Se ligan, con su grupo y su precio ──────────────────────────────────
insert into producto_extras (producto_id, extra_id, precio, grupo)
select paq.id, e.id, x.precio, x.grupo
from productos paq
join (values
  ('Café: Americano Caliente',      0::numeric, 'cafe'),
  ('Café: Americano Helado',        0::numeric, 'cafe'),
  ('Galleta: Chispas de Chocolate', 10::numeric, null),
  ('Galleta: Macadamia',            10::numeric, null)
) as x(nombre, precio, grupo) on true
join productos e on e.nombre = x.nombre and e.es_extra
where paq.nombre = 'Paquete Americano'
on conflict (producto_id, extra_id) do update
  set precio = excluded.precio, grupo = excluded.grupo;
