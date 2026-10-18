-- Entradas de compra: se contaban DOS veces en bodega (18/10/26).
--
-- «Confirmar entrada» en Costeos llama a fn_entrada_confirmar, que suma la
-- mercancía a `inventario_stock`. Luego Costeos se suma lo mismo en su
-- documento (invOriginal) y guarda; fn_sync_stock_costos compara contra su
-- último valor (`costos_stock_sync`) y vuelve a sumar la diferencia. Llegaba
-- 1 paquete y bodega decía 2; al traspasarlo al kiosko quedaba 1 fantasma
-- («sigue apareciendo uno en bodega»). Pasó en TODA entrada de bebidas,
-- snacks y proteína desde julio (el empaque no: Costeos lo apunta en `stock`,
-- que la sincronización no lee). Perla lo venía corrigiendo con conteos.
--
-- Arreglo: la entrada sube también el último valor que la sincronización
-- tiene de Costeos, en la misma cantidad. Cuando Costeos guarda su documento
-- con la entrada, la diferencia ya es cero. Si una pestaña vieja guardara sin
-- la entrada, la resta se corrige sola en cuanto guarde la que sí la tiene:
-- `costos_stock_sync` siempre termina igual al documento.
--
-- De paso:
--   · La PROTEÍNA entra en scoops. La bodega del sistema cuenta scoops
--     (botes × scoops por bote, como la sincronización) y la entrada sumaba
--     botes: 1 bote = +1 scoop.
--   · Entrada POR PIEZA (una línea con `"almacen":"kiosko"`): «tengo el pack
--     de 6 pero solo meto 1 Gatorade». Va directo al kiosko en piezas, y el
--     costo de compra del insumo se sigue guardando por caja
--     (`piezas_por_caja`), como lo guarda una entrada normal.
--   · `entrada_lineas` guarda a qué almacén fue cada línea y con qué factor,
--     para que cancelar regrese exactamente lo que entró.
--
-- Sin tablas temporales (CLAUDE.md §4: corren desde la app).

set lock_timeout = '3s';

alter table public.entrada_lineas add column if not exists almacen_id uuid references public.almacenes(id);
alter table public.entrada_lineas add column if not exists factor_stock numeric not null default 1;

create or replace function public.fn_entrada_confirmar(p_almacen_id uuid, p_proveedor text, p_factura text, p_forma_pago text, p_fecha date, p_costo_envio numeric, p_lineas jsonb, p_clave text)
returns entradas_compra
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clave_real text;
  v_envio numeric := greatest(0, coalesce(p_costo_envio, 0));
  v_subtotal_total numeric;
  v_n integer;
  v_entrada entradas_compra;
  l jsonb;
  v_ord bigint;
  v_insumo uuid;
  v_cant numeric;
  v_costo numeric;
  v_envio_linea numeric;
  v_costo_final numeric;
  v_subtotal numeric;
  v_envio_acum numeric := 0;
  v_lote_id uuid;
  v_costo_antes numeric;
  v_contenido_antes numeric;
  v_kiosko uuid;
  v_alm uuid;
  v_nombre text;
  v_factor numeric;
  v_es_prot boolean;
  v_rastreado boolean;
  v_piezas numeric;
  v_stock numeric;
begin
  select clave_compras into v_clave_real from parametros where id = 'default';
  if nullif(trim(coalesce(p_clave, '')), '') is null or not (
       trim(p_clave) = trim(coalesce(v_clave_real, ''))
       or exists (select 1 from app_data a
                   where trim(p_clave) in (nullif(trim(a.data->'params'->>'claveCompras'), ''),
                                           nullif(trim(a.data->'params'->>'clave'), '')))) then
    raise exception 'Clave de compras incorrecta';
  end if;

  if p_almacen_id is null or not exists (select 1 from almacenes where id = p_almacen_id) then
    raise exception 'Almacén inválido';
  end if;
  if p_fecha is null then
    raise exception 'Falta la fecha de la entrada';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) x
              where nullif(x->>'insumo_id', '') is null
                 or coalesce((x->>'cantidad')::numeric, 0) <= 0
                 or coalesce((x->>'costo_unitario')::numeric, 0) < 0) then
    raise exception 'Hay líneas con producto sin resolver, cantidad inválida o costo negativo';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) x
              where not exists (select 1 from insumos i where i.id = (x->>'insumo_id')::uuid)) then
    raise exception 'Algún producto de la entrada no existe en el catálogo real';
  end if;

  select id into v_kiosko from almacenes where tipo = 'kiosko' order by id limit 1;

  select coalesce(sum((x->>'cantidad')::numeric * coalesce((x->>'costo_unitario')::numeric, 0)), 0), count(*)
    into v_subtotal_total, v_n
    from jsonb_array_elements(p_lineas) x;

  insert into entradas_compra (almacen_id, proveedor, factura, forma_pago, fecha, costo_envio, subtotal_mercancia, total)
  values (p_almacen_id, nullif(p_proveedor,''), nullif(p_factura,''), nullif(p_forma_pago,''), p_fecha, v_envio, v_subtotal_total, v_subtotal_total + v_envio)
  returning * into v_entrada;

  for l, v_ord in select x, o from jsonb_array_elements(p_lineas) with ordinality as t(x, o) order by o loop
    v_insumo := (l->>'insumo_id')::uuid;
    v_cant   := (l->>'cantidad')::numeric;
    v_costo  := coalesce((l->>'costo_unitario')::numeric, 0);

    v_subtotal := round(v_cant * v_costo, 4);
    if v_ord = v_n then
      v_envio_linea := v_envio - v_envio_acum;
    elsif v_subtotal_total > 0 then
      v_envio_linea := round(v_envio * (v_cant * v_costo) / v_subtotal_total, 2);
    else
      v_envio_linea := round(v_envio / v_n, 2);
    end if;
    v_envio_acum := v_envio_acum + v_envio_linea;
    v_costo_final := v_costo + v_envio_linea / v_cant;

    -- A qué almacén va esta línea: por pieza → kiosko; si no, el de la entrada.
    v_alm := case when l->>'almacen' = 'kiosko' and v_kiosko is not null then v_kiosko else p_almacen_id end;

    select nombre, costo_compra, contenido into v_nombre, v_costo_antes, v_contenido_antes
      from insumos where id = v_insumo;

    -- Proteína en bodega: botes → scoops, con el mismo dato que usa la
    -- sincronización (scoops por bote del documento de Costeos).
    v_factor := 1;
    v_es_prot := false;
    if v_alm <> coalesce(v_kiosko, '00000000-0000-0000-0000-000000000000'::uuid) then
      select coalesce(nullif(x->>'scoops', '')::numeric, 1), true into v_factor, v_es_prot
        from app_data, jsonb_array_elements(data->'proteins') x
       where lower(trim(x->>'marca') || ' - ' || trim(x->>'sabor')) = lower(v_nombre)
       limit 1;
      v_factor := coalesce(nullif(v_factor, 0), 1);
      v_es_prot := coalesce(v_es_prot, false);
    end if;
    v_stock := v_cant * v_factor;

    -- ¿Costeos se va a sumar esta misma entrada en su documento? Solo lo que
    -- la sincronización lee: proteína, ingredientes, bebidas y snacks (el
    -- empaque lo apunta en otro campo y no se duplicaba).
    v_rastreado := v_es_prot or exists (
      select 1 from app_data a,
             lateral (select jsonb_array_elements(a.data->'shakeIngs') union all
                      select jsonb_array_elements(a.data->'foodIngs') union all
                      select jsonb_array_elements(a.data->'bebidas') union all
                      select jsonb_array_elements(a.data->'snacks')) y(x)
       where lower(trim(y.x->>'nombre')) = lower(v_nombre));

    insert into lotes (insumo_id, almacen_id, numero_lote, cantidad_inicial, cantidad_actual, costo_unitario, fecha_caducidad)
    values (v_insumo, v_alm, p_factura, v_stock, v_stock, v_costo_final / v_factor, nullif(l->>'caducidad','')::date)
    returning id into v_lote_id;

    insert into entrada_lineas (
      entrada_id, insumo_id, cantidad, costo_unitario_capturado, contenido_capturado,
      presentacion_capturada, caducidad, subtotal, envio_prorrateado, costo_unitario_final,
      costo_compra_insumo_antes, contenido_insumo_antes, lote_id, almacen_id, factor_stock
    ) values (
      v_entrada.id, v_insumo, v_cant, v_costo, nullif(l->>'contenido','')::numeric,
      nullif(l->>'presentacion',''), nullif(l->>'caducidad','')::date, v_subtotal, v_envio_linea, v_costo_final,
      v_costo_antes, v_contenido_antes, v_lote_id, v_alm, v_factor
    );

    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, costo_unitario, referencia_id, nota)
    values (v_insumo, v_alm, v_stock, 'compra', v_costo_final / v_factor, v_entrada.id,
      'Entrada' || case when v_alm = v_kiosko and v_alm <> p_almacen_id then ' por pieza' else '' end
               || case when p_factura is not null and p_factura <> '' then ' · factura ' || p_factura else '' end);

    insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
    values (v_alm, v_insumo, v_stock, 0)
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;

    if v_rastreado then
      insert into costos_stock_sync (insumo_id, almacen_id, ultimo_valor)
      values (v_insumo, v_alm, v_stock)
      on conflict (insumo_id, almacen_id)
      do update set ultimo_valor = costos_stock_sync.ultimo_valor + excluded.ultimo_valor, updated_at = now();
    end if;

    -- El costo de compra del insumo se guarda por caja también cuando
    -- entra por pieza: si no, una pieza suelta lo bajaría al precio de una.
    v_piezas := case when v_alm = v_kiosko and v_alm <> p_almacen_id
                     then greatest(coalesce(nullif(l->>'piezas_por_caja', '')::numeric, 1), 1) else 1 end;
    update insumos set
      costo_compra = v_costo_final * v_piezas,
      contenido = coalesce(nullif(l->>'contenido','')::numeric, contenido),
      presentacion = coalesce(nullif(l->>'presentacion',''), presentacion),
      proveedor = coalesce(nullif(p_proveedor,''), proveedor),
      ultima_compra = p_fecha
    where id = v_insumo;
  end loop;

  return v_entrada;
end;
$$;

create or replace function public.fn_entrada_cancelar(p_entrada_id uuid, p_clave text)
returns entradas_compra
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clave_real text;
  v_entrada entradas_compra;
  v_linea record;
  v_es_mas_reciente boolean;
  v_alm uuid;
  v_cant numeric;
begin
  select clave_compras into v_clave_real from parametros where id = 'default';
  if nullif(trim(coalesce(p_clave, '')), '') is null or not (
       trim(p_clave) = trim(coalesce(v_clave_real, ''))
       or exists (select 1 from app_data a
                   where trim(p_clave) in (nullif(trim(a.data->'params'->>'claveCompras'), ''),
                                           nullif(trim(a.data->'params'->>'clave'), '')))) then
    raise exception 'Clave de compras incorrecta';
  end if;

  select * into v_entrada from entradas_compra where id = p_entrada_id for update;
  if not found then
    raise exception 'Entrada no encontrada';
  end if;
  if v_entrada.estado <> 'confirmada' then
    raise exception 'Esta entrada ya está cancelada';
  end if;

  for v_linea in select * from entrada_lineas where entrada_id = p_entrada_id loop
    -- Lo mismo que entró, en el almacén y la unidad en que entró. El último
    -- valor de Costeos NO se toca: Costeos sigue teniendo la entrada en su
    -- documento, y si se bajara, su siguiente guardado la volvería a sumar.
    v_alm  := coalesce(v_linea.almacen_id, v_entrada.almacen_id);
    v_cant := v_linea.cantidad * coalesce(v_linea.factor_stock, 1);

    update inventario_stock set stock_actual = stock_actual - v_cant
    where almacen_id = v_alm and insumo_id = v_linea.insumo_id;

    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, costo_unitario, referencia_id, nota)
    values (v_linea.insumo_id, v_alm, -v_cant, 'ajuste', v_linea.costo_unitario_final / coalesce(nullif(v_linea.factor_stock, 0), 1),
      v_entrada.id, 'Cancelación de entrada' || case when v_entrada.factura is not null then ' · factura ' || v_entrada.factura else '' end);

    if v_linea.lote_id is not null then
      update lotes set cantidad_actual = 0 where id = v_linea.lote_id;
    end if;

    select not exists (
      select 1 from entrada_lineas el2
      join entradas_compra ec2 on ec2.id = el2.entrada_id
      where el2.insumo_id = v_linea.insumo_id and ec2.estado = 'confirmada'
        and (ec2.fecha, el2.created_at) > (v_entrada.fecha, v_linea.created_at)
    ) into v_es_mas_reciente;

    if v_es_mas_reciente then
      update insumos set
        costo_compra = coalesce(v_linea.costo_compra_insumo_antes, costo_compra),
        contenido = coalesce(v_linea.contenido_insumo_antes, contenido)
      where id = v_linea.insumo_id;
    end if;
  end loop;

  update entradas_compra set estado = 'cancelada', cancelada_at = now()
  where id = p_entrada_id
  returning * into v_entrada;

  return v_entrada;
end;
$$;

-- ── Lo que quedó vivo del doble conteo ───────────────────────────────────
-- Todo lo anterior ya lo habían dejado en su número los conteos físicos.
-- Solo Monster Zero Ultra: 1 + 3 paquetes entraron y se traspasaron hoy,
-- bodega real 0, el sistema decía 3. Se corrige solo si sigue en 3.
do $$
declare v_ins uuid; v_bod uuid; v_stock numeric;
begin
  select id into v_bod from almacenes where tipo = 'bodega' order by id limit 1;
  select id into v_ins from insumos where nombre = 'Monster - Zero Ultra' and activo limit 1;
  select stock_actual into v_stock from inventario_stock where insumo_id = v_ins and almacen_id = v_bod;
  if v_stock = 3 then
    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, nota)
    values (v_ins, v_bod, -3, 'ajuste',
      'Corrección: la entrada del 17/10 se contó dos veces (Costeos + sistema). Ya se había traspasado al kiosko.');
    update inventario_stock set stock_actual = 0 where insumo_id = v_ins and almacen_id = v_bod;
  end if;
end $$;
