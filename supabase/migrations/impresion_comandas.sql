-- =====================================================================
-- Impresión automática de comandas — cola persistente + agente local.
-- Prioridad principal de la auditoría de producción (docs/auditoria-produccion.md).
--
-- Arquitectura: cuando una orden se paga, ya se crea un `pedido_cocina`
-- por estación (trigger existente `fn_crear_pedidos_cocina`). Esta
-- migración agrega un trigger que, por cada `pedido_cocina` insertado,
-- ENCOLA un trabajo de impresión (`trabajos_impresion`) — la comanda no
-- se manda a imprimir directo por Realtime: queda en una cola persistente
-- que un agente local (fuera de este repo, ver
-- docs/instalacion-agente-impresion.md) reclama de forma atómica, imprime
-- y confirma. Si el agente está apagado, sin papel, o pierde red, el
-- trabajo se queda `pending`/`retry` en la cola — el pedido NUNCA se
-- pierde, y una falla de impresión no toca la venta, el inventario ni el
-- pedido en KDS.
--
-- Seguridad del agente: no usa la anon key general ni el service_role.
-- Cada impresora tiene un `agente_token` propio (uuid), generado al
-- registrar la impresora en Admin. El agente local solo puede reclamar/
-- confirmar/fallar trabajos de LA impresora dueña de su token — no puede
-- ver ni tocar trabajos de otra sucursal/estación. Ver docs/configuracion-impresoras.md.
--
-- Aditivo: solo crea tablas/funciones/triggers nuevos. No modifica ni
-- borra ninguna tabla existente.
-- =====================================================================

-- ------------------------- enums ----------------------------------------
do $$ begin
  create type tipo_conexion_impresora as enum ('usb', 'red');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ancho_papel as enum ('58mm', '80mm');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_trabajo_impresion as enum
    ('pending', 'claimed', 'printing', 'printed', 'retry', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_documento_impresion as enum ('comanda', 'ticket');
exception when duplicate_object then null; end $$;

-- ------------------------- impresoras ------------------------------------
create table if not exists impresoras (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  nombre text not null,
  -- a qué estación pertenece esta impresora (null = de uso general, p.ej. caja)
  cocina_id uuid references cocinas(id),
  tipo_conexion tipo_conexion_impresora not null default 'red',
  -- red: ip + puerto. usb: nombre de dispositivo del SO en `nombre_dispositivo`.
  ip text,
  puerto integer default 9100,
  nombre_dispositivo text,
  ancho_papel ancho_papel not null default '80mm',
  copias integer not null default 1 check (copias between 1 and 5),
  corte_automatico boolean not null default true,
  buzzer boolean not null default false,
  activa boolean not null default true,
  -- credencial del agente local: token propio, no la anon key ni service_role.
  agente_token uuid not null default gen_random_uuid(),
  agente_id text,
  ultima_conexion timestamptz,
  ultima_impresion timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_impresoras_agente_token on impresoras (agente_token);
create index if not exists idx_impresoras_cocina on impresoras (cocina_id) where activa;

-- ------------------------- trabajos_impresion -----------------------------
create table if not exists trabajos_impresion (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid references ordenes(id),
  pedido_id uuid references pedidos_cocina(id),
  estacion_id uuid references cocinas(id),
  printer_id uuid references impresoras(id),
  tipo_documento tipo_documento_impresion not null default 'comanda',
  -- contenido ya armado (folio, items, personalización, etc.) — el agente
  -- solo formatea e imprime, no vuelve a consultar la base por los datos.
  payload jsonb not null,
  estado estado_trabajo_impresion not null default 'pending',
  intentos integer not null default 0,
  max_intentos integer not null default 5,
  idempotency_key uuid,
  error_ultimo text,
  copia_de uuid references trabajos_impresion(id),
  numero_copia integer not null default 1,
  created_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),
  processing_at timestamptz,
  printed_at timestamptz,
  failed_at timestamptz,
  next_retry_at timestamptz,
  claimed_by text,
  claim_expires_at timestamptz
);

create unique index if not exists uq_trabajos_impresion_idempotency
  on trabajos_impresion (idempotency_key) where idempotency_key is not null;
create index if not exists idx_trabajos_impresion_cola
  on trabajos_impresion (printer_id, estado, next_retry_at);
create index if not exists idx_trabajos_impresion_pedido on trabajos_impresion (pedido_id);
create index if not exists idx_trabajos_impresion_estado on trabajos_impresion (estado);

-- ------------------------- auditoría de reimpresión ------------------------
create table if not exists impresion_auditoria (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references trabajos_impresion(id),
  trabajo_original_id uuid references trabajos_impresion(id),
  empleado_id uuid references empleados(id),
  motivo text,
  created_at timestamptz not null default now()
);

-- ------------------------- encolado automático -----------------------------
-- IMPORTANTE — orden de inserción real: fn_crear_pedidos_cocina() primero
-- inserta TODOS los `pedidos_cocina` de la orden y DESPUÉS, en una
-- instrucción aparte, inserta sus `cocina_items`. Un trigger AFTER INSERT
-- sobre `pedidos_cocina` (fila por fila) se dispara ANTES de que existan
-- los items — el payload de la comanda saldría siempre vacío. Por eso el
-- encolado se dispara desde `cocina_items` (statement-level, con tabla de
-- transición), una vez que TODOS los items de ese INSERT ya existen.
create or replace function public.fn_encolar_comanda_para_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payload jsonb;
  v_printer_id uuid;
  v_pedido pedidos_cocina;
begin
  select * into v_pedido from pedidos_cocina where id = p_pedido_id;
  if not found then
    return;
  end if;

  select p.id into v_printer_id from impresoras p where p.cocina_id = v_pedido.cocina_id and p.activa limit 1;

  select jsonb_build_object(
    'folio', o.folio,
    'canal', o.canal,
    'estacion', c.nombre,
    'creado_en', v_pedido.created_at,
    'cajero', e.nombre,
    'cliente', cl.nombre,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cantidad', ci.cantidad,
        'nombre', pr.nombre,
        'personalizacion', ci.personalizacion
      ) order by pr.nombre)
      from cocina_items ci left join productos pr on pr.id = ci.producto_id
      where ci.pedido_id = v_pedido.id
    ), '[]'::jsonb)
  )
  into v_payload
  from ordenes o
  left join cocinas c on c.id = v_pedido.cocina_id
  left join empleados e on e.id = o.empleado_id
  left join clientes cl on cl.id = o.cliente_id
  where o.id = v_pedido.orden_id;

  -- idempotency_key determinístico (= pedidos_cocina.id, único por
  -- orden+estación): si el trigger llegara a correr dos veces para el
  -- mismo pedido, el segundo insert choca con el índice único y no
  -- duplica el trabajo de impresión.
  insert into trabajos_impresion (orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload, idempotency_key)
  values (v_pedido.orden_id, v_pedido.id, v_pedido.cocina_id, v_printer_id, 'comanda', v_payload, v_pedido.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
end;
$function$;

create or replace function public.fn_encolar_comandas_desde_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_pedido_id uuid;
begin
  for v_pedido_id in select distinct pedido_id from nuevos_items loop
    perform fn_encolar_comanda_para_pedido(v_pedido_id);
  end loop;
  return null;
end;
$function$;

drop trigger if exists trg_encolar_comanda on pedidos_cocina;
drop trigger if exists trg_encolar_comandas_desde_items on cocina_items;
create trigger trg_encolar_comandas_desde_items
  after insert on cocina_items
  referencing new table as nuevos_items
  for each statement
  execute function fn_encolar_comandas_desde_items();

-- ------------------------- RPCs del agente local ----------------------------
-- Todas resuelven la impresora por `p_token` (agente_token), nunca por un
-- printer_id que el llamante pudiera falsear — así un token de una
-- sucursal jamás puede ver/reclamar trabajos de otra impresora.

create or replace function public.fn_imprimir_reclamar_trabajos(
  p_token uuid, p_agente text, p_limite integer default 5
) returns setof trabajos_impresion
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_printer_id uuid;
begin
  select id into v_printer_id from impresoras where agente_token = p_token and activa;
  if not found then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;

  update impresoras set ultima_conexion = now() where id = v_printer_id;

  return query
  update trabajos_impresion t
  set estado = 'claimed', claimed_by = p_agente, claim_expires_at = now() + interval '2 minutes'
  from (
    select id from trabajos_impresion
    where printer_id = v_printer_id
      and (
        estado in ('pending', 'retry')
        or (estado in ('claimed', 'printing') and claim_expires_at < now())
      )
      and (next_retry_at is null or next_retry_at <= now())
    order by created_at
    limit p_limite
    for update skip locked
  ) elegibles
  where t.id = elegibles.id
  returning t.*;
end;
$function$;

create or replace function public.fn_imprimir_confirmar(p_token uuid, p_trabajo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_printer_id uuid;
begin
  select id into v_printer_id from impresoras where agente_token = p_token and activa;
  if not found then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;

  update trabajos_impresion
  set estado = 'printed', printed_at = now()
  where id = p_trabajo_id and printer_id = v_printer_id;

  update impresoras set ultima_impresion = now() where id = v_printer_id;
end;
$function$;

create or replace function public.fn_imprimir_fallar(p_token uuid, p_trabajo_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_printer_id uuid;
  v_trabajo trabajos_impresion;
  v_backoff interval;
begin
  select id into v_printer_id from impresoras where agente_token = p_token and activa;
  if not found then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;

  select * into v_trabajo from trabajos_impresion where id = p_trabajo_id and printer_id = v_printer_id;
  if not found then
    return;
  end if;

  if v_trabajo.intentos + 1 >= v_trabajo.max_intentos then
    update trabajos_impresion
    set estado = 'failed', intentos = intentos + 1, error_ultimo = p_error, failed_at = now()
    where id = p_trabajo_id;
  else
    -- backoff exponencial: 30s, 1min, 2min, 4min...
    v_backoff := (30 * power(2, v_trabajo.intentos))::text || ' seconds';
    update trabajos_impresion
    set estado = 'retry', intentos = intentos + 1, error_ultimo = p_error,
        next_retry_at = now() + v_backoff
    where id = p_trabajo_id;
  end if;
end;
$function$;

create or replace function public.fn_imprimir_latido(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  update impresoras set ultima_conexion = now() where agente_token = p_token and activa;
end;
$function$;

create or replace function public.fn_imprimir_prueba(p_token uuid)
returns trabajos_impresion
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_impresora impresoras;
  v_trabajo trabajos_impresion;
begin
  select * into v_impresora from impresoras where agente_token = p_token and activa;
  if not found then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;

  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_impresora.id, 'comanda', jsonb_build_object(
    'prueba', true, 'impresora', v_impresora.nombre, 'hora', now()
  ), gen_random_uuid())
  returning * into v_trabajo;

  return v_trabajo;
end;
$function$;

-- ------------------------- reimpresión (staff, vía Admin/KDS) ---------------
-- Usa la anon key normal (staff ya autenticado por PIN dentro del local,
-- mismo modelo de confianza que el resto de la app operativa). Crea un
-- trabajo NUEVO (no reencola el mismo, para no reclamar dos veces la fila
-- original) y dispara el guardado de la auditoría.
create or replace function public.fn_imprimir_reimprimir(
  p_trabajo_id uuid, p_empleado_id uuid, p_motivo text default null, p_printer_id uuid default null
) returns trabajos_impresion
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_original trabajos_impresion;
  v_nuevo trabajos_impresion;
begin
  select * into v_original from trabajos_impresion where id = p_trabajo_id;
  if not found then
    raise exception 'Trabajo de impresión % no existe', p_trabajo_id;
  end if;

  insert into trabajos_impresion (
    orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload,
    copia_de, numero_copia, idempotency_key
  ) values (
    v_original.orden_id, v_original.pedido_id, v_original.estacion_id,
    coalesce(p_printer_id, v_original.printer_id), v_original.tipo_documento, v_original.payload,
    v_original.id,
    (select coalesce(max(numero_copia), v_original.numero_copia) + 1
       from trabajos_impresion where copia_de = v_original.id or id = v_original.id),
    gen_random_uuid()
  ) returning * into v_nuevo;

  insert into impresion_auditoria (trabajo_id, trabajo_original_id, empleado_id, motivo)
  values (v_nuevo.id, v_original.id, p_empleado_id, p_motivo);

  return v_nuevo;
end;
$function$;

-- ------------------------- liberador de trabajos abandonados (cron) --------
-- Respaldo por si ningún agente vuelve a pedir trabajos para una impresora
-- (el propio fn_imprimir_reclamar_trabajos ya libera claims vencidos al
-- reclamar, pero esto cubre el caso de una impresora sin agente activo
-- por horas: el trabajo no debe quedarse "claimed" para siempre a la
-- vista de Admin).
create or replace function public.fn_imprimir_liberar_vencidos()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_n integer;
begin
  update trabajos_impresion
  set estado = 'retry', next_retry_at = now()
  where estado in ('claimed', 'printing') and claim_expires_at < now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

do $$ begin
  perform cron.schedule('imprimir-liberar-vencidos', '* * * * *',
    $cron$select public.fn_imprimir_liberar_vencidos();$cron$);
exception when others then null; end $$;

-- ------------------------- RLS ---------------------------------------------
alter table impresoras enable row level security;
alter table trabajos_impresion enable row level security;
alter table impresion_auditoria enable row level security;

do $$ begin
  -- Admin necesita ver/configurar impresoras (misma postura que el resto
  -- del catálogo: anon key + PIN de admin dentro de la app).
  create policy sel_impresoras on impresoras for select using (true);
  create policy ins_impresoras on impresoras for insert with check (true);
  create policy upd_impresoras on impresoras for update using (true);
  -- Cocina/Barra/Admin necesitan ver el estado de la cola para mostrar
  -- "impreso/reintentando/fallido" y permitir reimpresión.
  create policy sel_trabajos_impresion on trabajos_impresion for select using (true);
  create policy sel_impresion_auditoria on impresion_auditoria for select using (true);
exception when duplicate_object then null; end $$;

-- Nadie escribe trabajos_impresion directo (ni INSERT ni UPDATE): todo
-- pasa por fn_encolar_comanda (trigger) o las RPCs del agente/reimpresión,
-- todas SECURITY DEFINER. Mismo patrón que se aplicó a `pagos` para C1.

grant execute on function public.fn_imprimir_reclamar_trabajos(uuid, text, integer) to anon, authenticated;
grant execute on function public.fn_imprimir_confirmar(uuid, uuid) to anon, authenticated;
grant execute on function public.fn_imprimir_fallar(uuid, uuid, text) to anon, authenticated;
grant execute on function public.fn_imprimir_latido(uuid) to anon, authenticated;
grant execute on function public.fn_imprimir_prueba(uuid) to anon, authenticated;
grant execute on function public.fn_imprimir_reimprimir(uuid, uuid, text, uuid) to anon, authenticated;

-- ------------------------- realtime -----------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trabajos_impresion'
  ) then
    execute 'alter publication supabase_realtime add table public.trabajos_impresion';
  end if;
end $$;
