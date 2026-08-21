-- ============================================================================
-- El doble scoop cuesta lo que cuesta ESA proteína
-- ============================================================================
-- Reporte del negocio: "el doble scoop no puede costar lo mismo en todas".
-- Un scoop de Optimum son $25 y uno de Peacock $49; cobrar un precio unico
-- regalaba dinero en las caras y lo encarecia en las baratas.
--
-- La sucursal ya lo habia intentado: creo cuatro productos sueltos llamados
-- "Doble Scoop de Proteína" en $35/$39/$45/$49 que quedaron inactivos y sin
-- ligar a nada, y de paso el extra que si estaba ligado quedo en $0.00 —o
-- sea que hoy el doble scoop no cobra nada.
--
-- Se resuelve SIN logica nueva en el servidor: en vez de un extra que cambia
-- de precio, hay un extra POR MARCA. El kiosko manda el que corresponde a la
-- proteina elegida y `fn_precio_linea` lo cobra como a cualquier otro extra.
-- El precio se edita en Admin -> Extras como todos los demas.
--
-- El vinculo proteina -> doble scoop es la columna `marca`, que es un dato y
-- no un recorte del nombre. Importa: "BIRDMAN FALCON" y "BIRDMAN FALCON
-- PERFORMANCE" comparten prefijo, y adivinar por texto los confundiria.

-- ── 1. Las proteinas declaran su marca ─────────────────────────────────────
-- El orden importa: PERFORMANCE va primero, porque su nombre empieza igual
-- que el de FALCON y si se evaluara despues nunca ganaria.
update productos set marca = case
  when nombre ilike 'Proteína BIRDMAN FALCON PERFORMANCE - %' then 'BIRDMAN FALCON PERFORMANCE'
  when nombre ilike 'Proteína BIRDMAN FALCON - %'             then 'BIRDMAN FALCON'
  when nombre ilike 'Proteína BIRDMAN FITMINGO - %'           then 'BIRDMAN FITMINGO'
  when nombre ilike 'Proteína BIRDMAN PEACOCK - %'            then 'BIRDMAN PEACOCK'
  when nombre ilike 'Proteína OPTIMUM - %'                    then 'OPTIMUM'
  when nombre ilike 'Proteína CBUM - %'                       then 'CBUM'
  when nombre ilike 'Proteína ISO 100 - %'                    then 'ISO 100'
  when nombre ilike 'Proteína ISOPURE - %'                    then 'ISOPURE'
  when nombre ilike 'Proteína MUTANT - %'                     then 'MUTANT'
  when nombre ilike 'Proteína BIRDMAN - %'                    then 'BIRDMAN FALCON'
  else marca
end
where es_extra and nombre ilike 'Proteína %';


-- ── 2. Un doble scoop por marca, con el precio de esa marca ────────────────
-- Precios dictados por el negocio el 20/08.
insert into productos (nombre, precio, categoria_id, es_extra, activo, marca)
select 'Doble scoop - ' || x.marca, x.precio, c.id, true, true, x.marca
from categorias c
join (values
  ('OPTIMUM',                    25),
  ('BIRDMAN FALCON',             35),
  ('BIRDMAN FALCON PERFORMANCE', 39),
  ('BIRDMAN FITMINGO',           39),
  ('BIRDMAN PEACOCK',            49),
  ('CBUM',                       45),
  ('ISOPURE',                    39),
  ('ISO 100',                    45)
) as x(marca, precio) on true
where c.nombre = 'Extras Bebidas'
  and not exists (select 1 from productos p where p.nombre = 'Doble scoop - ' || x.marca);

-- Si ya existian, que queden con el precio y la marca que mandó el negocio.
update productos p set precio = x.precio, marca = x.marca, activo = true, es_extra = true
from (values
  ('OPTIMUM', 25::numeric), ('BIRDMAN FALCON', 35), ('BIRDMAN FALCON PERFORMANCE', 39),
  ('BIRDMAN FITMINGO', 39), ('BIRDMAN PEACOCK', 49), ('CBUM', 45),
  ('ISOPURE', 39), ('ISO 100', 45)
) as x(marca, precio)
where p.nombre = 'Doble scoop - ' || x.marca;


-- ── 3. Se ofrecen en los shakes donde SI se elige proteina ─────────────────
insert into producto_extras (producto_id, extra_id)
select p.id, d.id
from productos p
join productos d on d.es_extra and d.nombre like 'Doble scoop - %'
where p.activo and not p.es_extra and not p.es_combo
  and exists (select 1 from producto_extras pe join productos e on e.id = pe.extra_id
               where pe.producto_id = p.id and e.nombre ilike 'Proteína %')
on conflict (producto_id, extra_id) do nothing;

-- Y en esos, el doble scoop generico sobra: tener los dos mostraria dos
-- botones que hacen lo mismo con precios distintos.
delete from producto_extras pe
using productos e, productos p
where pe.extra_id = e.id and pe.producto_id = p.id
  and e.nombre ilike 'Doble %scoop de prote%'
  and exists (select 1 from producto_extras pe2 join productos e2 on e2.id = pe2.extra_id
               where pe2.producto_id = p.id and e2.nombre like 'Doble scoop - %');


-- ── 4. Donde la proteina es fija, el precio va POR PRODUCTO ────────────────
-- Blueberry Bloom lleva Fitmingo y nada mas, asi que no hay marca que elegir
-- pero su doble scoop igual cuesta lo de Fitmingo. La marca no se adivina:
-- se lee de la RECETA del shake, que es donde de verdad esta escrita.
-- Queda editable shake por shake en Admin -> Extras -> "Donde se ofrece".
update producto_extras pe
set precio = m.precio
from productos e, productos p,
     lateral (
       select case
         when exists (select 1 from recetas r join insumos i on i.id = r.insumo_id
                       where r.producto_id = p.id and i.nombre ilike '%PEACOCK%')  then 49
         when exists (select 1 from recetas r join insumos i on i.id = r.insumo_id
                       where r.producto_id = p.id and i.nombre ilike '%CBUM%')     then 45
         when exists (select 1 from recetas r join insumos i on i.id = r.insumo_id
                       where r.producto_id = p.id and i.nombre ilike '%FITMINGO%') then 39
         when exists (select 1 from recetas r join insumos i on i.id = r.insumo_id
                       where r.producto_id = p.id and i.nombre ilike '%FALCON%')   then 35
         else null
       end as precio
     ) m
where pe.extra_id = e.id and pe.producto_id = p.id
  and e.nombre ilike 'Doble %scoop de prote%'
  and m.precio is not null
  and pe.precio is distinct from m.precio;


-- ── 5. La vista lleva la marca al kiosko ───────────────────────────────────
-- `marca` va AL FINAL, despues de `grupo`: en un `create or replace view`
-- Postgres solo admite columnas nuevas al final. Y `security_invoker` se
-- vuelve a declarar porque un replace REEMPLAZA las opciones de la vista en
-- vez de heredarlas — omitirlo la dejaria sin respetar el RLS de abajo.
create or replace view public.vw_producto_extras
with (security_invoker = true) as
select pe.producto_id,
       e.id as extra_id,
       e.nombre,
       coalesce(pe.precio, e.precio)::numeric(10,2) as precio,
       e.activo,
       pe.grupo,
       e.marca
from producto_extras pe
join productos e on e.id = pe.extra_id;

grant select on public.vw_producto_extras to anon, authenticated;
