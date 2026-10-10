-- «Botes que descuentan otro sabor» sin falsas alarmas (10/10/26).
-- La primera versión comparaba el texto del sabor completo y marcaba como
-- «otro sabor» a la creatina en cápsulas, a los nombres con errores de dedo
-- de Costeos (Apprle, Sheer Bet) y a todo lo que traía gramaje distinto.
-- Perla lo vio y no supo qué hacer con 12 renglones de los que solo uno era
-- real. Ahora se compara por palabras.

create or replace function public.fn_proteinas_elegidas_admin()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  return jsonb_build_object(
    'proteinas', coalesce((
      select jsonb_agg(x order by x.vendidas_30d desc, x.nombre) from (
        select p.id, p.nombre, p.activo,
               (select r.insumo_id from recetas r join insumos i on i.id = r.insumo_id
                 where r.producto_id = p.id and r.cantidad > 0 and i.tipo = 'proteina' limit 1) insumo_id,
               (select i.nombre from recetas r join insumos i on i.id = r.insumo_id
                 where r.producto_id = p.id and r.cantidad > 0 and i.tipo = 'proteina' limit 1) insumo,
               coalesce((select sum(oi.cantidad) from orden_items oi join ordenes o on o.id = oi.orden_id
                          where oi.producto_id = p.id and o.pagado and o.created_at > now() - interval '30 days'), 0) vendidas_30d
          from productos p
         where p.es_extra and p.archivado_en is null and p.nombre ilike 'prote_na %'
      ) x), '[]'::jsonb),
    'insumos', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'scoops_por_bote', i.contenido) order by i.nombre)
        from insumos i where i.activo and i.tipo = 'proteina'), '[]'::jsonb),
    -- Botes (Suplementos) cuya receta descuenta un insumo de OTRO sabor.
    -- (10/10) Por palabras, no por texto exacto: «Creatina 125caps» contra
    -- «Creatina (Cápsulas) - R» o «Rainbow Sherbet» contra «Rainbow Sheer
    -- Bet» son el mismo bote. Se marca solo si NINGUNA palabra del sabor
    -- (4+ letras, sin gramaje) aparece en el insumo: «Vainilla 899gr» →
    -- «Double Rich Chocolate - R».
    'botes_otro_sabor', coalesce((
      select jsonb_agg(jsonb_build_object('producto', b.nombre, 'insumo', b.insumo) order by b.nombre) from (
        select p.nombre, i.nombre insumo,
               translate(lower(split_part(p.nombre, ' - ', 2)), 'áéíóúüñ', 'aeiouun') sabor_p,
               translate(lower(i.nombre), 'áéíóúüñ', 'aeiouun') ins
          from productos p
          join categorias c on c.id = p.categoria_id and c.nombre ilike 'suplementos%'
          join recetas r on r.producto_id = p.id and r.cantidad > 0
          join insumos i on i.id = r.insumo_id and i.tipo = 'proteina'
         where p.activo and p.archivado_en is null
      ) b
      where exists (select 1 from regexp_split_to_table(b.sabor_p, '[^a-z0-9]+') w
                     where length(w) >= 4 and w !~ '^[0-9]')
        and not exists (select 1 from regexp_split_to_table(b.sabor_p, '[^a-z0-9]+') w
                         where length(w) >= 4 and w !~ '^[0-9]'
                           and position(left(w, 4) in b.ins) > 0)), '[]'::jsonb)
  );
end;
$function$;
