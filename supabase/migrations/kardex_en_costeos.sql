-- El Kardex de Costeos enseña lo que de verdad pasó (17/10/26).
--
-- Perla lo pidió con un ejemplo: cada venta con su ticket, fecha, hora y la
-- existencia que va quedando. El Kardex de Costeos (Inventario → 📜) era una
-- lista que Costeos apuntaba en su propio documento —compras, traspasos y
-- conteos hechos desde ahí— y por eso NUNCA vio una venta.
--
-- La historia completa ya existía: `inventario_movimientos`, que es donde el
-- cobro descuenta, y `fn_kardex`, que la lee para Admin con el saldo después
-- de cada renglón. No se escribe una segunda copia de esa lectura (dos
-- copias de la misma regla se separan solas): Costeos la llama por
-- `fn_costos_kardex`, con su token de sesión, y se le agrega lo que Admin no
-- necesitaba — quién cobró el ticket, qué producto del ticket explica el
-- descuento y si la venta se canceló.
--
-- Y cancelar una venta ya puede regresar lo descontado
-- (`fn_venta_regresar_inventario`), como renglón NUEVO ligado al ticket: la
-- venta original no se borra ni se edita.

set lock_timeout = '3s';

-- ── fn_kardex: deja pasar a Costeos y entiende las cancelaciones ─────────
-- `fn_kardex` no la puede llamar `anon` (no tiene EXECUTE). La llama
-- `fn_costos_kardex`, que es SECURITY DEFINER y ya validó el token, y le
-- avisa con un ajuste local de la transacción que solo una función puede
-- poner: PostgREST no deja llamar `set_config` desde fuera.
do $$
declare
  v_def text;
  a1 text := '   where fn_es_staff()';
  n1 text := '   where (fn_es_staff() or current_setting(''shake.kardex_costos'', true) = ''si'')';
  a2 text := '           when m.tipo = ''traspaso'' then ''traspaso''';
  n2 text := '           when m.nota like ''Cancelacion folio%'' then ''cancelacion''
           when m.tipo = ''traspaso'' then ''traspaso''';
  a3 text := '    left join ordenes o on m.tipo = ''venta'' and o.id = m.referencia_id';
  n3 text := '    left join ordenes o on (m.tipo = ''venta'' or m.nota like ''Cancelacion folio%'') and o.id = m.referencia_id';
begin
  v_def := pg_get_functiondef('public.fn_kardex(uuid,uuid,date,date)'::regprocedure);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception 'ancla 1 de fn_kardex'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception 'ancla 2 de fn_kardex'; end if;
  if (length(v_def) - length(replace(v_def, a3, ''))) / length(a3) <> 1 then raise exception 'ancla 3 de fn_kardex'; end if;
  execute replace(replace(replace(v_def, a1, n1), a2, n2), a3, n3);
end $$;

-- ── El Kardex para Costeos ───────────────────────────────────────────────
create or replace function public.fn_costos_kardex(
  p_token uuid, p_nombre text, p_almacen text default null,
  p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  v_ins insumos;
  v_k uuid; v_b uuid; v_alm uuid;
  v_filas jsonb;
begin
  if fn_costos_sesion(p_token) is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  -- Mismo empate que fn_costos_existencias: por nombre, sin mayúsculas.
  select * into v_ins from insumos
   where activo and lower(nombre) = lower(trim(coalesce(p_nombre, '')))
   limit 1;
  if v_ins.id is null then
    return jsonb_build_object('encontrado', false);
  end if;

  select id into v_k from almacenes where tipo = 'kiosko' order by id limit 1;
  select id into v_b from almacenes where tipo = 'bodega' order by id limit 1;
  v_alm := case p_almacen when 'kiosko' then v_k when 'bodega' then v_b end;

  perform set_config('shake.kardex_costos', 'si', true);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id,
           'fecha', k.fecha,
           'almacen', k.almacen,
           'clase', k.clase,
           'entrada', k.entrada,
           'salida', k.salida,
           'saldo', trim_scale(k.saldo),
           'antes', trim_scale(k.saldo - coalesce(k.entrada, 0) + coalesce(k.salida, 0)),
           'responsable', coalesce(e.nombre, k.responsable),
           'folio', k.folio,
           'orden_id', k.orden_id,
           'cancelada', o.estado::text = 'cancelada',
           'productos', t.productos,
           'importe', t.importe,
           'motivo', k.motivo,
           'nota', k.nota,
           'costo_unitario', k.costo_unitario
         ) order by k.fecha desc, k.id desc), '[]'::jsonb)
    into v_filas
    from fn_kardex(v_ins.id, v_alm, p_desde, p_hasta) k
    left join ordenes o on o.id = k.orden_id
    left join empleados e on e.id = o.empleado_id and k.clase = 'venta'
    -- Qué renglón del ticket explica el descuento: el que tiene ESTE insumo
    -- en su receta (la suya, la de su producto real si es opción de combo,
    -- o la de lo fijo del combo). Un extra se enseña con su producto padre:
    -- «El Clásico (Proteína ISO 100 - Churro)».
    left join lateral (
      select string_agg(x.txt, ' · ' order by x.txt) as productos,
             sum(x.importe) as importe
        from (
          select distinct on (coalesce(oi.padre_item_id, oi.id))
                 coalesce(pb.cantidad, oi.cantidad)::text || '× ' ||
                   coalesce(ppb.nombre || ' (' || p.nombre || ')', p.nombre) as txt,
                 coalesce(pb.precio_unitario * pb.cantidad, oi.precio_unitario * oi.cantidad) as importe
            from orden_items oi
            join productos p on p.id = oi.producto_id
            left join orden_items pb on pb.id = oi.padre_item_id
            left join productos ppb on ppb.id = pb.producto_id
            left join inventario_como ic on ic.producto_id = oi.producto_id
           where oi.orden_id = k.orden_id
             and (exists (select 1 from recetas r
                           where r.producto_id = coalesce(ic.como_producto_id, oi.producto_id)
                             and r.insumo_id = v_ins.id)
                  or exists (select 1 from combo_fijos cf join recetas r on r.producto_id = cf.producto_id
                              where cf.combo_id = oi.producto_id and r.insumo_id = v_ins.id))
           order by coalesce(oi.padre_item_id, oi.id), oi.padre_item_id nulls last
        ) x
    ) t on k.orden_id is not null;

  perform set_config('shake.kardex_costos', '', true);

  return jsonb_build_object(
    'encontrado', true,
    'insumo', jsonb_build_object('id', v_ins.id, 'nombre', v_ins.nombre, 'unidad', v_ins.unidad,
                                 'contenido', v_ins.contenido, 'presentacion', v_ins.presentacion),
    'kiosko', (select trim_scale(stock_actual) from inventario_stock where insumo_id = v_ins.id and almacen_id = v_k),
    'bodega', (select trim_scale(stock_actual) from inventario_stock where insumo_id = v_ins.id and almacen_id = v_b),
    'filas', v_filas);
end $$;

-- ── El ticket que originó un renglón ─────────────────────────────────────
create or replace function public.fn_costos_ticket(p_token uuid, p_orden_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if fn_costos_sesion(p_token) is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  select jsonb_build_object(
           'folio', o.folio,
           'fecha', o.created_at,
           'estado', o.estado::text,
           'pagado', o.pagado,
           'metodo_pago', o.metodo_pago::text,
           'total', o.total,
           'cajero', e.nombre,
           'cliente', o.nombre_cliente,
           'cancelacion', (select jsonb_build_object('motivo', vc.motivo, 'por', ec.nombre)
                             from ventas_canceladas vc left join empleados ec on ec.id = vc.cancelada_por
                            where vc.orden_id = o.id order by vc.cancelada_en desc limit 1),
           'items', (select coalesce(jsonb_agg(jsonb_build_object(
                              'nombre', p.nombre, 'cantidad', oi.cantidad,
                              'precio', oi.precio_unitario,
                              'extras', (select coalesce(jsonb_agg(jsonb_build_object(
                                                 'nombre', pe.nombre, 'cantidad', h.cantidad, 'precio', h.precio_unitario)
                                               order by pe.nombre), '[]'::jsonb)
                                           from orden_items h join productos pe on pe.id = h.producto_id
                                          where h.padre_item_id = oi.id))
                            order by p.nombre), '[]'::jsonb)
                       from orden_items oi join productos p on p.id = oi.producto_id
                      where oi.orden_id = o.id and oi.padre_item_id is null))
    into v
    from ordenes o
    left join empleados e on e.id = o.empleado_id
   where o.id = p_orden_id;
  if v is null then raise exception 'Ese ticket no existe.'; end if;
  return v;
end $$;

-- ── Cancelar una venta puede regresar lo descontado ──────────────────────
-- Se llama DESPUÉS de fn_cancelar_venta, y solo si gerencia dice que el
-- producto no se preparó: un shake hecho y tirado sí gastó su proteína.
-- Cada renglón de la venta se devuelve con uno nuevo que apunta al mismo
-- ticket; la venta original queda en la historia tal cual.
create or replace function public.fn_venta_regresar_inventario(p_orden_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_o record; v_yo uuid; v_n int := 0; r record;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede regresar inventario de una venta.';
  end if;
  select id, folio, estado::text estado into v_o from ordenes where id = p_orden_id for update;
  if v_o.id is null then raise exception 'Esa venta no existe.'; end if;
  if v_o.estado <> 'cancelada' then
    raise exception 'Primero cancela la venta: solo se regresa el inventario de una venta cancelada.';
  end if;
  if exists (select 1 from inventario_movimientos
              where referencia_id = p_orden_id and nota like 'Cancelacion folio%') then
    raise exception 'El inventario de esa venta ya se había regresado.';
  end if;
  select e.id into v_yo from empleados e where e.auth_user_id = auth.uid() limit 1;

  for r in
    select insumo_id, almacen_id, sum(-cantidad) as regresa, max(costo_unitario) as costo
      from inventario_movimientos
     where referencia_id = p_orden_id and tipo = 'venta'
     group by insumo_id, almacen_id
    having sum(-cantidad) > 0
  loop
    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, costo_unitario,
                                        referencia_id, nota, empleado_id, motivo,
                                        existencia_antes, existencia_despues)
    select r.insumo_id, r.almacen_id, r.regresa, 'ajuste', r.costo, p_orden_id,
           'Cancelacion folio ' || v_o.folio || ': regresa al inventario', v_yo, null,
           coalesce(s.stock_actual, 0), coalesce(s.stock_actual, 0) + r.regresa
      from (select 1) x
      left join inventario_stock s on s.insumo_id = r.insumo_id and s.almacen_id = r.almacen_id;

    insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
    values (r.almacen_id, r.insumo_id, r.regresa, 0)
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('folio', v_o.folio, 'renglones', v_n);
end $$;
