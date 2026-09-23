-- Cancelar una venta de cualquier dia, desde Admin y dejando rastro.
--
-- La decision que ordena todo lo demas: **el corte del dia original no se
-- recalcula**. Ese turno se arqueo contra el efectivo que habia en el
-- cajon esa noche, y reescribirlo hoy dejaria un arqueo que ya no cuadra
-- contra nada — es como la contabilidad trata una cancelacion: no se
-- borra el asiento, se registra el reverso. Por eso `vw_corte_resumen`
-- filtra por `pagado` y no por `estado`, y se queda asi a proposito.
--
-- Ojo con la otra cara, que si cambia: `vw_ventas_diarias` y
-- `vw_productos_mas_vendidos` SI excluyen las canceladas, asi que el
-- reporte de ventas de ese dia baja. Es correcto -refleja la realidad
-- corregida- pero significa que "Ventas diarias" y "Cortes de caja" van a
-- diferir para ese dia. La diferencia tiene que poder explicarse en un
-- clic: para eso esta la bitacora, y por eso Admin la ensena junto al
-- boton que cancela.
--
-- Lo que esto NO hace: regresar el inventario. Una venta se cancela tanto
-- porque se cobro de mas como porque el producto ya se preparo y se
-- entrego, y el sistema no puede saber cual de las dos fue. Inventar
-- existencias es peor que no moverlas: un negativo se ve y se corrige, un
-- stock inflado no se ve nunca. Si el producto no se preparo, se ajusta
-- por el kiosko ("Llego mercancia"), que es donde viaja el movimiento.

create table if not exists ventas_canceladas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id),
  -- Se copian y no se leen por join a proposito: son el "estado al momento
  -- de cancelar". Si manana alguien edita la orden, la bitacora tiene que
  -- seguir diciendo que se cancelo un ticket de $263 del 14 de septiembre.
  folio int,
  fecha_venta timestamptz not null,
  total_cancelado numeric not null,
  estaba_pagada boolean not null,
  metodo_pago text,
  corte_id uuid,
  motivo text not null,
  cancelada_por uuid references empleados(id),
  cancelada_en timestamptz not null default now()
);

create index if not exists ix_ventas_canceladas_fecha on ventas_canceladas (cancelada_en desc);
create index if not exists ix_ventas_canceladas_orden on ventas_canceladas (orden_id);

alter table ventas_canceladas enable row level security;

-- Misma regla que el checador: una bitacora que se puede editar no es
-- evidencia de nada.
create or replace function public.fn_cancelaciones_solo_se_agregan()
returns trigger language plpgsql as $function$
begin
  raise exception 'La bitacora de cancelaciones no se edita ni se borra.';
end;
$function$;

drop trigger if exists trg_cancelaciones_solo_se_agregan on ventas_canceladas;
create trigger trg_cancelaciones_solo_se_agregan
  before update or delete on ventas_canceladas
  for each row execute function public.fn_cancelaciones_solo_se_agregan();

create or replace function public.fn_cancelar_venta(p_orden_id uuid, p_motivo text)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_o record; v_yo uuid; v_id uuid;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cancelar una venta.';
  end if;
  -- Sin motivo no hay cancelacion. Una bitacora de motivos vacios no
  -- contesta la unica pregunta que se le va a hacer dentro de tres meses.
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por que se cancela.';
  end if;

  select o.id, o.folio, o.created_at, o.total, o.pagado, o.estado,
         o.metodo_pago, o.corte_id
    into v_o
    from ordenes o where o.id = p_orden_id;

  if v_o.id is null then
    raise exception 'Esa venta no existe.';
  end if;
  if v_o.estado = 'cancelada' then
    raise exception 'Esa venta ya estaba cancelada.';
  end if;

  select e.id into v_yo from empleados e where e.auth_user_id = auth.uid() limit 1;

  insert into ventas_canceladas (
    orden_id, folio, fecha_venta, total_cancelado, estaba_pagada,
    metodo_pago, corte_id, motivo, cancelada_por
  ) values (
    v_o.id, v_o.folio, v_o.created_at, v_o.total, v_o.pagado,
    v_o.metodo_pago, v_o.corte_id, btrim(p_motivo), v_yo
  ) returning id into v_id;

  -- Solo `estado`. `estado_pago_orden` NO se toca: su maquina de estados
  -- no deja ir para atras a proposito, y mover una orden ya pagada por ahi
  -- es como se deja re-cobrable algo que ya se cobro.
  update ordenes set estado = 'cancelada' where id = p_orden_id;

  return v_id;
end;
$function$;

revoke execute on function public.fn_cancelar_venta(uuid, text) from public;
revoke execute on function public.fn_cancelar_venta(uuid, text) from anon;

-- La bitacora, para Admin.
create or replace function public.fn_cancelaciones(p_dias int default 90)
returns table(
  id uuid, orden_id uuid, folio int, fecha_venta timestamptz,
  total_cancelado numeric, estaba_pagada boolean, metodo_pago text,
  motivo text, quien text, cancelada_en timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  select v.id, v.orden_id, v.folio, v.fecha_venta, v.total_cancelado,
         v.estaba_pagada, v.metodo_pago, v.motivo,
         (select e.nombre from empleados e where e.id = v.cancelada_por),
         v.cancelada_en
    from ventas_canceladas v
   where fn_es_jefe()
     and v.cancelada_en >= now() - make_interval(days => greatest(coalesce(p_dias, 90), 1))
   order by v.cancelada_en desc;
$function$;

revoke execute on function public.fn_cancelaciones(int) from public;
revoke execute on function public.fn_cancelaciones(int) from anon;

-- Buscar una venta de cualquier dia para poder cancelarla: por folio o por
-- nombre. Sin esto, cancelar algo de hace dos semanas obliga a abrir el
-- corte de ese dia y bajar por toda la lista.
create or replace function public.fn_buscar_ventas(
  p_texto text default null,
  p_desde date default null,
  p_hasta date default null,
  p_limite int default 100
)
returns table(
  id uuid, folio int, created_at timestamptz, total numeric,
  pagado boolean, estado text, metodo_pago text, nombre_cliente text,
  cobro text, cancelada boolean
)
language sql stable security definer set search_path to 'public'
as $function$
  select o.id, o.folio, o.created_at, o.total, o.pagado, o.estado::text,
         o.metodo_pago, o.nombre_cliente,
         (select e.nombre from empleados e where e.id = o.empleado_id),
         o.estado = 'cancelada'
    from ordenes o
   where fn_es_jefe()
     and not o.es_demo
     and (p_desde is null or (o.created_at at time zone 'America/Merida')::date >= p_desde)
     and (p_hasta is null or (o.created_at at time zone 'America/Merida')::date <= p_hasta)
     and (
       p_texto is null or btrim(p_texto) = ''
       or o.folio::text = btrim(p_texto)
       or fn_sin_acentos(coalesce(o.nombre_cliente, '')) like '%' || fn_sin_acentos(btrim(p_texto)) || '%'
     )
   order by o.created_at desc
   limit least(greatest(coalesce(p_limite, 100), 1), 500);
$function$;

revoke execute on function public.fn_buscar_ventas(text, date, date, int) from public;
revoke execute on function public.fn_buscar_ventas(text, date, date, int) from anon;
