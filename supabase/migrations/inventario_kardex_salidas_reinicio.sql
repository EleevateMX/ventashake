-- Inventario: quien, por que, salidas que no son venta, kardex y reinicio
-- (pedido de Perla, 30/09).
--
-- Base: cada movimiento puede decir QUIEN lo hizo (empleado_id), POR QUE
-- (motivo, para las salidas) y cuanto habia antes y despues (conteos y
-- reinicios). Columnas nuevas, todas null: el descuento por venta no las
-- escribe y no se toca.
--
-- Los tipos nuevos (salida, conteo, reinicio, produccion) se agregaron en
-- la migracion inventario_tipos_de_movimiento: un valor de enum no se puede
-- usar en la misma transaccion en que nace.

alter table inventario_movimientos
  add column if not exists empleado_id uuid references empleados(id) on delete set null,
  add column if not exists motivo text,
  add column if not exists existencia_antes numeric,
  add column if not exists existencia_despues numeric;

alter table inventario_movimientos drop constraint if exists inventario_movimientos_motivo_check;
alter table inventario_movimientos add constraint inventario_movimientos_motivo_check
  check (motivo is null or motivo in
    ('merma', 'caducado', 'danado', 'error_preparacion', 'consumo_interno', 'ajuste', 'otro', 'reinicio'));

create index if not exists inventario_movimientos_insumo_fecha
  on inventario_movimientos (insumo_id, created_at desc);

-- ── Salidas que no son venta ────────────────────────────────────────────
-- Merma, caducado, danado, error de preparacion, consumo interno, ajuste u
-- otro. Resta del almacen, guarda el costo del momento (para saber cuanto
-- dinero se fue) y quien lo registro. La fecha puede ser de dias pasados
-- (la merma de ayer se apunta hoy), nunca futura.
create or replace function public.fn_inventario_salida(
  p_almacen_id uuid, p_lineas jsonb, p_fecha date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_emp uuid := fn_empleado_actual();
  v_hoy date := (now() at time zone 'America/Merida')::date;
  v_cuando timestamptz;
  l record;
  v_antes numeric;
  v_n int := 0;
  v_valor numeric := 0;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal registra salidas de inventario.';
  end if;
  if not exists (select 1 from almacenes where id = p_almacen_id) then
    raise exception 'Ese almacen no existe.';
  end if;
  if p_fecha is not null and p_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.';
  end if;
  v_cuando := case when p_fecha is null or p_fecha = v_hoy then now()
                   else (p_fecha + time '12:00') at time zone 'America/Merida' end;

  for l in
    select (x->>'insumo_id')::uuid as insumo_id,
           (x->>'cantidad')::numeric as cantidad,
           nullif(trim(x->>'motivo'), '') as motivo,
           nullif(trim(x->>'nota'), '') as nota
      from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x
  loop
    if l.cantidad is null or l.cantidad <= 0 then
      raise exception 'La cantidad tiene que ser mayor que cero.';
    end if;
    if l.motivo is null or l.motivo not in
       ('merma', 'caducado', 'danado', 'error_preparacion', 'consumo_interno', 'ajuste', 'otro') then
      raise exception 'Falta el motivo de la salida.';
    end if;
    if l.motivo = 'otro' and l.nota is null then
      raise exception 'Con motivo «Otro» hay que escribir la nota.';
    end if;
    if not exists (select 1 from insumos where id = l.insumo_id) then
      raise exception 'Ese producto de inventario no existe.';
    end if;

    select stock_actual into v_antes from inventario_stock
     where almacen_id = p_almacen_id and insumo_id = l.insumo_id;
    v_antes := coalesce(v_antes, 0);

    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, costo_unitario, nota, created_at,
       empleado_id, motivo, existencia_antes, existencia_despues)
    select l.insumo_id, p_almacen_id, -l.cantidad, 'salida', i.costo_unitario, l.nota, v_cuando,
           v_emp, l.motivo, v_antes, v_antes - l.cantidad
      from insumos i where i.id = l.insumo_id;

    insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
    values (p_almacen_id, l.insumo_id, -l.cantidad, 0)
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;

    v_n := v_n + 1;
    v_valor := v_valor + l.cantidad * coalesce((select costo_unitario from insumos where id = l.insumo_id), 0);
  end loop;

  if v_n = 0 then
    raise exception 'No hay nada que registrar.';
  end if;
  return jsonb_build_object('lineas', v_n, 'valor', round(v_valor, 2));
end;
$function$;
revoke execute on function public.fn_inventario_salida(uuid, jsonb, date) from public, anon;
grant execute on function public.fn_inventario_salida(uuid, jsonb, date) to authenticated;

-- ── Reiniciar inventario ────────────────────────────────────────────────
-- Pone en 0 las existencias elegidas. NO borra nada: cada renglon que
-- cambia deja su movimiento 'reinicio' con lo que habia, quien lo autorizo
-- y por que. Solo gerencia, y ademas con el PIN de quien autoriza (el
-- permiso 'reiniciar_inventario' no lo tiene ningun rol de caja: solo
-- gerencia, que puede todo).
--
-- Filtros: almacenes (obligatorio), tipos de insumo (null = todos) e
-- insumos sueltos (null = todos).
create or replace function public.fn_inventario_reiniciar(
  p_almacenes uuid[], p_tipos text[], p_insumos uuid[], p_motivo text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_aut uuid; v_aut_nombre text;
  v_n int; v_piezas numeric;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede reiniciar el inventario.';
  end if;
  if coalesce(array_length(p_almacenes, 1), 0) = 0 then
    raise exception 'Elige al menos un almacen.';
  end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo del reinicio.';
  end if;
  select a.empleado_id, a.nombre into v_aut, v_aut_nombre
    from fn_autorizar_con_pin(p_pin, 'reiniciar_inventario') a;

  with objetivo as (
    select s.id, s.almacen_id, s.insumo_id, s.stock_actual
      from inventario_stock s
      join insumos i on i.id = s.insumo_id
     where s.almacen_id = any(p_almacenes)
       and s.stock_actual <> 0
       and (p_tipos is null or i.tipo::text = any(p_tipos))
       and (p_insumos is null or s.insumo_id = any(p_insumos))
  ),
  mov as (
    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, costo_unitario, nota,
       empleado_id, motivo, existencia_antes, existencia_despues)
    select o.insumo_id, o.almacen_id, -o.stock_actual, 'reinicio', i.costo_unitario,
           'Reinicio de inventario: ' || trim(p_motivo),
           v_aut, 'reinicio', o.stock_actual, 0
      from objetivo o join insumos i on i.id = o.insumo_id
    returning 1
  ),
  stk as (
    update inventario_stock s set stock_actual = 0
      from objetivo o where s.id = o.id
    returning 1
  )
  select (select count(*) from stk), coalesce((select sum(abs(stock_actual)) from objetivo), 0)
    into v_n, v_piezas;

  return jsonb_build_object('renglones', v_n, 'piezas', v_piezas, 'autorizo', v_aut_nombre);
end;
$function$;
revoke execute on function public.fn_inventario_reiniciar(uuid[], text[], uuid[], text, text) from public, anon;
grant execute on function public.fn_inventario_reiniciar(uuid[], text[], uuid[], text, text) to authenticated;

-- ── Kardex ──────────────────────────────────────────────────────────────
-- El historial de un insumo con tipos claros. Los movimientos viejos no
-- traen tipo fino (el ajuste de Costeos y el conteo eran los dos 'ajuste',
-- y la sincronizacion del kiosko se escribia como 'traspaso'), asi que la
-- CLASE se deduce aqui y no se reescribe la historia.
--
-- Saldo: la existencia de hoy menos lo que se movio despues de cada
-- renglon. Es exacto desde que el descuento dejo de callarse (el renglon
-- de stock que no existia, 2.3.5 de CLAUDE.md).
create or replace function public.fn_kardex(
  p_insumo_id uuid, p_almacen_id uuid default null,
  p_desde date default null, p_hasta date default null)
returns table(
  id uuid, fecha timestamptz, almacen text, clase text,
  entrada numeric, salida numeric, saldo numeric,
  responsable text, folio int, orden_id uuid,
  motivo text, nota text, costo_unitario numeric, valor numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with m as (
    select mv.*, a.nombre as almacen_nombre, s.stock_actual as hoy,
           sum(mv.cantidad) over (partition by mv.almacen_id
                                  order by mv.created_at desc, mv.id desc
                                  rows between unbounded preceding and current row) as acumulado_desde_aqui
      from inventario_movimientos mv
      join almacenes a on a.id = mv.almacen_id
      left join inventario_stock s on s.insumo_id = mv.insumo_id and s.almacen_id = mv.almacen_id
     where mv.insumo_id = p_insumo_id
       and (p_almacen_id is null or mv.almacen_id = p_almacen_id)
  )
  select m.id, m.created_at, m.almacen_nombre,
         case
           when m.tipo = 'salida' then coalesce(m.motivo, 'otro')
           when m.tipo in ('venta', 'compra', 'reinicio', 'produccion', 'conteo') then m.tipo::text
           when m.nota like 'Sync costosshake%' or m.nota like 'Fantasma de Costeos%' then 'costeos'
           when m.nota like 'Conteo fisico%' then 'conteo'
           when m.nota like 'Entrada directa%' then 'entrada'
           when m.tipo = 'traspaso' then 'traspaso'
           when m.tipo = 'merma' then 'merma'
           else 'ajuste'
         end,
         case when m.cantidad > 0 then m.cantidad end,
         case when m.cantidad < 0 then -m.cantidad end,
         coalesce(m.hoy, 0) - (m.acumulado_desde_aqui - m.cantidad),
         coalesce(e.nombre,
                  case when m.nota like 'Sync costosshake%' or m.nota like 'Fantasma de Costeos%' then 'Costeos'
                       when m.nota like 'Conteo fisico desde Costeos (%' then substring(m.nota from '\(([^)]+)\)')
                       when m.nota ~ ' - [^-]+$' then substring(m.nota from ' - ([^-]+)$')
                  end),
         o.folio, o.id,
         m.motivo, m.nota, m.costo_unitario,
         round(abs(m.cantidad) * coalesce(m.costo_unitario, 0), 2)
    from m
    left join empleados e on e.id = m.empleado_id
    left join ordenes o on m.tipo = 'venta' and o.id = m.referencia_id
   where fn_es_staff()
     and (p_desde is null or m.created_at >= (p_desde::timestamp at time zone 'America/Merida'))
     and (p_hasta is null or m.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Merida'))
   order by m.created_at desc, m.id desc;
$function$;
revoke execute on function public.fn_kardex(uuid, uuid, date, date) from public, anon;
grant execute on function public.fn_kardex(uuid, uuid, date, date) to authenticated;
