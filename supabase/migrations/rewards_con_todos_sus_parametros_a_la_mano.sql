/**
 * Todo lo que define Rewards, en una sola respuesta, para gerencia.
 *
 * Hasta hoy los numeros que gobiernan el programa estaban repartidos en
 * cinco lugares --una funcion, un trigger, dos tablas y un documento-- y la
 * unica forma de contestar "cuanto vale una mancuerna" era abrir el repo.
 * Eso no es un detalle: el dueno no puede planear un programa cuyos
 * parametros no puede ver, y el personal no puede explicarselo al cliente.
 *
 * Ojo con `ganancia`: esos dos numeros viven DENTRO del trigger
 * `fn_acumular_mancuernas` (`least(100, floor(total / 10.0))`) y aqui se
 * repiten para poder mostrarlos. No se movieron al panel a proposito: ese
 * trigger corre en cada cobro, y un trigger sobre `ordenes` ya dejo a la
 * tienda 50 minutos sin poder cobrar una vez. Si algun dia se cambian, se
 * cambian en los dos lados -- por eso el panel dice donde viven.
 */
create or replace function public.fn_rewards_parametros()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_tasa int := fn_tasa_mancuernas();
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede ver esto';
  end if;

  return jsonb_build_object(
    'canje', jsonb_build_object(
      'mancuernas_por_peso', v_tasa,
      'vale_una_mancuerna', round(1::numeric / v_tasa, 4),
      'donde', 'fn_tasa_mancuernas()'
    ),

    'ganancia', jsonb_build_object(
      'pesos_por_mancuerna', 10,
      'tope_por_orden', 100,
      'donde', 'fn_acumular_mancuernas (trigger sobre ordenes)',
      'editable_aqui', false
    ),

    'cupon', jsonb_build_object('meta_mancuernas', 100, 'donde', 'fn_mi_resumen_lealtad'),

    'paquetes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pq.id,
        'nombre', pq.nombre,
        'precio', pq.precio_mxn,
        'mancuernas', pq.mancuernas,
        'vale_pesos', round(pq.mancuernas::numeric / v_tasa, 2),
        'bono_pct', round(((pq.mancuernas::numeric / v_tasa) / nullif(pq.precio_mxn,0) - 1) * 100, 1),
        'activo', pq.activo
      ) order by pq.orden), '[]'::jsonb)
      from paquetes_saldo pq
    ),

    -- Cada tarjeta con su configuracion Y con lo que de verdad cuesta el
    -- premio: el cliente elige del catalogo, asi que el costo real es el
    -- MAS CARO, no el promedio. Ver ese numero al lado de `precio_minimo`
    -- es lo que deja calcular si la tarjeta se paga sola.
    'sellos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', cs.tipo,
        'nombre', coalesce(cs.nombre, initcap(cs.tipo)),
        'requeridos', cs.requeridos,
        'precio_minimo', cs.precio_minimo,
        'aviso_desde', cs.aviso_desde,
        'aviso_texto', cs.aviso_texto,
        'aviso_listo_texto', cs.aviso_listo_texto,
        'activo', cs.activo,
        'premios', pr.cuantos,
        'premio_mas_barato', pr.min_precio,
        'premio_mas_caro', pr.max_precio,
        'clientes_juntando', (
          select count(*) from clientes c
          where c.activo and (case when cs.tipo = 'bebida' then c.sellos_bebida else c.sellos_alimento end) > 0
        ),
        'clientes_listos', (
          select count(*) from clientes c
          where c.activo and (case when cs.tipo = 'bebida' then c.sellos_bebida else c.sellos_alimento end) >= cs.requeridos
        )
      ) order by cs.tipo desc), '[]'::jsonb)
      from config_sellos cs
      cross join lateral (
        select count(*)::int cuantos, min(p.precio) min_precio, max(p.precio) max_precio
        from premios_sellos ps join productos p on p.id = ps.producto_id
        where ps.tipo = cs.tipo and ps.activo and p.activo
      ) pr
    ),

    'premios', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', ps.tipo, 'producto_id', p.id, 'nombre', p.nombre,
        'precio', p.precio, 'activo', ps.activo
      ) order by ps.tipo, p.precio desc, p.nombre), '[]'::jsonb)
      from premios_sellos ps join productos p on p.id = ps.producto_id
      where p.activo
    )
  );
end;
$$;

/**
 * Cambia la configuracion de UNA tarjeta de sellos. Solo gerencia: esto
 * define cuanto regala el negocio, no es un ajuste de pantalla.
 *
 * `requeridos` no se puede bajar por debajo de lo que ya tiene el cliente
 * mas adelantado -- eso convertiria tarjetas a medias en premios que nadie
 * penso regalar, todos el mismo dia.
 */
create or replace function public.fn_config_sellos_guardar(
  p_tipo text,
  p_requeridos integer,
  p_precio_minimo numeric,
  p_aviso_desde integer,
  p_aviso_texto text,
  p_aviso_listo_texto text,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_max int;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las reglas de Rewards.';
  end if;
  if not exists (select 1 from config_sellos where tipo = p_tipo) then
    raise exception 'Esa tarjeta no existe.';
  end if;
  if p_requeridos < 1 or p_requeridos > 99 then
    raise exception 'Las compras requeridas van de 1 a 99.';
  end if;
  if p_aviso_desde < 0 or p_aviso_desde >= p_requeridos then
    raise exception 'El aviso tiene que empezar antes del premio (entre 0 y %).', p_requeridos - 1;
  end if;
  if p_precio_minimo < 0 then
    raise exception 'El precio minimo no puede ser negativo.';
  end if;

  select max(case when p_tipo = 'bebida' then sellos_bebida else sellos_alimento end)
    into v_max from clientes where activo;

  if p_requeridos < coalesce(v_max, 0) then
    raise exception 'Hay un cliente con % sellos: bajar a % le regalaria el premio de inmediato.',
      v_max, p_requeridos;
  end if;

  update config_sellos set
    requeridos        = p_requeridos,
    precio_minimo     = p_precio_minimo,
    aviso_desde       = p_aviso_desde,
    aviso_texto       = nullif(btrim(p_aviso_texto), ''),
    aviso_listo_texto = nullif(btrim(p_aviso_listo_texto), ''),
    activo            = p_activo
  where tipo = p_tipo;
end;
$$;

revoke all on function public.fn_rewards_parametros() from public;
revoke all on function public.fn_config_sellos_guardar(text, integer, numeric, integer, text, text, boolean) from public;
-- `revoke from public` NO quita el permiso de anon: Supabase se lo da por
-- privilegios por omision en cada funcion nueva. Hay que nombrarlo.
revoke execute on function public.fn_rewards_parametros() from anon;
revoke execute on function public.fn_config_sellos_guardar(text, integer, numeric, integer, text, text, boolean) from anon;
grant execute on function public.fn_rewards_parametros() to authenticated, service_role;
grant execute on function public.fn_config_sellos_guardar(text, integer, numeric, integer, text, text, boolean) to authenticated, service_role;
