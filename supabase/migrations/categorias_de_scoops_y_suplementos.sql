-- ============================================================================
-- Scoops y Suplementos se parten por tipo, para que la lista no sea enorme
-- ============================================================================
-- Pedido de la sucursal: 45 scoops y 57 suplementos en dos listas corridas
-- son imposibles de recorrer en el kiosko. Se parten por tipo: Proteinas,
-- Creatinas, BCAAs, Colageno, Pre-entrenos, y "Suplementos Birdman" para lo
-- de esa marca que no cae en ninguno de los anteriores.
--
-- Se mantienen SEPARADOS scoops y suplementos: un scoop de Falcon son $35 y
-- el bote $510. Juntarlos en una sola "Proteinas" pondria uno al lado del
-- otro con nombres casi iguales, que es justo la confusion que se quiere
-- evitar.
--
-- "Inositol" NO se crea como categoria propia aunque venia en la lista: todo
-- el inositol del catalogo es Birdman, y el negocio pidio explicitamente que
-- el inositol de Birdman viviera en "Suplementos Birdman". Una categoria
-- vacia solo estorba; el dia que entre un inositol de otra marca se crea.
--
-- Las categorias viejas "Scoops" y "Suplementos" se quedan y quedan vacias a
-- proposito: son la bandeja de entrada. La sincronizacion sigue dando de alta
-- ahi lo que se agregue en costosshake (su `cat` es fijo), y desde Admin se
-- archiva en la subcategoria que toque. Asi nada aparece "perdido".
--
-- Esto sobrevive a la sincronizacion: las filas de costosshake no traen
-- `categoria`, y el sync hace `coalesce(cat_del_json, la_que_ya_tiene)`.
-- Verificado sobre las 128 filas antes de mover nada.

-- ── 1. Las categorias nuevas ───────────────────────────────────────────────
-- Heredan la estacion y el `va_a_pantalla` de su categoria madre, para no
-- cambiar de paso un comportamiento que nadie pidio.
insert into categorias (cocina_id, nombre, orden, activa, va_a_pantalla)
select madre.cocina_id, x.nombre, x.orden, true, madre.va_a_pantalla
from (values
  ('Scoops - Proteínas',      14, 'Scoops'),
  ('Scoops - Creatinas',      15, 'Scoops'),
  ('Scoops - BCAAs',          16, 'Scoops'),
  ('Scoops - Colágeno',       17, 'Scoops'),
  ('Scoops - Pre-entrenos',   18, 'Scoops'),
  ('Scoops - Birdman',        19, 'Scoops'),
  ('Suplementos - Proteínas',    20, 'Suplementos'),
  ('Suplementos - Creatinas',    21, 'Suplementos'),
  ('Suplementos - BCAAs',        22, 'Suplementos'),
  ('Suplementos - Colágeno',     23, 'Suplementos'),
  ('Suplementos - Pre-entrenos', 24, 'Suplementos'),
  ('Suplementos Birdman',        25, 'Suplementos')
) as x(nombre, orden, madre_nombre)
join categorias madre on madre.nombre = x.madre_nombre
where not exists (select 1 from categorias c where c.nombre = x.nombre);


-- ── 2. Cada producto a su cajon ────────────────────────────────────────────
-- El orden de los `when` es la regla, no un detalle: creatinas, BCAAs y
-- proteinas se resuelven ANTES que "es de Birdman", porque el negocio pidio
-- que Suplementos Birdman llevara todo lo suyo MENOS esas tres.
--
-- El colageno se escribe con dos acentos distintos en el catalogo
-- ("Colágeno" y "Cólageno"), por eso el patron acepta ambos: con uno solo se
-- quedaban tres productos sin clasificar.
--
-- Va como CTE y no como `update ... from lateral`: un LATERAL en el FROM de
-- un UPDATE no puede leer la tabla que se actualiza ("invalid reference to
-- FROM-clause entry for table p"). Se descubrio ensayandolo, no en produccion.
--
-- Los `es_extra` NO se mueven: los boosters viven dentro del modal, no en la
-- parrilla, y sacarlos de su categoria no le sirve a nadie.
with destino as (
  select p.id as producto_id, nueva.id as categoria_id
  from productos p
  join categorias vieja on vieja.id = p.categoria_id
  cross join lateral (select case
    when p.nombre ~* 'creatin'                        then 'Creatinas'
    when p.nombre ~* 'bcaa|amino energy|xtend|aminon' then 'BCAAs'
    when p.nombre ~* 'c[oó]l[aá]geno|collagen'        then 'Colágeno'
    when p.nombre ~* 'c4 |nitraflex|psychotic|ghost legend|pre.?work|pre.?entreno'
                                                      then 'Pre-entrenos'
    when p.nombre ~* 'falcon|fitmingo|peacock|parrot|cbum|iso ?100|isopure|mutant|optimum nutrition|whey|prote'
                                                      then 'Proteínas'
    when p.nombre ~* 'birdman'                        then 'Birdman'
    else null
  end as tipo) t
  join categorias nueva on nueva.nombre = case
    when vieja.nombre = 'Scoops' then 'Scoops - ' || t.tipo
    when t.tipo = 'Birdman'      then 'Suplementos Birdman'
    else 'Suplementos - ' || t.tipo
  end
  where vieja.nombre in ('Scoops', 'Suplementos')
    and p.activo and not p.es_extra and t.tipo is not null
)
update productos p
set categoria_id = d.categoria_id
from destino d
where d.producto_id = p.id;
