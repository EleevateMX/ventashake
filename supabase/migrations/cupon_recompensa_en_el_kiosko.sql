-- Canjear el cupón de recompensa (premio por 100 mancuernas) DESDE EL KIOSKO
-- (24/11/26). Hasta hoy esos cupones solo se podían aplicar en el POS
-- (caja.shakeaholic.mx) — la tienda cobra en el kiosko, así que en la
-- práctica no se usaban: el cliente los juntaba y nadie se los podía bajar.
--
-- fn_canjear_cupon (POS) solo MARCA el cupón usado; el descuento lo mandaba
-- el POS como `descuento` del cliente. Aquí se hace como la tarjeta de
-- sellos (fn_canjear_sellos): el SERVIDOR deja gratis el producto más caro
-- de la orden, baja el total y devuelve lo que queda por pagar. Así el
-- kiosko no manda precios y los tres caminos de cobro (efectivo, terminal,
-- mixto) cobran lo que el servidor recalculó.
--
-- Nace abierta a anon a propósito: el kiosko en modo cajero cobra como anon,
-- igual que fn_canjear_sellos y fn_canjear_cupon. Es más segura que el
-- camino del POS: aquí el cliente no manda el monto, y el cupón tiene que
-- ser uno real, activo, del cliente de la orden, y queda usado (un solo uso).

create or replace function public.fn_canjear_cupon_recompensa(
  p_orden_id uuid, p_cupon_id uuid
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_orden ordenes;
  v_cupon cupones;
  v_item  orden_items;
  v_precio numeric(10,2);
begin
  select * into v_orden from ordenes where id = p_orden_id;
  if not found then raise exception 'La orden no existe'; end if;
  if v_orden.pagado then raise exception 'Esa orden ya está pagada'; end if;

  -- El cupón tiene que ser de premio, activo y vigente. La orden puede no
  -- tener cliente (en el POS se puede escanear un cupón sin identificarlo);
  -- pero si lo tiene, el cupón tiene que ser suyo — no el de otro cliente.
  select * into v_cupon from cupones
   where id = p_cupon_id for update;
  if not found then raise exception 'El cupón no existe.'; end if;
  if v_orden.cliente_id is not null and v_cupon.cliente_id <> v_orden.cliente_id then
    raise exception 'Ese cupón es de otro cliente.';
  end if;
  if v_cupon.tipo not in ('mancuernas', 'cumpleanos') then
    raise exception 'Ese cupón no es un premio de recompensa.';
  end if;
  if v_cupon.estado <> 'activo' then
    raise exception 'El cupón ya fue usado o está cancelado.';
  end if;
  if v_cupon.vence_en < now() then
    raise exception 'El cupón está vencido.';
  end if;

  -- El producto más caro elegible, YA en la orden (para que la comanda y el
  -- inventario sigan bien). Cumpleaños solo cubre shakes; los demás,
  -- cualquiera — igual que itemsElegiblesCupon del POS.
  select oi.* into v_item
    from orden_items oi
    join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
   where oi.orden_id = p_orden_id
     and oi.padre_item_id is null
     and oi.precio_unitario > 0
     and (v_cupon.tipo <> 'cumpleanos' or c.nombre = 'Shakes')
   order by oi.precio_unitario desc
   limit 1;

  if not found then
    raise exception 'Agrega primero un producto a la cuenta y luego aplica el cupón.';
  end if;

  v_precio := v_item.precio_unitario;

  -- El renglón se queda (comanda e inventario) pero deja de cobrarse.
  update orden_items set precio_unitario = 0 where id = v_item.id;
  update ordenes
     set descuento = coalesce(descuento, 0) + v_precio,
         total     = greatest(0, total - v_precio)
   where id = p_orden_id
  returning * into v_orden;

  -- Marcar el cupón usado (un solo uso; el `for update` + estado='activo'
  -- evita que dos cobros lo gasten dos veces).
  update cupones
     set estado = 'usado', usado_en = now(), orden_id_uso = p_orden_id
   where id = p_cupon_id and estado = 'activo';

  return jsonb_build_object(
    'premio', (select nombre from productos where id = v_item.producto_id),
    'valor', v_precio,
    'codigo', v_cupon.codigo,
    'total_a_pagar', v_orden.total
  );
end;
$function$;

-- fn_rewards_para_caja: agregar los cupones de premio vigentes, para que el
-- panel de Rewards del kiosko los enseñe al escanear el QR. (La función ya
-- exige fn_es_staff y el panel ya la consulta por cliente: un solo viaje.)
create or replace function public.fn_rewards_para_caja(p_cliente_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_c clientes;
  v_tasa int := fn_tasa_mancuernas();
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede consultar esto';
  end if;

  select * into v_c from clientes where id = p_cliente_id and activo;
  if not found then return jsonb_build_object('existe', false); end if;

  return jsonb_build_object(
    'existe', true,
    'nombre', v_c.nombre,
    'codigo', v_c.codigo,
    'foto', v_c.foto_url,
    'tasa', v_tasa,
    'ganadas', coalesce(v_c.mancuernas, 0),
    'compradas', coalesce(v_c.saldo_mancuernas, 0),
    'total', coalesce(v_c.mancuernas,0) + coalesce(v_c.saldo_mancuernas,0),
    'vale_pesos', round((coalesce(v_c.mancuernas,0) + coalesce(v_c.saldo_mancuernas,0))::numeric / v_tasa, 2),

    'sellos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', cs.tipo,
        'tiene', case when cs.tipo='bebida' then v_c.sellos_bebida else v_c.sellos_alimento end,
        'requeridos', cs.requeridos,
        'listo', (case when cs.tipo='bebida' then v_c.sellos_bebida else v_c.sellos_alimento end) >= cs.requeridos,
        'premios', (
          select coalesce(jsonb_agg(ps.producto_id), '[]'::jsonb)
          from premios_sellos ps join productos p on p.id = ps.producto_id
          where ps.tipo = cs.tipo and ps.activo and p.activo
        )
      ) order by cs.tipo desc), '[]'::jsonb)
      from config_sellos cs where cs.activo
    ),

    -- Cupones de premio (recompensa por 100 mancuernas, o cumpleaños):
    -- activos y vigentes. Cada uno deja gratis un producto de la cuenta.
    'cupones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', cu.id,
        'codigo', cu.codigo,
        'beneficio', cu.beneficio,
        'tipo', cu.tipo
      ) order by cu.generado_en), '[]'::jsonb)
      from cupones cu
      where cu.cliente_id = p_cliente_id
        and cu.estado = 'activo'
        and cu.vence_en >= now()
        and cu.tipo in ('mancuernas', 'cumpleanos')
    )
  );
end;
$function$;
