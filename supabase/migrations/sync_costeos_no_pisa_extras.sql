-- ============================================================================
-- La sincronizacion de costosshake deja de pisarle el precio a los extras
-- ============================================================================
-- Reporte de la sucursal: "el agua ya no aparece gratis, ahora aparece en $49"
-- y "el agua mineral VOLVIO a cambiarse a $20 cuando ya lo habia puesto en
-- $10". La palabra "volvio" era la pista: no se guardaba mal, se revertia.
--
-- Causa: dentro de fn_sync_app_data el bloque que actualiza productos empata
-- SOLO POR NOMBRE, sin mirar si el producto es un extra:
--
--   update productos p set precio=d.precio, ..., activo=(d.precio>0)
--   from _prod d where lower(p.nombre)=lower(d.nombre);
--
-- En el catalogo hay dos productos llamados "Agua" (la embotellada de $49 y
-- el extra gratis) y dos "Agua Mineral" (la de $20 y el extra de $10). Cada
-- vez que se guardaba la hoja de costeos, el precio de la embotellada se le
-- copiaba al extra. Y como tambien escribe `activo=(d.precio>0)`, un extra
-- gratis se apagaba solo.
--
-- La propia funcion ya trataba a los extras como intocables en su bloque de
-- baja logica (`p.es_extra=false`). Esto solo la vuelve consistente consigo
-- misma: costosshake manda en el catalogo que ella alimenta, y los extras se
-- administran desde Admin.
--
-- Se parchea leyendo la definicion viva y reescribiendola, en vez de copiar
-- aqui las 13 KB de la funcion: asi no se puede introducir una diferencia por
-- transcripcion, y si el texto esperado no aparece la migracion falla en vez
-- de dejar el arreglo a medias.
do $$
declare
  d text;
  antes_update  constant text := 'from _prod d where lower(p.nombre)=lower(d.nombre);';
  antes_insert  constant text := 'from _prod d where not exists (select 1 from productos p where lower(p.nombre)=lower(d.nombre));';
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_sync_app_data';

  if d is null then
    raise exception 'No existe public.fn_sync_app_data: nada que parchear.';
  end if;

  -- 1) El update deja en paz a los extras.
  if position(antes_update in d) = 0 then
    raise exception 'No se encontro el update por nombre en fn_sync_app_data. La funcion cambio: revisar a mano antes de tocar nada.';
  end if;
  d := replace(d, antes_update,
       'from _prod d where lower(p.nombre)=lower(d.nombre) and not p.es_extra;');

  -- 2) Y un extra que se llame igual deja de impedir que se cree el producto
  --    real. Sin esto, "Agua" el extra bloquearia para siempre el alta de
  --    "Agua" la embotellada.
  if position(antes_insert in d) = 0 then
    raise exception 'No se encontro el insert por nombre en fn_sync_app_data. La funcion cambio: revisar a mano antes de tocar nada.';
  end if;
  d := replace(d, antes_insert,
       'from _prod d where not exists (select 1 from productos p where lower(p.nombre)=lower(d.nombre) and not p.es_extra);');

  execute d;
end $$;

-- Comprobacion: si el parche no quedo, que se sepa aqui y no dentro de tres
-- semanas cuando a alguien se le vuelva a mover un precio.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_sync_app_data';
  if position('lower(p.nombre)=lower(d.nombre) and not p.es_extra;' in d) = 0 then
    raise exception 'El parche no quedo aplicado.';
  end if;
end $$;
