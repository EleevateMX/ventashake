-- Las proteinas que se dan de alta desde Admin nacian SIN `marca`, y eso
-- le cobraba de menos al negocio.
--
-- `fn_extra_bebida_guardar` nunca escribio `marca` -- ni siquiera era un
-- parametro. Todo extra creado desde Admin -> Extras nacia en null. Las
-- que si tenian marca venian de migraciones viejas, y por eso el reporte
-- fue "son las ultimas que agregue, las mas nuevas": eran justo las que
-- habian pasado por esa pantalla.
--
-- Que rompia: el kiosko empata el "Doble scoop - MARCA" con la proteina
-- elegida POR MARCA. Sin marca no empataba, y caia a "el primero que no
-- tenga marca" -- que en El Clasico, ordenado por nombre, es GHOST a $39.
-- Con Sascha ($49) o ISO 100 ($45) elegidas, cobraba $39.
--
-- La marca se deriva del nombre, que ya lleva la convencion que la propia
-- pantalla impone: "Proteina MARCA - Sabor" y "Doble scoop - MARCA".
-- Probado en seco contra el catalogo entero antes de aplicarlo: reproduce
-- las 33 marcas que ya estaban bien, llena las 21 que faltaban, y deja en
-- null "Doble Scoop de Proteina" -- que NO tiene marca a proposito, porque
-- es el de los productos de proteina fija.

/**
 * La marca que le toca a un extra por su nombre, o null si no la lleva.
 *
 * Vive en UNA sola funcion porque la usan dos caminos: el alta desde
 * Admin y el relleno de abajo. Dos copias de esta regla se separan en
 * cuanto alguien toque una.
 */
create or replace function public.fn_marca_de_extra(p_nombre text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(coalesce(
    (regexp_match(coalesce(p_nombre, ''), '^\s*prote[ií]na\s+(.+?)\s*[-–]\s*.+$', 'i'))[1],
    (regexp_match(coalesce(p_nombre, ''), '^\s*doble\s+scoop\s*[-–]\s*(.+)$', 'i'))[1]
  ))
$$;

comment on function public.fn_marca_de_extra(text) is
  'Marca derivada del nombre ("Proteina CBUM - Churro" -> CBUM). null cuando el nombre no la lleva, como "Doble Scoop de Proteina".';

-- Relleno: SOLO donde falta. Las dos "Proteina BIRDMAN - *" guardan
-- BIRDMAN FALCON aunque su nombre diga BIRDMAN; estan apagadas y sin uso,
-- y pisarlas seria cambiar un dato bueno por uno derivado.
update public.productos p
   set marca = fn_marca_de_extra(p.nombre)
 where p.es_extra
   and p.marca is null
   and fn_marca_de_extra(p.nombre) is not null;

-- Y la causa: que el alta la escriba sola.
create or replace function public.fn_extra_bebida_guardar(
  p_nombre text,
  p_precio numeric default 0,
  p_aplicar text default 'shakes'
)
returns productos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat uuid;
  v_row productos;
  v_marca text;
begin
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre del extra es obligatorio.';
  end if;
  if p_aplicar not in ('shakes', 'clasico') then
    raise exception 'p_aplicar debe ser ''shakes'' o ''clasico'', llego: %', p_aplicar;
  end if;

  v_marca := fn_marca_de_extra(p_nombre);

  select id into v_cat from categorias where nombre = 'Extras Bebidas';
  if v_cat is null then
    insert into categorias (nombre, cocina_id, orden)
    values ('Extras Bebidas', (select id from cocinas where slug='bebidas'), 999)
    returning id into v_cat;
  end if;

  -- Reusar si ya existe (aunque haya quedado a medias, como las dos
  -- "Leche Entera"): mismo nombre = mismo extra, se repara en vez de duplicar.
  select * into v_row from productos
   where lower(trim(nombre)) = lower(trim(p_nombre))
     and (es_extra or categoria_id = v_cat)
   order by es_extra desc, activo desc
   limit 1;

  if found then
    update productos
       set es_extra = true, activo = true, precio = coalesce(p_precio, 0), categoria_id = v_cat,
           -- `coalesce` y no asignacion directa: si alguien ya le puso una
           -- marca a mano que no se deriva del nombre, editar el precio no
           -- tiene por que borrarsela.
           marca = coalesce(marca, v_marca)
     where id = v_row.id
    returning * into v_row;
  else
    insert into productos (nombre, precio, categoria_id, es_extra, es_reventa, activo, iva_incluido, marca)
    values (trim(p_nombre), coalesce(p_precio, 0), v_cat, true, false, true, true, v_marca)
    returning * into v_row;
  end if;

  if p_aplicar = 'clasico' then
    insert into producto_extras (producto_id, extra_id)
    select p.id, v_row.id from productos p
     where lower(p.nombre) in ('el clásico', 'el clasico') and p.activo
    on conflict do nothing;
  else
    insert into producto_extras (producto_id, extra_id)
    select p.id, v_row.id
      from productos p join categorias c on c.id = p.categoria_id
     where c.nombre = 'Shakes' and p.activo and not p.es_extra
    on conflict do nothing;
  end if;

  return v_row;
end;
$$;

revoke all on function public.fn_marca_de_extra(text) from public;
grant execute on function public.fn_marca_de_extra(text) to anon, authenticated, service_role;
