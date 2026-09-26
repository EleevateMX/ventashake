-- El combo se reparte por estacion (26/09).
--
-- Pedido de gerencia: cuando una orden lleva alimento y bebida -- sobre todo
-- un combo -- cada estacion ve solo lo suyo, con el mismo folio y nombre, y
-- sabiendo que la otra parte se prepara en la otra estacion.
--
-- Lo que ya funcionaba: cada renglon va a la estacion de su categoria, asi
-- que un sandwich con un latte ya salia en las dos pantallas. Lo roto eran
-- los combos: todas sus opciones (el cafe, el te, el sandwich, el wrap, la
-- galleta) viven en la categoria "Extras Bebidas", y el combo mismo en
-- "Combos" -> Barra. La chapata se anunciaba en Barra y en Cocina no salia.
--
-- Dos reglas nuevas:
--  1. Un extra SIGUE A SU PRODUCTO, salvo que el vinculo diga otra cosa
--     (producto_extras.estacion). Antes seguia a su propia categoria: por eso
--     el "Extra Aderezo Chipotle" de un wrap se iba a Barra (3 veces en 30
--     dias) y jalaba el wrap con el.
--  2. Cuando una opcion se prepara en OTRA estacion que su combo, viaja sola
--     -- sin arrastrar al combo como si hubiera que prepararlo dos veces -- y
--     lleva el nombre del combo (cocina_items.combo_nombre) y las notas del
--     combo que le tocan: el "Sin hielo" del combo tiene que llegar a Barra,
--     tambien en la etiqueta impresa, y el "Sin queso" no.
--
-- Las notas se reparten por la estacion de cada observacion: una nota que es
-- observacion de la OTRA estacion no se copia; lo que no es observacion (la
-- leche, texto libre) va a las dos. Mejor ruido que una instruccion perdida.

alter table producto_extras
  add column if not exists estacion text
    check (estacion in ('bebidas', 'alimentos'));

comment on column producto_extras.estacion is
  'En que estacion se prepara esta opcion cuando es distinta de la de su producto (combos). NULL = sigue a su producto.';

alter table cocina_items add column if not exists combo_nombre text;

comment on column cocina_items.combo_nombre is
  'Si esta parte se prepara en otra estacion que su combo: el nombre del combo, para que no se lea como un pedido aparte.';

-- Las notas que le tocan a una estacion.
create or replace function public.fn_notas_para_estacion(p_notas text, p_cocina_id uuid)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select nullif(string_agg(x.f, ', ' order by x.n), '')
    from (
      select btrim(t.f) as f, t.n
        from regexp_split_to_table(coalesce(p_notas, ''), ',') with ordinality as t(f, n)
    ) x
   where x.f <> ''
     and not exists (
       select 1 from observaciones o
        where o.activa
          and o.cocina_id is not null
          and o.cocina_id is distinct from p_cocina_id
          and lower(o.texto) = lower(x.f));
$function$;

create or replace function public.fn_crear_pedidos_cocina()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and not NEW.es_demo then

    -- A donde va cada renglon. Se calcula igual en las dos sentencias (CTE
    -- repetido, sin tablas temporales: dentro de un trigger sobre ordenes
    -- una tabla temporal es como se paro la caja el 27/08).
    with base as (
      select oi.id as item_id, oi.padre_item_id, oi.producto_id, p.nombre,
             coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas'))) as cocina_cat,
             coalesce(c.va_a_pantalla, true) as pantalla
        from orden_items oi
        left join productos p on p.id = oi.producto_id
        left join categorias c on c.id = p.categoria_id
       where oi.orden_id = NEW.id
    ),
    destino as (
      select b.item_id, b.padre_item_id, b.pantalla,
             case when b.padre_item_id is null or pa.item_id is null then b.cocina_cat
                  else coalesce(ce.id, pa.cocina_cat) end as cocina_id,
             pa.cocina_cat as cocina_padre
        from base b
        left join base pa on pa.item_id = b.padre_item_id
        left join producto_extras pe on pe.producto_id = pa.producto_id and pe.extra_id = b.producto_id
        left join cocinas ce on ce.slug = pe.estacion
    ),
    propios as (
      select item_id, cocina_id from destino where pantalla
    ),
    -- El padre acompana a su extra (para que no viaje huerfano) SOLO si el
    -- extra se prepara en la misma estacion. Si se reparte, no se arrastra.
    con_padres as (
      select item_id, cocina_id from propios
      union
      select d.padre_item_id, d.cocina_id
        from destino d
       where d.pantalla and d.padre_item_id is not null and d.cocina_id = d.cocina_padre
    )
    insert into pedidos_cocina (orden_id, cocina_id)
    select distinct NEW.id, cocina_id from con_padres
    on conflict (orden_id, cocina_id) do nothing;

    with base as (
      select oi.id as item_id, oi.padre_item_id, oi.producto_id, p.nombre,
             coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas'))) as cocina_cat,
             coalesce(c.va_a_pantalla, true) as pantalla
        from orden_items oi
        left join productos p on p.id = oi.producto_id
        left join categorias c on c.id = p.categoria_id
       where oi.orden_id = NEW.id
    ),
    destino as (
      select b.item_id, b.padre_item_id, b.pantalla, b.nombre,
             case when b.padre_item_id is null or pa.item_id is null then b.cocina_cat
                  else coalesce(ce.id, pa.cocina_cat) end as cocina_id,
             pa.cocina_cat as cocina_padre,
             (pe.grupo is not null) as con_grupo,
             (b.nombre ~* '^\s*(leche\y|agua\y|sin leche)') as es_base
        from base b
        left join base pa on pa.item_id = b.padre_item_id
        left join producto_extras pe on pe.producto_id = pa.producto_id and pe.extra_id = b.producto_id
        left join cocinas ce on ce.slug = pe.estacion
    ),
    propios as (
      select item_id, cocina_id from destino where pantalla
    ),
    con_padres as (
      select item_id, cocina_id from propios
      union
      select d.padre_item_id, d.cocina_id
        from destino d
       where d.pantalla and d.padre_item_id is not null and d.cocina_id = d.cocina_padre
    ),
    -- Las partes que se fueron a otra estacion que su combo.
    repartidos as (
      select d.item_id, d.padre_item_id, d.cocina_id, d.con_grupo, d.es_base, d.nombre
        from destino d
       where d.padre_item_id is not null and d.cocina_padre is not null
         and d.cocina_id <> d.cocina_padre
    ),
    -- La opcion principal de esa parte (el cafe, el te): la que lleva las
    -- notas del combo. Si no hay ninguna con grupo, todas las llevan.
    principal as (
      select r.item_id from repartidos r
       where (r.con_grupo and not r.es_base)
          or not exists (select 1 from repartidos r3
                          where r3.padre_item_id = r.padre_item_id and r3.cocina_id = r.cocina_id
                            and r3.con_grupo and not r3.es_base)
    ),
    -- La leche cobrada del latte del combo no sale como etiqueta suelta: se
    -- escribe EN la bebida donde se usa. Una etiqueta de "Leche de
    -- almendras" sola en la barra no dice a que vaso va.
    absorbidos as (
      select r.item_id, r.padre_item_id, r.cocina_id from repartidos r
       where r.es_base and r.item_id not in (select item_id from principal)
    )
    insert into cocina_items (pedido_id, orden_item_id, producto_id, cantidad, personalizacion, combo_nombre)
    select pc.id, oi.id, oi.producto_id, oi.cantidad,
           case
             when pr.item_id is not null then
               nullif(concat_ws(', ',
                 nullif(oi.personalizacion, ''),
                 (select string_agg(concat_ws(' ', ob.nombre_base, nullif(ob.notas, '')), ', ')
                    from (select pb.nombre as nombre_base, ab_oi.personalizacion as notas
                            from absorbidos ab
                            join orden_items ab_oi on ab_oi.id = ab.item_id
                            join productos pb on pb.id = ab_oi.producto_id
                           where ab.padre_item_id = r.padre_item_id and ab.cocina_id = r.cocina_id) ob),
                 fn_notas_para_estacion(padre.personalizacion, ap.cocina_id)), '')
             when r.item_id is not null then oi.personalizacion
             -- El combo que tiene partes en otra estacion: sin las notas que
             -- son de la otra estacion.
             when exists (select 1 from repartidos r2 where r2.padre_item_id = oi.id) then
               fn_notas_para_estacion(oi.personalizacion, ap.cocina_id)
             else oi.personalizacion
           end,
           case when r.item_id is not null then pp.nombre end
    from con_padres ap
    join orden_items oi on oi.id = ap.item_id
    join pedidos_cocina pc on pc.orden_id = NEW.id and pc.cocina_id = ap.cocina_id
    left join repartidos r on r.item_id = oi.id
    left join principal pr on pr.item_id = oi.id
    left join orden_items padre on padre.id = r.padre_item_id
    left join productos pp on pp.id = padre.producto_id
    where oi.id not in (select item_id from absorbidos)
    on conflict (orden_item_id) do nothing;
  end if;
  return NEW;
end;
$function$;

-- ── Los cinco combos de hoy ────────────────────────────────────────────
-- El combo en si ES la parte de comida (la chapata) o la trae dentro (el
-- sandwich, el wrap, el muffin): va a Cocina. La galleta, el sandwich, el
-- wrap, el muffin y el chipotle siguen a su combo sin configurar nada. Lo
-- unico que se marca es la bebida: el cafe, el te y su leche o agua se
-- preparan en Barra.
update categorias set cocina_id = (select id from cocinas where slug = 'alimentos')
 where nombre = 'Combos';

-- La bebida y lo que se le pone a la bebida (la leche, el agua).
update producto_extras pe set estacion = 'bebidas'
  from productos p, categorias c, productos e
 where p.id = pe.producto_id and c.id = p.categoria_id and c.nombre = 'Combos'
   and e.id = pe.extra_id
   and (pe.grupo in ('Café', 'Té') or e.nombre ~* '^\s*(leche\y|agua\y|sin leche)');
