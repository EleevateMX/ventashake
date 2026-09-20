-- Admin -> Extras tambien lista los extras que se quedaron sin categoria.
--
-- «Latte Caliente» esta apagado y colgado del Chapata Pick viejo, y por
-- eso el combo del Latte ofrece "elige una" con una sola opcion. Pero
-- **no se podia arreglar desde Admin**: esta pantalla hacia `join
-- categorias` y filtraba por 'Extras Bebidas', asi que un extra sin
-- categoria no aparecia en ninguna lista. Es la misma leccion de la
-- categoria «Extras»: una pantalla que esconde el renglon que explica el
-- problema miente dos veces.
--
-- Son 22 huerfanos, ninguno activo. Aparecen apagados, listos para
-- prenderse y ligarse como cualquier otro.
create or replace function public.fn_extras_bebida_admin()
returns table(id uuid, nombre text, precio numeric, activo boolean, ligado_a bigint,
              vende_solo boolean, suelto_id uuid, suelto_nombre text,
              suelto_precio numeric, suelto_categoria text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.id, p.nombre, p.precio, p.activo,
         (select count(*) from producto_extras pe where pe.extra_id = p.id),
         coalesce(s.activo, false),
         s.id, s.nombre, s.precio, sc.nombre
    from productos p
    left join categorias c on c.id = p.categoria_id
    left join lateral (
      select p2.* from productos p2
       where not p2.es_extra
         and lower(trim(p2.nombre)) =
             lower(trim(regexp_replace(p.nombre, '^\s*extra\s+', '', 'i')))
       order by p2.activo desc
       limit 1
    ) s on true
    left join categorias sc on sc.id = s.categoria_id
   where p.es_extra
     and (c.nombre = 'Extras Bebidas' or p.categoria_id is null)
   order by p.nombre;
$function$;
