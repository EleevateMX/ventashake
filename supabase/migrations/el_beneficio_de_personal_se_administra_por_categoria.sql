-- Perla pidio poder agregar y quitar categorias y productos del beneficio
-- sin pedirlo. Producto por producto ya se podia; lo que faltaba es la
-- categoria entera, que es como esta escrita la lista que nos mandaron
-- ("todos los shakes a X").
--
-- No crea productos ni categorias: eso vive en Costeos, que es la fuente
-- de la verdad del catalogo (seccion 2.1). Aqui solo se decide QUIEN tiene
-- precio de personal. Crear un producto desde aqui seria un producto que
-- el siguiente guardado de Costeos apaga.

create or replace function fn_personal_categorias()
returns table(id uuid, nombre text, productos int, con_beneficio int, publico_min numeric, publico_max numeric)
language sql stable security definer set search_path to 'public' as $$
  select c.id, c.nombre,
         count(*)::int,
         count(*) filter (where p.precio_personal is not null)::int,
         min(p.precio), max(p.precio)
    from categorias c
    join productos p on p.categoria_id = c.id and p.activo and not coalesce(p.es_extra, false)
   where fn_es_jefe()
   group by c.id, c.nombre
   order by c.nombre;
$$;

-- Dos formas de poner precio a una categoria, porque las dos existen en la
-- lista del negocio: un precio parejo ("todos los shakes a $65") y un
-- porcentaje ("50% al personal").
--
-- Lo que NO hace es recortar un precio para que quepa: si un producto vale
-- menos que el precio parejo, se deja como esta y se reporta aparte. Un
-- precio de personal mayor al publico no es un beneficio, y ajustarlo en
-- silencio dejaria a gerencia creyendo que puso un numero que no puso.
create or replace function fn_personal_precio_categoria(
  p_categoria_id uuid,
  p_grupo text,
  p_precio numeric default null,
  p_descuento_pct numeric default null,
  p_solo_sin_precio boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_aplicados int; v_omitidos int;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede tocar los precios de personal.';
  end if;
  if p_grupo not in ('shake', 'alimento', 'bebida') then
    raise exception 'El grupo va en shake, alimento o bebida: es el lugar del limite diario que ocupa.';
  end if;
  if (p_precio is null) = (p_descuento_pct is null) then
    raise exception 'Elige una de las dos: un precio parejo o un porcentaje.';
  end if;
  if p_precio is not null and p_precio < 0 then
    raise exception 'Un precio negativo no es un descuento.';
  end if;
  if p_descuento_pct is not null and p_descuento_pct not between 1 and 100 then
    raise exception 'El descuento va entre 1 y 100 por ciento.';
  end if;

  with objetivo as (
    select p.id, p.precio
      from productos p
     where p.categoria_id = p_categoria_id
       and p.activo and not coalesce(p.es_extra, false)
       and (not p_solo_sin_precio or p.precio_personal is null)
  ),
  cabe as (
    select id, case when p_precio is not null then p_precio
                    else round(precio * (100 - p_descuento_pct) / 100, 2) end as nuevo
      from objetivo
     where p_precio is null or precio >= p_precio
  ),
  hecho as (
    update productos p
       set precio_personal = c.nuevo, grupo_personal = p_grupo
      from cabe c where p.id = c.id
    returning 1
  )
  select (select count(*)::int from hecho),
         (select count(*)::int from objetivo) - (select count(*)::int from cabe)
    into v_aplicados, v_omitidos;

  return jsonb_build_object('aplicados', v_aplicados, 'omitidos', v_omitidos);
end;
$$;

-- Quitar el beneficio de una categoria entera. Sin precio de personal se
-- cobra completo, que es el valor por omision de todo el catalogo: quitarlo
-- nunca deja a nadie pagando de mas de lo que paga el publico.
create or replace function fn_personal_quitar_categoria(p_categoria_id uuid)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare v_n int;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede tocar los precios de personal.';
  end if;
  with hecho as (
    update productos set precio_personal = null, grupo_personal = null
     where categoria_id = p_categoria_id and precio_personal is not null
    returning 1
  ) select count(*)::int into v_n from hecho;
  return v_n;
end;
$$;

revoke execute on function fn_personal_categorias() from public, anon;
revoke execute on function fn_personal_precio_categoria(uuid, text, numeric, numeric, boolean) from public, anon;
revoke execute on function fn_personal_quitar_categoria(uuid) from public, anon;
grant execute on function fn_personal_categorias() to authenticated;
grant execute on function fn_personal_precio_categoria(uuid, text, numeric, numeric, boolean) to authenticated;
grant execute on function fn_personal_quitar_categoria(uuid) to authenticated;
