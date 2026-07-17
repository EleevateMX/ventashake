-- =====================================================================
-- Máquina de estados de orden/pago/venta — Parte 1: esquema.
-- Corrige el hallazgo C4 de docs/auditoria-produccion.md: el kiosko podía
-- convertir una orden en venta pagada sin ninguna confirmación externa
-- real (pasarela o cajero). Esta migración NO borra ni renombra nada
-- existente — `ordenes.pagado`, `ordenes.estado` (estado de PREPARACIÓN,
-- no de pago) y `pagos.estado` (estado_pago legado: pendiente/aprobado/
-- rechazado/cancelado) se mantienen intactos porque toda la cadena de
-- triggers ya probada (inventario, pedidos de cocina, mancuernas) sigue
-- disparándose exactamente igual que antes, sobre `ordenes.pagado`.
--
-- Lo que se agrega es un modelo MÁS RICO en paralelo:
--   - `ordenes.estado_pago_orden`: máquina de estados real de orden/pago
--     (draft/pending_payment/awaiting_counter_payment/payment_processing/
--     paid/cancelled/expired/payment_unknown/refunded_partial/refunded_full),
--     con transiciones válidas forzadas por trigger (parte 2).
--   - `pagos.estado_transaccion`: máquina de estados del intento de pago
--     (created/pending/processing/authorized/declined/cancelled/expired/
--     unknown/refunded_partial/refunded_full), independiente del enum
--     legado `estado_pago` (que sigue existiendo para no romper nada).
--   - `venta_confirmaciones`: PK en `orden_id` — garantiza a nivel de
--     base de datos que una orden JAMÁS puede confirmarse como venta dos
--     veces, sin importar cuántas veces se llame a la función.
--   - `configuracion_kiosko`: modo de pago por sucursal (clip/
--     pagar_en_caja/demo) — nunca "autoapprove".
-- =====================================================================

-- ------------------------- enums nuevos --------------------------------
do $$ begin
  create type estado_pago_orden as enum (
    'draft', 'pending_payment', 'awaiting_counter_payment', 'payment_processing',
    'paid', 'cancelled', 'expired', 'payment_unknown', 'refunded_partial', 'refunded_full'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_transaccion_pago as enum (
    'created', 'pending', 'processing', 'authorized', 'declined', 'cancelled',
    'expired', 'unknown', 'refunded_partial', 'refunded_full'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Solo estos 3 valores existen. "autoapprove"/"auto_approve" no es un
  -- valor del enum — no puede configurarse por accidente ni a propósito.
  create type modo_pago_kiosko as enum ('clip', 'pagar_en_caja', 'demo');
exception when duplicate_object then null; end $$;

-- ------------------------- columnas nuevas ------------------------------
alter table ordenes add column if not exists estado_pago_orden estado_pago_orden not null default 'draft';
alter table ordenes add column if not exists expira_en timestamptz;
alter table ordenes add column if not exists codigo_corto text;

alter table pagos add column if not exists estado_transaccion estado_transaccion_pago not null default 'created';
alter table pagos add column if not exists proveedor text not null default 'manual';
alter table pagos add column if not exists proveedor_payment_id text;
alter table pagos add column if not exists proveedor_error text;

create unique index if not exists uq_ordenes_codigo_corto on ordenes (codigo_corto) where codigo_corto is not null;
create index if not exists idx_ordenes_estado_pago_orden on ordenes (estado_pago_orden);
create index if not exists idx_ordenes_expira_en on ordenes (expira_en) where estado_pago_orden = 'awaiting_counter_payment';
create index if not exists idx_pagos_estado_transaccion on pagos (estado_transaccion);
create index if not exists idx_pagos_proveedor_payment_id on pagos (proveedor_payment_id) where proveedor_payment_id is not null;

-- ------------------------- confirmación única de venta -------------------
-- PK en orden_id: a nivel de base de datos, es IMPOSIBLE confirmar la
-- misma orden como venta dos veces, sin importar bugs futuros en la
-- lógica de la función — el segundo INSERT siempre choca.
create table if not exists venta_confirmaciones (
  orden_id uuid primary key references ordenes(id),
  pago_id uuid not null references pagos(id),
  confirmado_en timestamptz not null default now()
);

-- ------------------------- configuración del kiosko por sucursal ---------
create table if not exists configuracion_kiosko (
  sucursal_id uuid primary key references sucursales(id),
  modo_pago modo_pago_kiosko not null default 'pagar_en_caja',
  clip_configurado boolean not null default false,
  expira_minutos integer not null default 15 check (expira_minutos > 0),
  updated_at timestamptz not null default now()
);

-- Siembra config por defecto (segura: pagar_en_caja) para las sucursales
-- que ya existen, sin sobreescribir si ya hay una fila.
insert into configuracion_kiosko (sucursal_id)
select id from sucursales
on conflict (sucursal_id) do nothing;

drop trigger if exists trg_configuracion_kiosko_updated_at on configuracion_kiosko;
create trigger trg_configuracion_kiosko_updated_at
  before update on configuracion_kiosko
  for each row execute function fn_set_updated_at();

-- ------------------------- auditoría de expiración/reconciliación --------
create table if not exists ordenes_auditoria (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id),
  evento text not null, -- 'expirada' | 'reconciliada' | 'reabierta'
  detalle jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------- RLS --------------------------------------------
alter table venta_confirmaciones enable row level security;
alter table configuracion_kiosko enable row level security;
alter table ordenes_auditoria enable row level security;

do $$ begin
  -- Solo lectura directa para anon/authenticated (Admin necesita ver esto);
  -- toda escritura pasa por funciones SECURITY DEFINER.
  create policy sel_venta_confirmaciones on venta_confirmaciones for select using (true);
  create policy sel_configuracion_kiosko on configuracion_kiosko for select using (true);
  create policy sel_ordenes_auditoria on ordenes_auditoria for select using (true);
exception when duplicate_object then null; end $$;
