-- ============================================================================
-- Bases por tipo de bebida (pedido de la sucursal, 13/08/26)
-- ============================================================================
--  · Shakes numerados (#1–#16) y El Clásico: se AGREGA agua como base
--    opcional. La default sigue siendo Leche Entera.
--  · Hydration Drinks y Amino Refreshers: default agua, cambiable a agua
--    mineral +$10. NO llevan leches (las habían heredado del bloque
--    "todos los shakes" del día anterior).
--  · Aguas frescas (Blueberry Açaí, jamaicas, limonadas, jengibres,
--    Violetas Açaí, Lemon Glow): igual — agua default, mineral +$10.
--  · Cafés (americanos, lattes, cold brew): leches habilitadas. Los lattes
--    default Entera (un latte ES leche); americanos y cold brew default
--    "Sin leche" — si la default fuera Entera, cada americano saldría a
--    barra con "+ENTERA" y le pondrían leche a un café solo.
--
-- La default la decide el kiosko por la presencia de cada extra: "Sin
-- leche" gana si existe, luego Entera, luego deslactosada (no light),
-- luego la primera por orden alfabético — que en las bebidas de agua es
-- "Agua" antes que "Agua mineral", a propósito.
--
-- Una base CON precio (agua mineral) se cobra como línea hija de la orden;
-- las gratis viajan como nota pegada al producto. "Sin leche" no deja nota.
-- ============================================================================

insert into productos (nombre, precio, categoria_id, es_extra, es_reventa, activo, iva_incluido)
select v.nombre, v.precio,
       (select id from categorias where nombre = 'Extras Bebidas'),
       true, false, true, true
from (values ('Agua mineral', 10::numeric), ('Sin leche', 0::numeric)) v(nombre, precio)
where not exists (
  select 1 from productos p where lower(p.nombre) = lower(v.nombre) and p.es_extra
);

create temp table _grupo (grupo text, producto_id uuid) on commit drop;

insert into _grupo
select 'shake_numerado', p.id from productos p
join categorias c on c.id = p.categoria_id
where c.nombre = 'Shakes' and p.activo and not p.es_extra and p.nombre ~ '^#[0-9]+ ';

insert into _grupo
select 'clasico', id from productos where lower(nombre) in ('el clásico','el clasico') and activo;

insert into _grupo
select 'cafe_con_leche_default', id from productos
where activo and nombre in ('Latte Caliente', 'Latte Helado');

insert into _grupo
select 'cafe_sin_leche_default', id from productos
where activo and nombre in ('Americano Caliente', 'Americano Helado', 'Cold Brew');

insert into _grupo
select 'agua_mineral', id from productos
where activo and not es_extra and nombre in (
  'Hydration Drink - Durazno', 'Hydration Drink - Lemon Twist',
  'Hydration Drink - Pink Lemonade', 'Hydration Drink - Watermelon Splash',
  'Amino Refresher - Mango Madness', 'Amino Refresher - Lemon Lime',
  'Amino Refresher - Watermelon Wave', 'Amino Refresher - Blueberry Rush',
  'Amino Refresher - Strawberry Bliss', 'Tropical Glow',
  'Blueberry Açaí', 'Guayaba Jamaica', 'Jamaica Arándanos', 'Arándanos Jamaica',
  'Limonada Durazno', 'Limonada Jengibre', 'Mango Jengibre', 'Violetas Açaí',
  'Lemon Glow'
);

delete from producto_extras pe
using productos e
where e.id = pe.extra_id
  and e.nombre ilike 'leche%'
  and pe.producto_id in (select producto_id from _grupo where grupo = 'agua_mineral');

insert into producto_extras (producto_id, extra_id)
select g.producto_id, (select id from productos where nombre='Agua' and es_extra limit 1)
from _grupo g where g.grupo in ('shake_numerado', 'agua_mineral')
on conflict do nothing;

insert into producto_extras (producto_id, extra_id)
select g.producto_id, (select id from productos where nombre='Agua mineral' and es_extra limit 1)
from _grupo g where g.grupo = 'agua_mineral'
on conflict do nothing;

insert into producto_extras (producto_id, extra_id)
select g.producto_id, e.id
from _grupo g
cross join (select id from productos where es_extra and nombre ilike 'leche%' and activo) e
where g.grupo in ('cafe_con_leche_default', 'cafe_sin_leche_default')
on conflict do nothing;

insert into producto_extras (producto_id, extra_id)
select g.producto_id, (select id from productos where nombre='Sin leche' and es_extra limit 1)
from _grupo g where g.grupo = 'cafe_sin_leche_default'
on conflict do nothing;
