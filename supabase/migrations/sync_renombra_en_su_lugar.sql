-- ============================================================================
-- Renombrar en costosshake deja de duplicar y de romper vinculos
-- ============================================================================
-- Reporte de la sucursal: "al querer cambiar los nombres de los scoops y de
-- los suplementos desde Costeos, se borraban de la pagina de admin, y hasta
-- que regresaba a costeos y ponia el nombre como antes es que volvian a
-- aparecer".
--
-- Causa: fn_sync_app_data empata productos POR NOMBRE. Al renombrar, el
-- nombre nuevo no empata con nada, asi que:
--   1. se INSERTA un producto nuevo (sin extras, sin fotos, sin historia), y
--   2. el viejo, cuyo nombre ya no existe en el documento, se DESACTIVA.
-- De ahi que "desaparezca de admin": no desaparecio, se partio en dos.
--
-- Arreglo: antes de empatar por nombre, empatar por CODIGO. 122 de las 128
-- filas de costosshake traen uno (FCA510-R, CBDP950-B, ONCH899-R) y es
-- estable entre renombres. Si el codigo ya existe con otro nombre, es un
-- renombre: se cambia el nombre EN EL LUGAR y el producto conserva sus
-- extras, su foto y su historial de ventas.
--
-- La regla es deliberadamente conservadora: solo renombra cuando el codigo
-- identifica a UN solo producto activo y a UNA sola fila del documento. Hoy
-- hay codigos repetidos en la base ("Americano Caliente" aparece 8 veces con
-- el mismo codigo, herencia del guardado por tecla), y ante la duda es mejor
-- no tocar nada que renombrar el producto equivocado.
--
-- Se parchea leyendo la definicion viva y reescribiendola, para que no quepa
-- una diferencia por transcripcion, y aborta si no encuentra lo que espera.
do $$
declare
  d text;
  ancla constant text := 'update productos p set precio=d.precio';
  renombre constant text :=
$ren$-- Renombre en el lugar: si el codigo ya existe con otro nombre, es el
  -- MISMO producto con nombre nuevo. Sin esto, el nombre nuevo no empata
  -- con nada, se inserta un producto vacio y el viejo se desactiva: el
  -- producto se parte en dos y pierde sus extras.
  -- Solo cuando no hay ambiguedad: un producto activo y una fila.
  update productos p
  set nombre = d.nombre
  from _prod d
  where coalesce(trim(d.codigo),'') <> ''
    and trim(p.codigo) = trim(d.codigo)
    and lower(p.nombre) <> lower(d.nombre)
    and p.activo
    and not p.es_extra
    and not p.es_combo
    and (select count(*) from _prod e where trim(e.codigo) = trim(d.codigo)) = 1
    and (select count(*) from productos q
          where q.activo and not q.es_extra and not q.es_combo
            and trim(q.codigo) = trim(d.codigo)) = 1;

  $ren$;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_sync_app_data';

  if d is null then
    raise exception 'No existe public.fn_sync_app_data.';
  end if;
  if position(ancla in d) = 0 then
    raise exception 'No se encontro el update por nombre. La funcion cambio: revisar a mano.';
  end if;
  if position('_prod' in d) = 0 then
    raise exception 'No se encontro la tabla temporal _prod. La funcion cambio: revisar a mano.';
  end if;
  -- Ya aplicado: no hacer nada (idempotencia).
  if position('Renombre en el lugar' in d) > 0 then
    return;
  end if;

  d := replace(d, ancla, renombre || ancla);
  execute d;
end $$;

do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_sync_app_data';
  if position('Renombre en el lugar' in d) = 0 then
    raise exception 'El parche de renombre no quedo aplicado.';
  end if;
end $$;
