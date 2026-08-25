-- Lo que la caja necesita saber de un cliente para cobrarle, en un viaje.
--
-- El cajero tiene a alguien enfrente esperando: no puede ser una consulta
-- para el saldo, otra para los sellos y otra para el catalogo de premios.
--
-- Devuelve tambien QUE productos cuentan como premio, porque el canje de
-- sellos exige que el premio ya este en la orden: la caja tiene que poder
-- decir "de lo que traes en el carrito, estos pueden ir gratis".
create or replace function fn_rewards_para_caja(p_cliente_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
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
    'existe', true, 'nombre', v_c.nombre, 'codigo', v_c.codigo, 'foto', v_c.foto_url,
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
          where ps.tipo = cs.tipo and ps.activo and p.activo)
      ) order by cs.tipo desc), '[]'::jsonb)
      from config_sellos cs where cs.activo));
end;
$$;
grant execute on function fn_rewards_para_caja(uuid) to authenticated;

-- El tablero de Rewards para gerencia.
--
-- Lo importante no es el numero bonito: es el SALDO EN LA CALLE. Las
-- mancuernas compradas son dinero que ya entro a la caja pero que todavia
-- se debe en producto. Es un pasivo, y hay que poder verlo aparte de las
-- ganadas, que son promocion y no le deben nada a nadie.
create or replace function fn_rewards_admin()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare v_tasa int := fn_tasa_mancuernas();
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede ver esto';
  end if;
  return jsonb_build_object(
    'tasa', v_tasa,
    'en_la_calle', (
      select jsonb_build_object(
        'compradas', coalesce(sum(saldo_mancuernas), 0),
        'compradas_pesos', round(coalesce(sum(saldo_mancuernas),0)::numeric / v_tasa, 2),
        'ganadas', coalesce(sum(mancuernas), 0),
        'ganadas_pesos', round(coalesce(sum(mancuernas),0)::numeric / v_tasa, 2),
        'clientes_con_saldo', count(*) filter (where coalesce(saldo_mancuernas,0) > 0)
      ) from clientes where activo),
    'sellos', (
      select jsonb_build_object(
        'bebida_listas', count(*) filter (where sellos_bebida >= 13),
        'alimento_listas', count(*) filter (where sellos_alimento >= 13),
        'con_sellos', count(*) filter (where sellos_bebida > 0 or sellos_alimento > 0)
      ) from clientes where activo),
    'tarjetas', (
      select coalesce(jsonb_agg(x order by x->>'lote'), '[]'::jsonb) from (
        select jsonb_build_object(
          'lote', coalesce(lote, '(sin lote)'), 'mancuernas', mancuernas,
          'total', count(*),
          'nuevas', count(*) filter (where estado = 'nueva'),
          'canjeadas', count(*) filter (where estado = 'canjeada'),
          'anuladas', count(*) filter (where estado = 'anulada'),
          'pendiente_pesos', round((count(*) filter (where estado='nueva') * mancuernas)::numeric / v_tasa, 2)
        ) as x from tarjetas_regalo group by lote, mancuernas) t),
    'ultimos_movimientos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cliente', c.nombre, 'mancuernas', s.mancuernas, 'tipo', s.tipo,
        'descripcion', s.descripcion,
        'cuando', to_char(s.created_at at time zone 'America/Merida', 'DD/MM HH24:MI')
      ) order by s.created_at desc), '[]'::jsonb)
      from (select * from saldo_movimientos order by created_at desc limit 20) s
      join clientes c on c.id = s.cliente_id));
end;
$$;
grant execute on function fn_rewards_admin() to authenticated;
