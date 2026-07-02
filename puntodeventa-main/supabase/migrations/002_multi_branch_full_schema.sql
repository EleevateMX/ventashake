-- ============================================================
-- Migration 002: Multi-Branch Full Schema
-- ============================================================

-- ──┃ New Enums ────────────────────────────────────────────────────────────────

do $$ begin
  create type canal_orden as enum ('kiosko', 'pos', 'delivery');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_almacen as enum ('central', 'sucursal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_transferencia as enum ('pendiente', 'enviada', 'recibida', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rol_empleado as enum ('cajero', 'cocina', 'bebidas', 'supervisor', 'gerente', 'administrador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type nivel_cliente as enum ('bronce', 'plata', 'oro', 'platino');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_movimiento_puntos as enum ('ganados', 'canjeados', 'expirados', 'ajuste');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_movimiento_wallet as enum ('recarga', 'pago', 'regalo', 'devolucion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type slug_plataforma as enum ('uber_eats', 'didi_food', 'rappi');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_promocion as enum ('descuento_porcentaje', 'descuento_monto', 'combo', 'segunda_unidad', 'regalo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_merma as enum ('vencimiento', 'accidente', 'calidad', 'otro');
exception when duplicate_object then null; end $$;

-- ──┃ Extend existing metodo_pago enum ────────────────────────────────────────

alter type metodo_pago add value if not exists 'tarjeta_credito';
alter type metodo_pago add value if not exists 'tarjeta_debito';
alter type metodo_pago add value if not exists 'qr';
alter type metodo_pago add value if not exists 'wallet';
alter type metodo_pago add value if not exists 'puntos';

-- ──┃ sucursales ───────────────────────────────────────────────────────────────

create table if not exists sucursales (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  direccion   text,
  telefono    text,
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into sucursales (id, nombre) values ('00000000-0000-0000-0000-000000000001', 'Sucursal Principal')
on conflict (id) do nothing;

-- ──┃ almacenes ────────────────────────────────────────────────────────────────

create table if not exists almacenes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        tipo_almacen not null default 'sucursal',
  sucursal_id uuid references sucursales(id) on delete cascade,
  activo      boolean not null default true
);

insert into almacenes (id, nombre, tipo, sucursal_id) values
  ('00000000-0000-0000-0000-000000000010', 'Almacén Central', 'central', null),
  ('00000000-0000-0000-0000-000000000011', 'Almacén Sucursal Principal', 'sucursal', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ──┃ inventario_stock ─────────────────────────────────────────────────────────

create table if not exists inventario_stock (
  id           uuid primary key default gen_random_uuid(),
  almacen_id   uuid not null references almacenes(id) on delete cascade,
  insumo_id    uuid not null references insumos(id) on delete cascade,
  stock_actual numeric(10,3) not null default 0,
  stock_minimo numeric(10,3) not null default 0,
  unique (almacen_id, insumo_id)
);

-- ──┃ lotes ───────────────────────────────────────────────────────────────────

create table if not exists lotes (
  id                uuid primary key default gen_random_uuid(),
  insumo_id         uuid not null references insumos(id) on delete restrict,
  almacen_id        uuid not null references almacenes(id) on delete restrict,
  numero_lote       text,
  cantidad_inicial  numeric(10,3) not null check (cantidad_inicial > 0),
  cantidad_actual   numeric(10,3) not null,
  costo_unitario    numeric(10,2),
  fecha_vencimiento date,
  created_at        timestamptz not null default now()
);

-- ──┃ mermas ───────────────────────────────────────────────────────────────────

create table if not exists mermas (
  id          uuid primary key default gen_random_uuid(),
  insumo_id   uuid not null references insumos(id) on delete restrict,
  almacen_id  uuid not null references almacenes(id) on delete restrict,
  lote_id     uuid references lotes(id),
  cantidad    numeric(10,3) not null check (cantidad > 0),
  tipo        tipo_merma not null,
  notas       text,
  registrado_por uuid references usuarios(id),
  created_at  timestamptz not null default now()
);

-- ──┃ transferencias ───────────────────────────────────────────────────────────

create table if not exists transferencias (
  id              uuid primary key default gen_random_uuid(),
  origen_id       uuid not null references almacenes(id) on delete restrict,
  destino_id      uuid not null references almacenes(id) on delete restrict,
  estado          estado_transferencia not null default 'pendiente',
  notas           text,
  creado_por      uuid references usuarios(id),
  confirmado_por  uuid references usuarios(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (origen_id <> destino_id)
);

create table if not exists transferencia_items (
  id               uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references transferencias(id) on delete cascade,
  insumo_id        uuid not null references insumos(id) on delete restrict,
  cantidad         numeric(10,3) not null check (cantidad > 0)
);

-- ──┃ clientes (loyalty / wallet) ──────────────────────────────────────────────

create table if not exists clientes (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  email        text unique,
  telefono     text unique,
  nivel        nivel_cliente not null default 'bronce',
  puntos       integer not null default 0 check (puntos >= 0),
  wallet_saldo numeric(10,2) not null default 0 check (wallet_saldo >= 0),
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists puntos_movimientos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  puntos      integer not null,
  tipo        tipo_movimiento_puntos not null,
  orden_id    uuid references ordenes(id),
  descripcion text,
  created_at  timestamptz not null default now()
);

create table if not exists wallet_movimientos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  monto       numeric(10,2) not null,
  tipo        tipo_movimiento_wallet not null,
  orden_id    uuid references ordenes(id),
  descripcion text,
  created_at  timestamptz not null default now()
);

create table if not exists gift_cards (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  saldo       numeric(10,2) not null check (saldo >= 0),
  saldo_inicial numeric(10,2) not null,
  activa      boolean not null default true,
  cliente_id  uuid references clientes(id),
  vence_en    date,
  created_at  timestamptz not null default now()
);

-- ──┃ empleados (RRHH) ─────────────────────────────────────────────────────────

create table if not exists empleados (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid unique references usuarios(id) on delete set null,
  nombre      text not null,
  email       text unique,
  telefono    text,
  sucursal_id uuid references sucursales(id),
  rol         rol_empleado not null default 'cajero',
  pin         text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists turnos (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete restrict,
  sucursal_id uuid not null references sucursales(id) on delete restrict,
  inicio      timestamptz not null default now(),
  fin         timestamptz,
  notas       text
);

create table if not exists asistencias (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete restrict,
  sucursal_id uuid not null references sucursales(id) on delete restrict,
  tipo        text not null check (tipo in ('entrada', 'salida')),
  created_at  timestamptz not null default now()
);

create table if not exists cortes_caja (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  empleado_id     uuid not null references empleados(id),
  turno_id        uuid references turnos(id),
  total_efectivo  numeric(10,2) not null default 0,
  total_tarjeta   numeric(10,2) not null default 0,
  total_qr        numeric(10,2) not null default 0,
  total_wallet    numeric(10,2) not null default 0,
  total_general   numeric(10,2) not null default 0,
  notas           text,
  created_at      timestamptz not null default now()
);

-- ──┃ delivery ─────────────────────────────────────────────────────────────────

create table if not exists plataformas_delivery (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug   slug_plataforma not null unique,
  activa boolean not null default true
);

insert into plataformas_delivery (nombre, slug) values
  ('Uber Eats', 'uber_eats'),
  ('Didi Food', 'didi_food'),
  ('Rappi',     'rappi')
on conflict (slug) do nothing;

create table if not exists ordenes_delivery (
  id                uuid primary key default gen_random_uuid(),
  orden_id          uuid unique references ordenes(id),
  plataforma_id     uuid not null references plataformas_delivery(id),
  sucursal_id       uuid not null references sucursales(id),
  id_externo        text not null,
  estado_plataforma text,
  datos_raw         jsonb,
  created_at        timestamptz not null default now(),
  unique (plataforma_id, id_externo)
);

-- ──┃ promociones ──────────────────────────────────────────────────────────────

create table if not exists promociones (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  descripcion  text,
  tipo         tipo_promocion not null,
  valor        numeric(10,2),
  codigo       text unique,
  activa       boolean not null default true,
  aplica_a     text check (aplica_a in ('todo', 'categoria', 'producto')),
  referencia_id uuid,
  fecha_inicio date,
  fecha_fin    date,
  sucursal_id  uuid references sucursales(id),
  condiciones  jsonb,
  created_at   timestamptz not null default now()
);

-- ──┃ orden_pagos (split payments) ────────────────────────────────────────────

create table if not exists orden_pagos (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references ordenes(id) on delete cascade,
  metodo      metodo_pago not null,
  monto       numeric(10,2) not null check (monto > 0),
  referencia  text,
  created_at  timestamptz not null default now()
);

-- ──┃ productos_sucursal (per-branch product overrides) ───────────────────────

create table if not exists productos_sucursal (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references productos(id) on delete cascade,
  sucursal_id     uuid not null references sucursales(id) on delete cascade,
  activo          boolean not null default true,
  precio_override numeric(10,2),
  unique (producto_id, sucursal_id)
);

-- ──┃ bitacora (audit log) ─────────────────────────────────────────────────────

create table if not exists bitacora (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references usuarios(id) on delete set null,
  accion      text not null,
  tabla       text,
  registro_id text,
  datos_antes jsonb,
  datos_nuevo jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);

-- ──┃ ALTER existing tables ───────────────────────────────────────────────────

-- Add sucursal_id, cliente_id, empleado_id, canal, propina, descuento, notas to ordenes
alter table ordenes add column if not exists sucursal_id uuid references sucursales(id);
alter table ordenes add column if not exists cliente_id uuid references clientes(id);
alter table ordenes add column if not exists empleado_id uuid references empleados(id);
alter table ordenes add column if not exists canal canal_orden default 'pos';
alter table ordenes add column if not exists propina numeric(10,2) not null default 0;
alter table ordenes add column if not exists descuento numeric(10,2) not null default 0;
alter table ordenes add column if not exists notas text;

-- Default sucursal for existing orders
update ordenes set sucursal_id = '00000000-0000-0000-0000-000000000001' where sucursal_id is null;

-- Add almacen_id to inventario_movimientos
alter table inventario_movimientos add column if not exists almacen_id uuid references almacenes(id);
update inventario_movimientos set almacen_id = '00000000-0000-0000-0000-000000000011' where almacen_id is null;

-- ──┃ Migrate stock from insumos to inventario_stock ──────────────────────────

insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
select '00000000-0000-0000-0000-000000000011', id, stock_actual, stock_minimo
from insumos
on conflict (almacen_id, insumo_id) do nothing;

-- ──┃ RLS for new tables ───────────────────────────────────────────────────────

alter table sucursales enable row level security;
alter table almacenes enable row level security;
alter table inventario_stock enable row level security;
alter table lotes enable row level security;
alter table mermas enable row level security;
alter table transferencias enable row level security;
alter table transferencia_items enable row level security;
alter table clientes enable row level security;
alter table puntos_movimientos enable row level security;
alter table wallet_movimientos enable row level security;
alter table gift_cards enable row level security;
alter table empleados enable row level security;
alter table turnos enable row level security;
alter table asistencias enable row level security;
alter table cortes_caja enable row level security;
alter table plataformas_delivery enable row level security;
alter table ordenes_delivery enable row level security;
alter table promociones enable row level security;
alter table orden_pagos enable row level security;
alter table productos_sucursal enable row level security;
alter table bitacora enable row level security;

-- Public read policies
create policy "lectura publica sucursales" on sucursales for select using (activa = true);
create policy "lectura publica plataformas" on plataformas_delivery for select using (true);
create policy "lectura publica promociones" on promociones for select using (activa = true);
create policy "lectura publica productos_sucursal" on productos_sucursal for select using (true);

-- Kiosko policies
create policy "kiosko inserta orden_pagos" on orden_pagos for insert with check (true);
create policy "lectura orden_pagos" on orden_pagos for select using (true);

-- Admin full access (simplified - tighten per module later)
create policy "admin sucursales" on sucursales using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
create policy "admin almacenes" on almacenes using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
create policy "admin inventario_stock" on inventario_stock using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
create policy "admin empleados" on empleados using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
create policy "admin clientes" on clientes using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
