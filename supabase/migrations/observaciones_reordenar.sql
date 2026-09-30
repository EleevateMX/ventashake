-- Admin -> Extras -> Observaciones: arrastrar para elegir el orden en que
-- salen en el kiosko (pedido de Perla, 30/09). La columna `orden` ya
-- existia y todas las lecturas ya ordenan por ella; faltaba poder
-- escribirla sin teclear numeros.
--
-- Recibe los ids de UNA estacion en el orden nuevo y los numera de 10 en
-- 10. Un id que no sea de esa estacion se rechaza: mezclar estaciones
-- dejaria dos listas peleando por los mismos numeros.
create or replace function public.fn_observaciones_reordenar(p_cocina_slug text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cocina uuid; v_ajenos int;
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede reordenar observaciones.';
  end if;
  select id into v_cocina from cocinas where slug = p_cocina_slug;
  if v_cocina is null then
    raise exception 'No existe la estacion "%".', p_cocina_slug;
  end if;
  select count(*) into v_ajenos
    from unnest(p_ids) as x(id)
   where not exists (select 1 from observaciones o where o.id = x.id and o.cocina_id = v_cocina);
  if v_ajenos > 0 then
    raise exception 'Hay observaciones que no son de esta estacion. Recarga la pagina.';
  end if;

  update observaciones o
     set orden = n.pos * 10
    from unnest(p_ids) with ordinality as n(id, pos)
   where o.id = n.id;
end;
$function$;

revoke execute on function public.fn_observaciones_reordenar(text, uuid[]) from public, anon;
grant execute on function public.fn_observaciones_reordenar(text, uuid[]) to authenticated;
