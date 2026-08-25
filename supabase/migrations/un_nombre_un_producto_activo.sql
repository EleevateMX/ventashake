-- Repone el indice unico por nombre, DESPUES de arreglar el update del
-- sync (ver el_sync_no_resucita_duplicados.sql).
--
-- El orden importa, y por eso hubo que ir y volver: con el update viejo
-- este indice hacia FALLAR el guardado entero de Costeos, y dejar a la
-- tienda sin poder guardar precios es peor que el duplicado que se
-- intenta evitar. Primero se arregla quien crea el conflicto; despues se
-- pone el candado.
--
-- Ademas el insert del sync quedo con
--   on conflict (lower(nombre)) where (activo and not es_extra) do nothing
-- y sin un indice que empate con esa especificacion Postgres rechaza la
-- sentencia entera. Los dos van juntos o ninguno.
create unique index if not exists productos_un_nombre_activo
  on productos (lower(nombre))
  where activo and not es_extra;

comment on index productos_un_nombre_activo is
  'Dos productos activos no pueden llamarse igual: eso salia como dos '
  'tarjetas identicas en el kiosko. No aplica a los extras (hay un '
  '"Espresso" vendible y otro extra, y son cosas distintas) ni a los '
  'apagados, que son historia y deben poder repetirse.';
