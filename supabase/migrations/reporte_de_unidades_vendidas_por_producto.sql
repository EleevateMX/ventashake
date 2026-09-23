-- Buscar sin pelearse con los acentos. `unaccent` no esta instalada y no
-- vale la pena una extension para esto: la lista de vocales acentuadas
-- del espanol cabe en un translate.
create or replace function public.fn_sin_acentos(p_texto text)
returns text
language sql immutable parallel safe
as $function$
  select translate(lower(coalesce(p_texto, '')),
                   'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN');
$function$;

-- Cuantas piezas de un producto se vendieron en un periodo.
--
-- La vista que habia (vw_productos_mas_vendidos) contesta otra pregunta:
-- "cuales son los top 10 de siempre". Gerencia necesita la contraria —
-- "de ESTE producto, cuantos van hoy / esta semana / este mes"—, que con
-- un top 10 no se puede responder para nada que no este en el top.
--
-- Tres cosas que importan y no son obvias:
--
--  * **El dia es el de Merida, no el de UTC.** Merida es UTC-6 todo el
--    ano, asi que a partir de las 18:00 locales el "hoy" de UTC ya es
--    manana. Eso ya nos dejo el Dashboard en $0 desde las 6 de la tarde
--    todos los dias durante semanas.
--  * **Los extras cuentan aparte.** Una "Leche de Almendras" vendida como
--    hija de un shake es una pieza de leche de almendras: para inventario
--    y para compras eso es exactamente lo que hay que saber. Se marca
--    cuantas vinieron colgadas de otro producto, para poder separarlo.
--  * **Las canceladas y las demo no cuentan.** Un reporte que las incluya
--    no se puede usar para pedir mercancia.
create or replace function public.fn_productos_vendidos(
  p_desde date,
  p_hasta date,
  p_texto text default null
)
returns table(
  producto_id uuid,
  producto text,
  categoria text,
  piezas numeric,
  importe numeric,
  tickets bigint,
  piezas_como_extra numeric
)
language sql stable security definer set search_path to 'public'
as $function$
  select p.id,
         p.nombre,
         c.nombre,
         sum(oi.cantidad),
         sum(oi.cantidad * oi.precio_unitario),
         count(distinct o.id),
         sum(case when oi.padre_item_id is not null then oi.cantidad else 0 end)
    from orden_items oi
    join ordenes o on o.id = oi.orden_id
    join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
   where fn_es_jefe()
     and o.pagado
     and o.estado <> 'cancelada'
     and not o.es_demo
     and (o.created_at at time zone 'America/Merida')::date between p_desde and p_hasta
     and (
       p_texto is null or btrim(p_texto) = ''
       or fn_sin_acentos(p.nombre) like '%' || fn_sin_acentos(btrim(p_texto)) || '%'
       or fn_sin_acentos(coalesce(c.nombre, '')) like '%' || fn_sin_acentos(btrim(p_texto)) || '%'
     )
   group by p.id, p.nombre, c.nombre
   order by sum(oi.cantidad) desc, p.nombre;
$function$;

revoke execute on function public.fn_productos_vendidos(date, date, text) from public;
revoke execute on function public.fn_productos_vendidos(date, date, text) from anon;
