-- ============================================================
-- POS Kiosko — Migración inicial
-- ============================================================

-- Extensión para UUIDs
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────
-- Cocinas
-- ──────────────────────────────────────────
create table cocinas (
  id   uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique check (slug in ('alimentos', 'bebidas'))
);

insert into cocinas (nombre, slug) values
  ('Alimentos', 'alimentos'),
  ('Bebidas',   'bebidas');

-- ──────────────────────────────────────────
-- Categorías
-- ──────────────────────────────────────────
create table categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  cocina_id  uuid not null references cocinas(id) on delete cascade,
  activa     boolean not null default true
);

-- ──────────────────────────────────────────
-- Insumos
-- ──────────────────────────────────────────
create table insumos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  unidad         text not null,
  stock_actual   numeric(10,3) not null default 0,
  stock_minimo   numeric(10,3) not null default 0,
  costo_unitario numeric(10,2) not null default 0
);

-- ──────────────────────────────────────────
-- Productos
-- ──────────────────────────────────────────
create table productos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  descripcion  text,
  precio       numeric(10,2) not null check (precio >= 0),
  imagen_url   text,
  categoria_id uuid not null references categorias(id) on delete restrict,
  activo       boolean not null default true
);

-- ──────────────────────────────────────────
-- Recetas (producto ↔ insumos)
-- ──────────────────────────────────────────
create table recetas (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  insumo_id   uuid not null references insumos(id) on delete restrict,
  cantidad    numeric(10,3) not null check (cantidad > 0),
  unique (producto_id, insumo_id)
);

-- ──────────────────────────────────────────
-- Órdenes
-- ──────────────────────────────────────────
create type estado_orden as enum (
  'pendiente', 'en_preparacion', 'lista', 'entregada', 'cancelada'
);

create type metodo_pago as enum ('mercado_pago', 'efectivo');

create sequence ordenes_folio_seq start 1;

create table ordenes (
  id          uuid primary key default gen_random_uuid(),
  folio       integer not null default nextval('ordenes_folio_seq') unique,
  estado      estado_orden not null default 'pendiente',
  total       numeric(10,2) not null check (total >= 0),
  metodo_pago metodo_pago,
  pagado      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────
-- Ítems de orden
-- ──────────────────────────────────────────
create table orden_items (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null references ordenes(id) on delete cascade,
  producto_id     uuid not null references productos(id) on delete restrict,
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),
  personalizacion text,
  cocina_id       uuid not null references cocinas(id) on delete restrict
);

-- ──────────────────────────────────────────
-- Movimientos de inventario
-- ──────────────────────────────────────────
create type tipo_movimiento as enum ('venta', 'ajuste_manual', 'compra');

create table inventario_movimientos (
  id           uuid primary key default gen_random_uuid(),
  insumo_id    uuid not null references insumos(id) on delete restrict,
  cantidad     numeric(10,3) not null,
  tipo         tipo_movimiento not null,
  referencia_id uuid,
  created_at   timestamptz not null default now()
);

-- ──────────────────────────────────────────
-- Trigger: descuento automático de insumos al marcar orden como pagada
-- ─────────────────────────────────────────
create or replace function descontar_inventario_por_orden()
returns trigger language plpgsql security definer as $$
begin
  -- Solo actuar cuando se marca como pagada y antes no lo estaba
  if NEW.pagado = true and OLD.pagado = false then
    insert into inventario_movimientos (insumo_id, cantidad, tipo, referencia_id)
    select
      r.insumo_id,
      -(r.cantidad * oi.cantidad),
      'venta',
      NEW.id
    from orden_items oi
    join recetas r on r.producto_id = oi.producto_id
    where oi.orden_id = NEW.id;

    update insumos i
    set stock_actual = i.stock_actual + sub.delta
    from (
      select r.insumo_id, sum(-(r.cantidad * oi.cantidad)) as delta
      from orden_items oi
      join recetas r on r.producto_id = oi.producto_id
      where oi.orden_id = NEW.id
      group by r.insumo_id
    ) sub
    where i.id = sub.insumo_id;
  end if;
  return NEW;
end;
$$;

create trigger trg_descontar_inventario
after update on ordenes
for each row execute function descontar_inventario_por_orden();

-- Trigger: actualizar updated_at en ordenes
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger trg_ordenes_updated_at
before update on ordenes
for each row execute function set_updated_at();

-- ──────────────────────────────────────────
-- Ventas (contabilidad)
-- ──────────────────────────────────────────
create table ventas (
  id             uuid primary key default gen_random_uuid(),
  orden_id       uuid not null unique references ordenes(id) on delete restrict,
  total          numeric(10,2) not null,
  metodo_pago    metodo_pago not null,
  cfdi_solicitado boolean not null default false,
  facturapi_id   text,
  created_at     timestamptz not null default now()
);

-- Trigger: crear registro de venta automáticamente al pagar
create or replace function crear_venta_al_pagar()
returns trigger language plpgsql security definer as $$
begin
  if NEW.pagado = true and OLD.pagado = false and NEW.metodo_pago is not null then
    insert into ventas (orden_id, total, metodo_pago)
    values (NEW.id, NEW.total, NEW.metodo_pago);
  end if;
  return NEW;
end;
$$;

create trigger trg_crear_venta
after update on ordenes
for each row execute function crear_venta_al_pagar();

-- ──────────────────────────────────────────
-- Usuarios
-- ──────────────────────────────────────────
create type rol_usuario as enum ('admin', 'cocina', 'cajero');

create table usuarios (
  id     uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email  text not null unique,
  rol    rol_usuario not null default 'cajero'
);

-- ──────────────────────────────────────────
-- Row Level Security
-- ──────────────────────────────────────────
alter table cocinas enable row level security;
alter table categorias enable row level security;
alter table insumos enable row level security;
alter table productos enable row level security;
alter table recetas enable row level security;
alter table ordenes enable row level security;
alter table orden_items enable row level security;
alter table inventario_movimientos enable row level security;
alter table ventas enable row level security;
alter table usuarios enable row level security;

-- Políticas públicas de lectura para el kiosko (sin autenticación)
create policy "lectura publica productos" on productos for select using (activo = true);
create policy "lectura publica categorias" on categorias for select using (activa = true);
create policy "lectura publica cocinas" on cocinas for select using (true);

-- El kiosko puede insertar órdenes
create policy "insertar ordenes" on ordenes for insert with check (true);
create policy "insertar orden_items" on orden_items for insert with check (true);

-- Cocinas pueden ver y actualizar sus órdenes
create policy "cocina lee ordenes" on ordenes for select using (pagado = true);
create policy "cocina actualiza estado" on ordenes for update using (pagado = true);
create policy "cocina lee orden_items" on orden_items for select using (true);

-- Admin tiene acceso total (requires authenticated + rol admin)
create policy "admin todo ordenes" on ordenes using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
