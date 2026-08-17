-- ============================================================================
-- Onzas por producto (para el visor de comandas)
-- ============================================================================
-- Quien prepara necesita saber qué vaso agarrar ANTES de leer la receta.
-- Se muestra SOLO en las pantallas de cocina: la etiqueta impresa no cambia
-- (petición explícita de la sucursal), y la sincronización desde costeo no
-- toca esta columna, así que lo que se ajuste en Admin se queda.
--
-- Regla dictada por la sucursal (13/08/26): los protein lattes y El Clásico
-- son de 16 oz; el resto de los shakes, de 20 oz. "Protein lattes" se
-- interpretó como los estilo latte del menú numerado (Mocha Rush, Matcha
-- Latte, Dirty Chai, Horchata Latte) — ajustable en Admin si alguno quedó
-- mal clasificado, que para eso es editable.
-- ============================================================================

alter table productos add column if not exists onzas integer;

comment on column productos.onzas is
  'Tamaño del vaso en onzas. Solo informativo para el visor de comandas; null = no se muestra.';

update productos p
set onzas = 20
from categorias c
where c.id = p.categoria_id and c.nombre = 'Shakes'
  and not p.es_extra and p.onzas is null;

update productos set onzas = 16
where not es_extra and (
  lower(nombre) in ('el clásico', 'el clasico')
  or nombre ~* '(mocha rush|matcha latte|dirty chai|horchata latte)'
);
