-- Meter inventario desde el kiosko, por caja o por pieza.
--
-- Hasta ahora la unica forma de cargar existencias era Costeos, que es
-- una hoja de costeo: se escribe el numero absoluto y el trigger deduce
-- la diferencia. Eso funciona para costear y es pesimo para recibir
-- mercancia -- se ve en el historial del agua Kirkland del 06/09:
-- +10, +7, +3, -20, +21 en veinte minutos, que es alguien tecleando
-- mientras el guardado automatico rebota. Nadie estaba equivocandose:
-- la herramienta no era para eso.
--
-- Aqui se cuenta al reves, como se cuenta en la barra: "llegaron 2 cajas
-- de agua" y se suma. Lo que se escribe es el MOVIMIENTO, no el total,
-- asi que teclear no puede dejar el inventario en un numero raro.
--
-- Dos caminos, y la diferencia importa:
--
--   'bodega'  -> traspaso de verdad: RESTA en bodega y SUMA en kiosko.
--                Los traspasos de hoy solo sumaban en el destino (69 que
--                suman, 2 que restan, todos en Kiosko), asi que bodega
--                se quedaba diciendo que todavia tenia lo que ya mando.
--   'directa' -> entrada nueva, no salio de bodega (llego el proveedor a
--                la barra). Solo suma en kiosko.
--
-- Lo que esto NO hace, a proposito: no toca costos, ni proveedores, ni
-- facturas. Eso vive en Costeos y ahi se queda -- el repo es publico y
-- la barra no tiene por que ver margenes. Aqui solo se cuentan piezas.
--
-- Exige personal. A diferencia del cobro, que esta abierto a `anon`
-- porque la caja NO puede caerse, esto si puede pedir sesion sin riesgo:
-- se llama desde el modal de Milo, que ya pide PIN si no hay sesion
-- viva, y si falla no se deja de vender -- solo no se carga inventario.
--
-- `inventario_movimientos` no tiene columna de empleado, asi que quien
-- lo hizo va en la nota. Es lo que se lee cuando alguien pregunta "y
-- estas 40 aguas quien las metio".
--
-- Comprobado ejecutandolo de verdad y revirtiendo: 1 caja de 21 desde
-- bodega dejo kiosko 12 -> 33 y bodega 0 -> -21 (el renglon que
-- faltaba), y una entrada directa del mismo insumo mandado dos veces
-- (10 y 5) nacio como una sola linea de 15.
create or replace function public.fn_inventario_entrada(
  p_lineas jsonb,
  p_origen text default 'directa',
  p_almacen_destino uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_destino uuid;
  v_bodega uuid;
  v_ref uuid := gen_random_uuid();
  v_quien text;
  v_nota_destino text;
  v_res jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cargar inventario';
  end if;

  if p_origen not in ('bodega', 'directa') then
    raise exception 'Origen desconocido: %', p_origen;
  end if;

  select id into v_destino from almacenes
   where case when p_almacen_destino is null then nombre = 'Kiosko'
              else id = p_almacen_destino end
   limit 1;
  if v_destino is null then
    raise exception 'No encuentro el almacen de destino';
  end if;

  if p_origen = 'bodega' then
    select id into v_bodega from almacenes where nombre = 'Bodega' limit 1;
    if v_bodega is null then
      raise exception 'No encuentro la bodega';
    end if;
  end if;

  select nombre into v_quien from empleados where auth_user_id = auth.uid() limit 1;

  v_nota_destino :=
    case when p_origen = 'bodega' then 'Traspaso desde bodega (kiosko)'
         else 'Entrada directa (kiosko)' end
    || coalesce(' - ' || v_quien, '');

  -- Las lineas, ya limpias y sumadas por insumo: si alguien manda el
  -- mismo insumo dos veces, se suma una sola vez y el upsert no choca
  -- consigo mismo ("ON CONFLICT DO UPDATE no puede afectar la fila dos
  -- veces", que seria un error en la cara del cajero por algo que no hizo).
  with crudas as (
    select (l->>'insumo_id')::uuid as insumo_id,
           coalesce((l->>'piezas')::numeric, 0) as piezas
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
  ),
  lineas as (
    select c.insumo_id, sum(c.piezas) as piezas
    from crudas c
    join insumos i on i.id = c.insumo_id
    group by c.insumo_id
    having sum(c.piezas) > 0
  ),
  mov_destino as (
    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota)
    select l.insumo_id, v_destino, l.piezas,
           (case when p_origen = 'bodega' then 'traspaso' else 'ajuste' end)::tipo_movimiento,
           v_ref, v_nota_destino
    from lineas l
    returning insumo_id
  ),
  -- Y sale de bodega, si de ahi vino. Este es el renglon que faltaba.
  mov_origen as (
    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota)
    select l.insumo_id, v_bodega, -l.piezas, 'traspaso'::tipo_movimiento, v_ref,
           'Traspaso hacia kiosko' || coalesce(' - ' || v_quien, '')
    from lineas l
    where p_origen = 'bodega'
    returning insumo_id
  ),
  stock_destino as (
    insert into inventario_stock (almacen_id, insumo_id, stock_actual)
    select v_destino, l.insumo_id, l.piezas from lineas l
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual
    returning insumo_id
  ),
  stock_origen as (
    insert into inventario_stock (almacen_id, insumo_id, stock_actual)
    select v_bodega, l.insumo_id, -l.piezas from lineas l where p_origen = 'bodega'
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual
    returning insumo_id
  )
  select jsonb_build_object(
    'referencia', v_ref,
    'origen', p_origen,
    'quien', v_quien,
    'lineas', count(*),
    'piezas', coalesce(sum(l.piezas), 0),
    'detalle', coalesce(jsonb_agg(jsonb_build_object(
        'insumo', i.nombre, 'piezas', l.piezas) order by i.nombre), '[]'::jsonb)
  ) into v_res
  from lineas l join insumos i on i.id = l.insumo_id;

  return v_res;
end $function$;

revoke execute on function public.fn_inventario_entrada(jsonb, text, uuid) from public, anon;
grant execute on function public.fn_inventario_entrada(jsonb, text, uuid) to authenticated;


-- Lo que el kiosko puede cargar, y cuanto hay de cada cosa.
--
-- Tres decisiones que importan:
--
-- 1. **No se ofrecen los 1628 insumos.** Solo los que usa un producto
--    ACTIVO, o los que ya tienen existencias. El "activo" no es un
--    detalle: los nombres a medias que dejo el guardado automatico de
--    Costeos ("Canada Dry Gi", "Canada Dry Ginger A") **si tienen
--    receta** -- nacieron con su producto gemelo, tambien a medias --, asi
--    que filtrar solo por "tiene receta" los dejaba pasar a todos.
--    Pidiendo que el producto este activo, los doce fantasmas de Canada
--    Dry desaparecen de la lista y quedan 1173 en vez de 1419.
--    Importa porque ofrecerlos seria invitar a que alguien cargue 24
--    aguas en el fantasma y las de verdad sigan sin aparecer: se
--    empeoraria el problema con la pantalla que venia a arreglarlo.
--
-- 2. **Las piezas por caja se sacan de `presentacion`**, que es texto
--    libre: "Caja 10 pz", "Pack 24/355ml", "Pack 21/1L". El primer numero
--    de la cadena es el numero de piezas en los tres formatos (10, 24,
--    21). Si no hay numero se devuelve null y la pantalla no ofrece el
--    boton de caja: mejor sin atajo que con un atajo que miente. Ojo con
--    "Pack 12/1L" -- el primero es la cantidad de piezas y el segundo el
--    contenido de cada una; leerlo al reves cargaria 1 pieza por caja.
--
-- 3. Se devuelve lo que hay en Kiosko **y** en Bodega, porque el cajero
--    tiene que poder ver de donde va a sacar antes de traspasar.
create or replace function public.fn_inventario_catalogo_kiosko()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_res jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver el inventario';
  end if;

  select coalesce(jsonb_agg(x order by x.nombre), '[]'::jsonb) into v_res
  from (
    select i.id, i.nombre, i.unidad, i.presentacion,
           (select round(s.stock_actual, 2) from inventario_stock s
             where s.insumo_id = i.id
               and s.almacen_id = (select id from almacenes where nombre = 'Kiosko' limit 1)
           ) as en_kiosko,
           (select round(s.stock_actual, 2) from inventario_stock s
             where s.insumo_id = i.id
               and s.almacen_id = (select id from almacenes where nombre = 'Bodega' limit 1)
           ) as en_bodega,
           nullif((regexp_match(coalesce(i.presentacion, ''), '(\d+)'))[1], '')::int as por_caja
    from insumos i
    where i.activo
      and (exists (select 1 from recetas r join productos p on p.id = r.producto_id
                   where r.insumo_id = i.id and p.activo)
        or exists (select 1 from inventario_stock s
                   where s.insumo_id = i.id and s.stock_actual <> 0))
  ) x;

  return v_res;
end $function$;

revoke execute on function public.fn_inventario_catalogo_kiosko() from public, anon;
grant execute on function public.fn_inventario_catalogo_kiosko() to authenticated;
