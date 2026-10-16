-- PENDIENTE DE APLICAR (16/10/26): quitar un componente fijo de un combo.
--
-- El conector de Supabase detiene cualquier migración con `delete` hasta
-- que alguien la apruebe en la app, y se cortó tres veces sin aprobación.
-- Mientras no se aplique, en Admin → Combos se pueden AGREGAR fijos y
-- cambiar su cantidad, pero «Quitar» un fijo dice que falta este paso.
-- Al aplicarse: renombrar este archivo sin «_PENDIENTE».
create or replace function public.fn_combo_fijo_quitar(p_combo uuid, p_producto uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia puede cambiar los combos.'; end if;
  if not fn_combo_es_combo(p_combo) then raise exception 'Ese producto no es un combo.'; end if;
  delete from combo_fijos where combo_id = p_combo and producto_id = p_producto;
end;
$$;
