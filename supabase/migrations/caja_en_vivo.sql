-- Caja en vivo: gerencia ve lo que hay en la pantalla del kiosko y lo que
-- pasó en el turno, desde Admin o el teléfono (17/10/26).
--
-- Lo pidió Adrián para inspeccionar la caja. Dos fuentes:
--
-- 1. **Lo que hay en pantalla ahora** (`pantalla_espejo`): el kiosko publica
--    quién cobra, en qué paso va y el carrito que tiene capturado. Es un
--    vistazo, como el de las ventas apartadas: un renglón por pantalla que
--    se pisa, no un historial. No se transmite la pantalla como video.
-- 2. **Lo que la caja hizo y no deja venta** (`caja_eventos`): quitar
--    productos del carrito y vaciar un carrito sin cobrarlo. Una venta
--    cobrada ya queda en `ordenes`; lo que se capturó y se borró no quedaba
--    en ningún lado, y es justo lo que hay que poder revisar. Solo se
--    agrega: nadie lo edita ni lo borra (no hay política de escritura).
--
-- `fn_caja_espejo_publicar` está abierta a `anon` porque el kiosko en modo
-- cajero corre como `anon` (CLAUDE.md §2.2). Leer es solo gerencia
-- (`fn_caja_en_vivo`, candado interno `fn_es_jefe()`).

set lock_timeout = '3s';

create table if not exists public.pantalla_espejo (
  pantalla       text primary key,
  estado         jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);
alter table public.pantalla_espejo enable row level security;

create table if not exists public.caja_eventos (
  id        bigserial primary key,
  pantalla  text not null,
  corte_id  uuid,
  cajero    text,
  tipo      text not null check (tipo in ('quito', 'vacio')),
  detalle   jsonb not null default '{}'::jsonb,
  importe   numeric(10,2),
  creado_en timestamptz not null default now()
);
create index if not exists caja_eventos_creado on public.caja_eventos (creado_en desc);
alter table public.caja_eventos enable row level security;

create or replace function public.fn_caja_espejo_publicar(p_pantalla text, p_estado jsonb, p_eventos jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_corte uuid; e jsonb; n int := 0;
begin
  if coalesce(p_pantalla, '') !~ '^[a-z]+:[a-z0-9]{2,12}$' then return; end if;
  -- Un vistazo, no un documento: si llega algo enorme se ignora en silencio.
  if p_estado is null or length(p_estado::text) > 20000 then return; end if;

  insert into pantalla_espejo (pantalla, estado, actualizado_en)
  values (p_pantalla, p_estado, now())
  on conflict (pantalla) do update set estado = excluded.estado, actualizado_en = now();

  if jsonb_typeof(p_eventos) = 'array' and jsonb_array_length(p_eventos) > 0 then
    select id into v_corte from caja_cortes where cerrado_en is null order by abierto_en desc limit 1;
    for e in select * from jsonb_array_elements(p_eventos) loop
      n := n + 1;
      exit when n > 20;
      continue when coalesce(e->>'tipo', '') not in ('quito', 'vacio') or length(e::text) > 4000;
      insert into caja_eventos (pantalla, corte_id, cajero, tipo, detalle, importe)
      values (p_pantalla, v_corte, left(e->>'cajero', 80), e->>'tipo', coalesce(e->'detalle', '{}'::jsonb),
              case when (e->>'importe') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e->>'importe')::numeric end);
    end loop;
  end if;
end;
$$;

create or replace function public.fn_caja_en_vivo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_corte record;
  v_desde timestamptz;
  v jsonb;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver la caja en vivo.';
  end if;

  select c.id, c.folio, c.abierto_en, c.fondo_inicial, e.nombre as abrio
    into v_corte
    from caja_cortes c left join empleados e on e.id = c.empleado_apertura_id
   where c.cerrado_en is null
   order by c.abierto_en desc limit 1;
  v_desde := coalesce(v_corte.abierto_en, now() - interval '12 hours');

  select jsonb_build_object(
    'ahora', now(),
    'pantallas', (select coalesce(jsonb_agg(jsonb_build_object(
                     'pantalla', p.pantalla, 'estado', p.estado,
                     'hace_seg', extract(epoch from now() - p.actualizado_en)::int)
                   order by p.actualizado_en desc), '[]'::jsonb)
                    from pantalla_espejo p
                   where p.pantalla like 'kiosko:%' and p.actualizado_en > now() - interval '12 hours'),
    'corte', case when v_corte.id is null then null else (
      select jsonb_build_object(
        'folio', v_corte.folio, 'abierto_en', v_corte.abierto_en, 'abrio', v_corte.abrio,
        'fondo', r.fondo_inicial, 'ordenes', r.num_ordenes,
        'efectivo', r.total_efectivo, 'tarjeta', r.total_tarjeta, 'clip', r.total_clip,
        'cortesia', r.total_cortesia, 'otro', r.total_otro, 'total', r.total_pagado,
        'efectivo_esperado', r.efectivo_esperado)
        from vw_corte_resumen r where r.corte_id = v_corte.id) end,
    'desde', v_desde,
    'movimientos', (select coalesce(jsonb_agg(m order by m->>'ts' desc), '[]'::jsonb) from (select m from (
        -- Ventas cobradas
        select jsonb_build_object(
                 'ts', o.created_at, 'tipo', 'venta', 'folio', o.folio, 'importe', o.total,
                 'metodo', o.metodo_pago::text, 'cajero', e.nombre,
                 'cliente', o.nombre_cliente, 'descuento', nullif(o.descuento, 0),
                 'cancelada', o.estado::text = 'cancelada',
                 'texto', (select string_agg(case when oi.cantidad > 1 then oi.cantidad || '× ' else '' end || p.nombre, ' · ')
                             from orden_items oi join productos p on p.id = oi.producto_id
                            where oi.orden_id = o.id and oi.padre_item_id is null)) as m
          from ordenes o left join empleados e on e.id = o.empleado_id
         where o.pagado and o.created_at >= v_desde
        union all
        -- Órdenes que se levantaron y no se cobraron (más de 3 minutos).
        -- Ojo: un cobro de Clip que falla y se reintenta deja una de éstas
        -- aunque la venta sí entre después (CLAUDE.md §4).
        select jsonb_build_object(
                 'ts', o.created_at, 'tipo', 'sin_cobrar', 'folio', o.folio, 'importe', o.total,
                 'cajero', e.nombre, 'cliente', o.nombre_cliente,
                 'texto', (select string_agg(case when oi.cantidad > 1 then oi.cantidad || '× ' else '' end || p.nombre, ' · ')
                             from orden_items oi join productos p on p.id = oi.producto_id
                            where oi.orden_id = o.id and oi.padre_item_id is null))
          from ordenes o left join empleados e on e.id = o.empleado_id
         where not o.pagado and o.created_at >= v_desde and o.created_at < now() - interval '3 minutes'
           and coalesce(o.es_demo, false) = false
        union all
        select jsonb_build_object('ts', vc.cancelada_en, 'tipo', 'cancelacion', 'folio', vc.folio,
                 'importe', vc.total_cancelado, 'cajero', e.nombre, 'texto', vc.motivo)
          from ventas_canceladas vc left join empleados e on e.id = vc.cancelada_por
         where vc.cancelada_en >= v_desde
        union all
        select jsonb_build_object('ts', c.creado_en, 'tipo', 'cortesia', 'folio', o.folio,
                 'importe', c.valor, 'cajero', ea.nombre, 'texto', c.motivo)
          from cortesias c join ordenes o on o.id = c.orden_id left join empleados ea on ea.id = c.autorizo_id
         where c.creado_en >= v_desde
        union all
        select jsonb_build_object('ts', ev.creado_en, 'tipo', ev.tipo, 'importe', ev.importe,
                 'cajero', ev.cajero, 'detalle', ev.detalle)
          from caja_eventos ev
         where ev.creado_en >= v_desde
        union all
        select jsonb_build_object('ts', c.abierto_en, 'tipo', 'apertura', 'importe', c.fondo_inicial, 'cajero', e.nombre)
          from caja_cortes c left join empleados e on e.id = c.empleado_apertura_id
         where c.abierto_en >= v_desde
        union all
        select jsonb_build_object('ts', c.cerrado_en, 'tipo', 'cierre', 'importe', c.efectivo_contado, 'cajero', e.nombre)
          from caja_cortes c left join empleados e on e.id = c.empleado_cierre_id
         where c.cerrado_en >= v_desde
      ) x(m) order by m->>'ts' desc limit 300) y)
  ) into v;
  return v;
end;
$$;
