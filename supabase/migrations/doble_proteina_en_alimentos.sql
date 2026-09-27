-- "Doble proteina" en alimentos (27/09): el mismo boton que el doble scoop
-- de los shakes, para la carne del platillo (doble roast beef, doble pollo).
-- Se marca con el grupo "Doble" en el vinculo producto-extra (Admin ->
-- Extras -> grupo), no con una lista de carnes en el codigo: que carne es
-- la proteina de cada platillo lo decide el negocio.
--
-- 1. La revision del menu no lo cuenta como "grupo de una sola opcion":
--    "Doble" es un boton, no un "elige una".
do $$
declare v_def text; v_ancla text := 'pe.grupo is not null and pe.grupo <> ''proteina''';
begin
  v_def := pg_get_functiondef('fn_revision_menu'::regproc);
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'El ancla de fn_revision_menu no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla,
    'pe.grupo is not null and lower(trim(pe.grupo)) not in (''proteina'', ''doble'')');
end $$;

-- 2. La carne de cada platillo de hoy (8 vinculos el 27/09).
update producto_extras pe set grupo = 'Doble'
  from productos p, categorias c, cocinas k, productos e
 where p.id = pe.producto_id and c.id = p.categoria_id and k.id = c.cocina_id
   and e.id = pe.extra_id
   and k.slug = 'alimentos' and c.nombre <> 'Combos' and p.activo and e.activo
   and pe.grupo is null
   and e.nombre ~* '^\s*extra\s+(pechuga|pollo|pavo|at[uú]n|roast beef|jam[oó]n|res|carne|salm[oó]n|arrachera)';
