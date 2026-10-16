-- El descuento de inventario entiende las opciones y lo fijo de un combo (16/10/26).
--
-- Dos cambios a `fn_descontar_inventario_por_orden`, parcheados con ancla
-- (la función es el camino del dinero: corre en cada cobro):
--
-- 1. Cada renglón descuenta la receta de `coalesce(inventario_como, él
--    mismo)`. La opción «Blueberry» del combo descuenta la receta de
--    «Muffin - Blueberry». Lo que no está en `inventario_como` —todo lo
--    demás— se queda exactamente igual.
-- 2. Una rama más para `combo_fijos`: receta del fijo × su cantidad ×
--    combos vendidos.
--
-- Sin descuento doble: el combo en sí no tiene receta (si un día la tuviera,
-- Admin → Combos lo marca), cada opción descuenta una vez como renglón hijo,
-- y lo fijo una vez por combo.

do $$
declare
  v_def text;
  a1 text := '        from items it
        join recetas r on r.producto_id = it.producto_id
        join insumos i on i.id = r.insumo_id
';
  n1 text := '        from items it
        left join inventario_como ic on ic.producto_id = it.producto_id
        join recetas r on r.producto_id = coalesce(ic.como_producto_id, it.producto_id)
        join insumos i on i.id = r.insumo_id
';
  a2 text := '        join combo_items ci on ci.combo_id = it.producto_id
        join recetas r on r.producto_id = ci.producto_id
';
  n2 text := '        join combo_items ci on ci.combo_id = it.producto_id
        join recetas r on r.producto_id = ci.producto_id
      union all
      -- Lo que el combo trae SIEMPRE (combo_fijos): la chapata de los Milo.
      select r.insumo_id, r.cantidad * cf.cantidad * it.cantidad
        from items it
        join combo_fijos cf on cf.combo_id = it.producto_id
        join recetas r on r.producto_id = cf.producto_id
';
begin
  select pg_get_functiondef('public.fn_descontar_inventario_por_orden()'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then
    raise exception 'ancla 1 de fn_descontar_inventario_por_orden no aparece exactamente una vez';
  end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then
    raise exception 'ancla 2 de fn_descontar_inventario_por_orden no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, a1, n1);
  v_def := replace(v_def, a2, n2);
  execute v_def;
end $$;
