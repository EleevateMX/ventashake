-- La opcion por defecto de cada grupo de extras, puesta desde Admin.
--
-- Hasta hoy el kiosko decidia la leche de casa con una expresion regular en
-- el codigo ("entera", si no "deslactosada"). Dos problemas:
--
--   1. Cambiar la de casa era un despliegue. Y la sucursal la cambio: de 522
--      shakes de los ultimos 10 dias, la deslactosada gana a la entera por
--      mas del doble, o sea que el personal la esta corrigiendo a mano en
--      cada venta.
--   2. La regla vive en el kiosko. El POS no la tiene, asi que un shake
--      cobrado en caja sale a barra SIN base: 47 de esos 522 (9%).
--
-- El dato queda en el vinculo (producto_id, extra_id) y no en el extra: la
-- misma leche puede ser la de casa en los shakes y no serlo en el cafe.
--
-- Solo una por "clase" dentro de un producto. La clase se deduce igual que
-- en pantalla: primero por el nombre (bases y proteinas tienen seccion
-- propia en el kiosko), y si no, por el grupo escrito en el vinculo.

alter table producto_extras
  add column if not exists por_defecto boolean not null default false;

comment on column producto_extras.por_defecto is
  'La opcion marcada de entrada en ese producto. Solo una por clase (ver fn_clase_extra).';

-- Espejo exacto de lo que el kiosko hace por nombre. Vive aqui para que el
-- servidor pueda decir "estas dos compiten entre si" sin adivinar.
create or replace function fn_clase_extra(p_nombre text, p_grupo text)
returns text
language sql
immutable
as $$
  select case
    -- El nombre manda sobre el grupo, igual que en el kiosko: las bases y
    -- las proteinas tienen seccion propia en pantalla y algunas ademas
    -- traen grupo escrito ('proteina'). Si el grupo ganara, la misma
    -- proteina caeria en dos clases segun el producto.
    when p_nombre ~* '^\s*(leche\y|agua\y|sin leche)' then 'base'
    when p_nombre ~* '^\s*prote[ií]na'                 then 'proteina'
    -- Las galletas se quedan sin clase a proposito: son opcionales de
    -- verdad (ninguna es una respuesta valida), asi que no tienen "de casa".
    when p_nombre ~* 'galleta'                          then null
    when nullif(trim(coalesce(p_grupo, '')), '') is not null
      then 'g:' || trim(p_grupo)
    else null
  end
$$;

-- `create or replace view` BORRA las reloptions: sin el alter de abajo la
-- vista quedaria sin security_invoker y en silencio.
create or replace view vw_producto_extras as
  select pe.producto_id,
         e.id as extra_id,
         e.nombre,
         coalesce(pe.precio, e.precio) as precio,
         e.activo,
         pe.grupo,
         e.marca,
         pe.por_defecto
    from producto_extras pe
    join productos e on e.id = pe.extra_id;

alter view vw_producto_extras set (security_invoker = true);

-- La firma cambia (una columna mas en el RETURNS TABLE), y eso
-- `create or replace` no lo puede hacer.
drop function if exists fn_extra_bebida_productos(uuid);

create function fn_extra_bebida_productos(p_extra_id uuid)
returns table (
  producto_id uuid, nombre text, categoria text, ofrecido boolean,
  precio_propio numeric, precio_base numeric, grupo text, por_defecto boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.nombre,
         coalesce(k.nombre || ' · ' || c.nombre, '—'),
         exists (select 1 from producto_extras pe
                  where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         (select pe.precio from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         (select e.precio from productos e where e.id = p_extra_id),
         (select pe.grupo from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         coalesce((select pe.por_defecto from producto_extras pe
                    where pe.producto_id = p.id and pe.extra_id = p_extra_id), false)
  from productos p
  join categorias c on c.id = p.categoria_id
  join cocinas k on k.id = c.cocina_id
  where p.activo and not p.es_extra
  order by k.slug, c.orden, p.nombre
$$;

grant execute on function fn_extra_bebida_productos(uuid) to authenticated;

-- Marcar la de casa. Apaga a las hermanas de la misma clase en el mismo
-- producto ANTES de prender esta: dos marcadas dejarian el kiosko eligiendo
-- por orden de lectura, que es justo el comportamiento que se quiere quitar.
create or replace function fn_extra_bebida_defecto(
  p_extra_id uuid, p_producto_id uuid, p_por_defecto boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clase text;
begin
  select fn_clase_extra(e.nombre, pe.grupo)
    into v_clase
    from producto_extras pe
    join productos e on e.id = pe.extra_id
   where pe.producto_id = p_producto_id and pe.extra_id = p_extra_id;

  if not found then
    raise exception 'Ese extra no se ofrece en ese producto todavia: marcalo primero.';
  end if;

  if p_por_defecto and v_clase is null then
    raise exception 'Un adicional suelto no tiene "por defecto": ponle un grupo primero.';
  end if;

  if p_por_defecto then
    update producto_extras pe
       set por_defecto = false
      from productos e
     where e.id = pe.extra_id
       and pe.producto_id = p_producto_id
       and pe.por_defecto
       and fn_clase_extra(e.nombre, pe.grupo) = v_clase;
  end if;

  update producto_extras
     set por_defecto = p_por_defecto
   where producto_id = p_producto_id and extra_id = p_extra_id;
end;
$$;

grant execute on function fn_extra_bebida_defecto(uuid, uuid, boolean) to authenticated;
