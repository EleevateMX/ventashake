-- ============================================================
-- SHAKE AHOLIC · POS Suite — Setup completo de base de datos
-- ============================================================
-- Instrucciones:
--   1. Abre el SQL Editor en https://supabase.com/dashboard
--      → Tu proyecto → SQL Editor → "+ New query"
--   2. Pega TODO este archivo y presiona "Run"
--   3. Debería completarse en ~5 segundos sin errores
-- ============================================================

-- ─── 1. EXTENSIONES ──────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── 2. ENUMS ────────────────────────────────────────────────────────────────

do $$ begin create type estado_orden as enum
  ('pendiente','en_preparacion','lista','entregada','cancelada');
exception when duplicate_object then null; end $$;

do $$ begin create type metodo_pago as enum
  ('efectivo','tarjeta_credito','tarjeta_debito','qr','wallet','puntos','mercado_pago');
exception when duplicate_object then null; end $$;

do $$ begin create type canal_orden as enum ('kiosko','pos','delivery');
exception when duplicate_object then null; end $$;

do $$ begin create type rol_usuario as enum ('admin','cocina','cajero');
exception when duplicate_object then null; end $$;

do $$ begin create type rol_empleado as enum
  ('cajero','cocina','bebidas','supervisor','gerente','administrador');
exception when duplicate_object then null; end $$;

do $$ begin create type tipo_movimiento as enum ('venta','ajuste_manual','compra');
exception when duplicate_object then null; end $$;

do $$ begin create type tipo_almacen as enum ('central','sucursal');
exception when duplicate_object then null; end $$;

do $$ begin create type estado_transferencia as enum
  ('pendiente','enviada','recibida','cancelada');
exception when duplicate_object then null; end $$;

do $$ begin create type nivel_cliente as enum ('bronce','plata','oro','platino');
exception when duplicate_object then null; end $$;

do $$ begin create type tipo_movimiento_puntos as enum
  ('ganados','canjeados','expirados','ajuste');
exception when duplicate_object then null; end $$;

do $$ begin create type tipo_movimiento_wallet as enum
  ('recarga','pago','regalo','devolucion');
exception when duplicate_object then null; end $$;

do $$ begin create type slug_plataforma as enum ('uber_eats','didi_food','rappi');
exception when duplicate_object then null; end $$;

do $$ begin create type tipo_promocion as enum
  ('descuento_porcentaje','descuento_monto','combo','segunda_unidad','regalo');
exception when duplicate_object then null; end $$;

do $$ begin create type tipo_merma as enum
  ('vencimiento','accidente','calidad','otro');
exception when duplicate_object then null; end $$;

-- ─── 3. TABLAS (en orden de dependencias) ────────────────────────────────────

-- Cocinas
create table if not exists cocinas (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug   text not null unique check (slug in ('alimentos','bebidas'))
);

-- Sucursales
create table if not exists sucursales (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  direccion  text,
  telefono   text,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Usuarios internos (sin FK a auth.users — Phase 1, sin Supabase Auth)
create table if not exists usuarios (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  email  text not null unique,
  rol    rol_usuario not null default 'cajero'
);

-- Clientes (lealtad / wallet)
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

-- Empleados
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

-- Folio sequence para órdenes
create sequence if not exists ordenes_folio_seq start 1000;

-- Órdenes
create table if not exists ordenes (
  id          uuid primary key default gen_random_uuid(),
  folio       integer not null default nextval('ordenes_folio_seq') unique,
  estado      estado_orden not null default 'pendiente',
  total       numeric(10,2) not null default 0 check (total >= 0),
  metodo_pago metodo_pago,
  pagado      boolean not null default false,
  sucursal_id uuid references sucursales(id),
  cliente_id  uuid references clientes(id),
  empleado_id uuid references empleados(id),
  canal       canal_orden not null default 'pos',
  propina     numeric(10,2) not null default 0,
  descuento   numeric(10,2) not null default 0,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Categorías
create table if not exists categorias (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  cocina_id uuid not null references cocinas(id) on delete cascade,
  activa    boolean not null default true
);

-- Insumos
create table if not exists insumos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  unidad         text not null,
  stock_actual   numeric(10,3) not null default 0,
  stock_minimo   numeric(10,3) not null default 0,
  costo_unitario numeric(10,2) not null default 0
);

-- Productos
create table if not exists productos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  descripcion  text,
  precio       numeric(10,2) not null check (precio >= 0),
  imagen_url   text,
  categoria_id uuid not null references categorias(id) on delete restrict,
  activo       boolean not null default true
);

-- Recetas (producto ↔ insumos)
create table if not exists recetas (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  insumo_id   uuid not null references insumos(id) on delete restrict,
  cantidad    numeric(10,3) not null check (cantidad > 0),
  unique (producto_id, insumo_id)
);

-- Almacenes
create table if not exists almacenes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        tipo_almacen not null default 'sucursal',
  sucursal_id uuid references sucursales(id) on delete cascade,
  activo      boolean not null default true
);

-- Productos por sucursal (overrides)
create table if not exists productos_sucursal (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references productos(id) on delete cascade,
  sucursal_id     uuid not null references sucursales(id) on delete cascade,
  activo          boolean not null default true,
  precio_override numeric(10,2),
  unique (producto_id, sucursal_id)
);

-- Ítems de orden
create table if not exists orden_items (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null references ordenes(id) on delete cascade,
  producto_id     uuid not null references productos(id) on delete restrict,
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),
  personalizacion text,
  cocina_id       uuid not null references cocinas(id) on delete restrict
);

-- Pagos por orden (pago mixto)
create table if not exists orden_pagos (
  id         uuid primary key default gen_random_uuid(),
  orden_id   uuid not null references ordenes(id) on delete cascade,
  metodo     metodo_pago not null,
  monto      numeric(10,2) not null check (monto > 0),
  referencia text,
  created_at timestamptz not null default now()
);

-- Ventas (contabilidad)
create table if not exists ventas (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null unique references ordenes(id) on delete restrict,
  total           numeric(10,2) not null,
  metodo_pago     metodo_pago not null,
  cfdi_solicitado boolean not null default false,
  facturapi_id    text,
  created_at      timestamptz not null default now()
);

-- Stock por almacén
create table if not exists inventario_stock (
  id           uuid primary key default gen_random_uuid(),
  almacen_id   uuid not null references almacenes(id) on delete cascade,
  insumo_id    uuid not null references insumos(id) on delete cascade,
  stock_actual numeric(10,3) not null default 0,
  stock_minimo numeric(10,3) not null default 0,
  unique (almacen_id, insumo_id)
);

-- Lotes
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

-- Mermas
create table if not exists mermas (
  id             uuid primary key default gen_random_uuid(),
  insumo_id      uuid not null references insumos(id) on delete restrict,
  almacen_id     uuid not null references almacenes(id) on delete restrict,
  lote_id        uuid references lotes(id),
  cantidad       numeric(10,3) not null check (cantidad > 0),
  tipo           tipo_merma not null,
  notas          text,
  registrado_por uuid references usuarios(id),
  created_at     timestamptz not null default now()
);

-- Transferencias entre almacenes
create table if not exists transferencias (
  id             uuid primary key default gen_random_uuid(),
  origen_id      uuid not null references almacenes(id) on delete restrict,
  destino_id     uuid not null references almacenes(id) on delete restrict,
  estado         estado_transferencia not null default 'pendiente',
  notas          text,
  creado_por     uuid references usuarios(id),
  confirmado_por uuid references usuarios(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (origen_id <> destino_id)
);

create table if not exists transferencia_items (
  id               uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references transferencias(id) on delete cascade,
  insumo_id        uuid not null references insumos(id) on delete restrict,
  cantidad         numeric(10,3) not null check (cantidad > 0)
);

-- Movimientos de inventario (log)
create table if not exists inventario_movimientos (
  id            uuid primary key default gen_random_uuid(),
  insumo_id     uuid not null references insumos(id) on delete restrict,
  almacen_id    uuid references almacenes(id),
  cantidad      numeric(10,3) not null,
  tipo          tipo_movimiento not null,
  referencia_id uuid,
  created_at    timestamptz not null default now()
);

-- Turnos
create table if not exists turnos (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete restrict,
  sucursal_id uuid not null references sucursales(id) on delete restrict,
  inicio      timestamptz not null default now(),
  fin         timestamptz,
  notas       text
);

-- Asistencias
create table if not exists asistencias (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete restrict,
  sucursal_id uuid not null references sucursales(id) on delete restrict,
  tipo        text not null check (tipo in ('entrada','salida')),
  created_at  timestamptz not null default now()
);

-- Cortes de caja (historial diario/semanal/mensual)
create table if not exists cortes_caja (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  empleado_id     uuid not null references empleados(id),
  turno_id        uuid references turnos(id),
  fecha_inicio    timestamptz not null,
  fecha_fin       timestamptz not null,
  num_ordenes     integer not null default 0,
  total_efectivo  numeric(10,2) not null default 0,
  total_tarjeta   numeric(10,2) not null default 0,
  total_qr        numeric(10,2) not null default 0,
  total_wallet    numeric(10,2) not null default 0,
  total_general   numeric(10,2) not null default 0,
  notas           text,
  created_at      timestamptz not null default now()
);

-- Movimientos de puntos
create table if not exists puntos_movimientos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  puntos      integer not null,
  tipo        tipo_movimiento_puntos not null,
  orden_id    uuid references ordenes(id),
  descripcion text,
  created_at  timestamptz not null default now()
);

-- Movimientos de wallet
create table if not exists wallet_movimientos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  monto       numeric(10,2) not null,
  tipo        tipo_movimiento_wallet not null,
  orden_id    uuid references ordenes(id),
  descripcion text,
  created_at  timestamptz not null default now()
);

-- Gift cards
create table if not exists gift_cards (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  saldo         numeric(10,2) not null check (saldo >= 0),
  saldo_inicial numeric(10,2) not null,
  activa        boolean not null default true,
  cliente_id    uuid references clientes(id),
  vence_en      date,
  created_at    timestamptz not null default now()
);

-- Plataformas delivery
create table if not exists plataformas_delivery (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug   slug_plataforma not null unique,
  activa boolean not null default true
);

-- Órdenes delivery
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

-- Promociones
create table if not exists promociones (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  descripcion   text,
  tipo          tipo_promocion not null,
  valor         numeric(10,2),
  codigo        text unique,
  activa        boolean not null default true,
  aplica_a      text check (aplica_a in ('todo','categoria','producto')),
  referencia_id uuid,
  fecha_inicio  date,
  fecha_fin     date,
  horas_inicio  time,
  horas_fin     time,
  sucursal_id   uuid references sucursales(id),
  condiciones   jsonb,
  created_at    timestamptz not null default now()
);

-- Bitácora (auditoría)
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

-- ─── 4. TRIGGERS & FUNCIONES ─────────────────────────────────────────────────

-- updated_at automático
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin NEW.updated_at = now(); return NEW; end;
$$;

create or replace trigger trg_ordenes_updated_at
  before update on ordenes
  for each row execute function set_updated_at();

create or replace trigger trg_transferencias_updated_at
  before update on transferencias
  for each row execute function set_updated_at();

-- Crear venta al confirmar pago
create or replace function crear_venta_al_pagar()
returns trigger language plpgsql security definer as $$
declare
  v_metodo metodo_pago;
begin
  if NEW.pagado = true and OLD.pagado = false then
    -- Método principal: el de mayor monto en orden_pagos, o el campo directo
    select metodo into v_metodo
    from orden_pagos
    where orden_id = NEW.id
    order by monto desc
    limit 1;

    if v_metodo is null then
      v_metodo := NEW.metodo_pago;
    end if;

    if v_metodo is not null then
      insert into ventas (orden_id, total, metodo_pago)
      values (NEW.id, NEW.total, v_metodo)
      on conflict (orden_id) do nothing;
    end if;
  end if;
  return NEW;
end;
$$;

create or replace trigger trg_crear_venta
  after update on ordenes
  for each row execute function crear_venta_al_pagar();

-- Actualizar nivel de cliente según puntos
create or replace function actualizar_nivel_cliente()
returns trigger language plpgsql as $$
begin
  NEW.nivel := case
    when NEW.puntos >= 5000 then 'platino'::nivel_cliente
    when NEW.puntos >= 2000 then 'oro'::nivel_cliente
    when NEW.puntos >= 500  then 'plata'::nivel_cliente
    else                         'bronce'::nivel_cliente
  end;
  return NEW;
end;
$$;

create or replace trigger trg_nivel_cliente
  before insert or update of puntos on clientes
  for each row execute function actualizar_nivel_cliente();

-- ─── 5. ROW LEVEL SECURITY ────────────────────────────────────────────────────
-- Phase 1: políticas abiertas para anon key (sin Supabase Auth)
-- Se endurecerán cuando se active la autenticación.

alter table cocinas              enable row level security;
alter table sucursales           enable row level security;
alter table usuarios             enable row level security;
alter table clientes             enable row level security;
alter table empleados            enable row level security;
alter table ordenes              enable row level security;
alter table categorias           enable row level security;
alter table insumos              enable row level security;
alter table productos            enable row level security;
alter table recetas              enable row level security;
alter table almacenes            enable row level security;
alter table productos_sucursal   enable row level security;
alter table orden_items          enable row level security;
alter table orden_pagos          enable row level security;
alter table ventas               enable row level security;
alter table inventario_stock     enable row level security;
alter table lotes                enable row level security;
alter table mermas               enable row level security;
alter table transferencias       enable row level security;
alter table transferencia_items  enable row level security;
alter table inventario_movimientos enable row level security;
alter table turnos               enable row level security;
alter table asistencias          enable row level security;
alter table cortes_caja          enable row level security;
alter table puntos_movimientos   enable row level security;
alter table wallet_movimientos   enable row level security;
alter table gift_cards           enable row level security;
alter table plataformas_delivery enable row level security;
alter table ordenes_delivery     enable row level security;
alter table promociones          enable row level security;
alter table bitacora             enable row level security;

-- Políticas de acceso total para anon (Phase 1)
create policy "anon_all" on cocinas             for all using (true) with check (true);
create policy "anon_all" on sucursales          for all using (true) with check (true);
create policy "anon_all" on usuarios            for all using (true) with check (true);
create policy "anon_all" on clientes            for all using (true) with check (true);
create policy "anon_all" on empleados           for all using (true) with check (true);
create policy "anon_all" on ordenes             for all using (true) with check (true);
create policy "anon_all" on categorias          for all using (true) with check (true);
create policy "anon_all" on insumos             for all using (true) with check (true);
create policy "anon_all" on productos           for all using (true) with check (true);
create policy "anon_all" on recetas             for all using (true) with check (true);
create policy "anon_all" on almacenes           for all using (true) with check (true);
create policy "anon_all" on productos_sucursal  for all using (true) with check (true);
create policy "anon_all" on orden_items         for all using (true) with check (true);
create policy "anon_all" on orden_pagos         for all using (true) with check (true);
create policy "anon_all" on ventas              for all using (true) with check (true);
create policy "anon_all" on inventario_stock    for all using (true) with check (true);
create policy "anon_all" on lotes               for all using (true) with check (true);
create policy "anon_all" on mermas              for all using (true) with check (true);
create policy "anon_all" on transferencias      for all using (true) with check (true);
create policy "anon_all" on transferencia_items for all using (true) with check (true);
create policy "anon_all" on inventario_movimientos for all using (true) with check (true);
create policy "anon_all" on turnos              for all using (true) with check (true);
create policy "anon_all" on asistencias         for all using (true) with check (true);
create policy "anon_all" on cortes_caja         for all using (true) with check (true);
create policy "anon_all" on puntos_movimientos  for all using (true) with check (true);
create policy "anon_all" on wallet_movimientos  for all using (true) with check (true);
create policy "anon_all" on gift_cards          for all using (true) with check (true);
create policy "anon_all" on plataformas_delivery for all using (true) with check (true);
create policy "anon_all" on ordenes_delivery    for all using (true) with check (true);
create policy "anon_all" on promociones         for all using (true) with check (true);
create policy "anon_all" on bitacora            for all using (true) with check (true);

-- ─── 6. ÍNDICES ──────────────────────────────────────────────────────────────

create index if not exists idx_ordenes_created_at    on ordenes (created_at desc);
create index if not exists idx_ordenes_sucursal      on ordenes (sucursal_id, created_at desc);
create index if not exists idx_ordenes_pagado        on ordenes (pagado, estado);
create index if not exists idx_ordenes_cliente       on ordenes (cliente_id) where cliente_id is not null;
create index if not exists idx_orden_items_orden     on orden_items (orden_id);
create index if not exists idx_orden_items_producto  on orden_items (producto_id);
create index if not exists idx_ventas_created        on ventas (created_at desc);
create index if not exists idx_clientes_telefono     on clientes (telefono) where telefono is not null;
create index if not exists idx_clientes_email        on clientes (email) where email is not null;
create index if not exists idx_puntos_mov_cliente    on puntos_movimientos (cliente_id, created_at desc);
create index if not exists idx_wallet_mov_cliente    on wallet_movimientos (cliente_id, created_at desc);
create index if not exists idx_productos_categoria   on productos (categoria_id) where activo = true;
create index if not exists idx_gift_cards_codigo     on gift_cards (codigo);
create index if not exists idx_promociones_codigo    on promociones (codigo) where codigo is not null;

-- ─── 7. VISTAS PARA REPORTES ─────────────────────────────────────────────────

create or replace view vw_ventas_diarias as
select
  date_trunc('day', o.created_at)::date                         as dia,
  o.sucursal_id,
  count(o.id)                                                    as num_ordenes,
  coalesce(sum(o.total), 0)                                      as total_ventas,
  coalesce(sum(case when o.metodo_pago = 'efectivo'        then o.total else 0 end), 0) as efectivo,
  coalesce(sum(case when o.metodo_pago = 'tarjeta_credito' then o.total else 0 end), 0) as tarjeta_credito,
  coalesce(sum(case when o.metodo_pago = 'tarjeta_debito'  then o.total else 0 end), 0) as tarjeta_debito,
  coalesce(sum(case when o.metodo_pago = 'qr'              then o.total else 0 end), 0) as qr,
  coalesce(sum(case when o.metodo_pago = 'wallet'          then o.total else 0 end), 0) as wallet,
  round(coalesce(avg(o.total), 0), 2)                            as ticket_promedio
from ordenes o
where o.pagado = true
  and o.estado != 'cancelada'
group by 1, 2;

create or replace view vw_ventas_semanales as
select
  date_trunc('week', o.created_at)::date                        as semana_inicio,
  o.sucursal_id,
  count(o.id)                                                    as num_ordenes,
  coalesce(sum(o.total), 0)                                      as total_ventas,
  round(coalesce(avg(o.total), 0), 2)                            as ticket_promedio,
  count(distinct date_trunc('day', o.created_at)::date)         as dias_activos
from ordenes o
where o.pagado = true
  and o.estado != 'cancelada'
group by 1, 2;

create or replace view vw_ventas_mensuales as
select
  date_trunc('month', o.created_at)::date                       as mes,
  o.sucursal_id,
  count(o.id)                                                    as num_ordenes,
  coalesce(sum(o.total), 0)                                      as total_ventas,
  round(coalesce(avg(o.total), 0), 2)                            as ticket_promedio,
  count(distinct date_trunc('week', o.created_at)::date)        as semanas_activas,
  coalesce(sum(case when o.canal = 'kiosko'   then 1 else 0 end), 0) as ordenes_kiosko,
  coalesce(sum(case when o.canal = 'pos'      then 1 else 0 end), 0) as ordenes_pos,
  coalesce(sum(case when o.canal = 'delivery' then 1 else 0 end), 0) as ordenes_delivery
from ordenes o
where o.pagado = true
  and o.estado != 'cancelada'
group by 1, 2;

create or replace view vw_productos_mas_vendidos as
select
  p.id,
  p.nombre,
  cat.nombre                        as categoria,
  sum(oi.cantidad)                  as total_vendido,
  sum(oi.cantidad * oi.precio_unitario) as total_ingresos
from orden_items oi
join ordenes o   on o.id   = oi.orden_id
join productos p on p.id   = oi.producto_id
join categorias cat on cat.id = p.categoria_id
where o.pagado = true
  and o.estado != 'cancelada'
group by p.id, p.nombre, cat.nombre
order by total_vendido desc;

-- ─── 8. FUNCIÓN: resumen para corte de caja ──────────────────────────────────

create or replace function fn_resumen_corte(
  p_sucursal_id uuid,
  p_desde       timestamptz,
  p_hasta       timestamptz
)
returns table (
  num_ordenes           bigint,
  total_ventas          numeric,
  total_efectivo        numeric,
  total_tarjeta_credito numeric,
  total_tarjeta_debito  numeric,
  total_qr              numeric,
  total_wallet          numeric,
  ticket_promedio       numeric
)
language sql stable as $$
  select
    count(id)                                                             as num_ordenes,
    coalesce(sum(total), 0)                                               as total_ventas,
    coalesce(sum(case when metodo_pago = 'efectivo'        then total else 0 end), 0) as total_efectivo,
    coalesce(sum(case when metodo_pago = 'tarjeta_credito' then total else 0 end), 0) as total_tarjeta_credito,
    coalesce(sum(case when metodo_pago = 'tarjeta_debito'  then total else 0 end), 0) as total_tarjeta_debito,
    coalesce(sum(case when metodo_pago = 'qr'              then total else 0 end), 0) as total_qr,
    coalesce(sum(case when metodo_pago = 'wallet'          then total else 0 end), 0) as total_wallet,
    round(coalesce(avg(total), 0), 2)                                     as ticket_promedio
  from ordenes
  where sucursal_id = p_sucursal_id
    and created_at between p_desde and p_hasta
    and pagado = true
    and estado != 'cancelada';
$$;

-- ─── 9. DATOS SEMILLA — Shake Aholic ─────────────────────────────────────────
-- Todos los UUIDs usan solo caracteres hex válidos (0-9, a-f)
-- Esquema de IDs:
--   0001-xxxx = cocinas       0002-xxxx = almacenes
--   0003-xxxx = categorias    0004-xxxx = productos
--   0005-xxxx = insumos       0006-xxxx = usuarios
--   0007-xxxx = empleados     0008-xxxx = clientes

-- Cocinas
insert into cocinas (id, nombre, slug) values
  ('00000000-0000-0000-0001-000000000001', 'Alimentos', 'alimentos'),
  ('00000000-0000-0000-0001-000000000002', 'Bebidas',   'bebidas')
on conflict (slug) do nothing;

-- Sucursal principal
insert into sucursales (id, nombre, direccion, telefono) values
  ('00000000-0000-0000-0000-000000000001', 'Shake Aholic · Sucursal Principal',
   'Av. Insurgentes Sur 1234, Col. Del Valle, CDMX', '55 1234-5678')
on conflict (id) do nothing;

-- Almacenes
insert into almacenes (id, nombre, tipo, sucursal_id) values
  ('00000000-0000-0000-0002-000000000001', 'Almacén Central',             'central',  null),
  ('00000000-0000-0000-0002-000000000002', 'Almacén Sucursal Principal',  'sucursal', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Plataformas delivery
insert into plataformas_delivery (nombre, slug) values
  ('Uber Eats', 'uber_eats'),
  ('Didi Food', 'didi_food'),
  ('Rappi',     'rappi')
on conflict (slug) do nothing;

-- Categorías Bebidas
insert into categorias (id, nombre, cocina_id, activa) values
  ('00000000-0000-0000-0003-000000000001', 'Shakes',          '00000000-0000-0000-0001-000000000002', true),
  ('00000000-0000-0000-0003-000000000002', 'Café',            '00000000-0000-0000-0001-000000000002', true),
  ('00000000-0000-0000-0003-000000000003', 'Agua & Naturales','00000000-0000-0000-0001-000000000002', true)
on conflict (id) do nothing;

-- Categorías Alimentos
insert into categorias (id, nombre, cocina_id, activa) values
  ('00000000-0000-0000-0003-000000000004', 'Bowls',  '00000000-0000-0000-0001-000000000001', true),
  ('00000000-0000-0000-0003-000000000005', 'Snacks', '00000000-0000-0000-0001-000000000001', true)
on conflict (id) do nothing;

-- Productos: Shakes (bebidas)
insert into productos (id, nombre, descripcion, precio, categoria_id, activo) values
  ('00000000-0000-0000-0004-000000000001', 'Shake Fresa Power',
   'Proteína de suero, fresa, leche y hielo', 85.00,
   '00000000-0000-0000-0003-000000000001', true),
  ('00000000-0000-0000-0004-000000000002', 'Shake Mango Boost',
   'Proteína, mango, leche de coco y jengibre', 85.00,
   '00000000-0000-0000-0003-000000000001', true),
  ('00000000-0000-0000-0004-000000000003', 'Shake Vainilla Proteína',
   'Proteína de vainilla, leche, plátano y miel', 80.00,
   '00000000-0000-0000-0003-000000000001', true),
  ('00000000-0000-0000-0004-000000000004', 'Shake Chocolate',
   'Proteína de chocolate, cacao, leche y avena', 90.00,
   '00000000-0000-0000-0003-000000000001', true),
  ('00000000-0000-0000-0004-000000000005', 'Shake Verde Detox',
   'Espinaca, manzana verde, pepino, jengibre y limón', 90.00,
   '00000000-0000-0000-0003-000000000001', true)
on conflict (id) do nothing;

-- Productos: Café (bebidas)
insert into productos (id, nombre, descripcion, precio, categoria_id, activo) values
  ('00000000-0000-0000-0004-000000000006', 'Café Frío Mocha',
   'Cold brew con leche, sirope de chocolate y hielo', 65.00,
   '00000000-0000-0000-0003-000000000002', true),
  ('00000000-0000-0000-0004-000000000007', 'Café Americano',
   'Café de grano 100% arabica, recién molido', 45.00,
   '00000000-0000-0000-0003-000000000002', true),
  ('00000000-0000-0000-0004-000000000008', 'Matcha Latte',
   'Matcha ceremonial con leche de avena', 70.00,
   '00000000-0000-0000-0003-000000000002', true)
on conflict (id) do nothing;

-- Productos: Agua & Naturales (bebidas)
insert into productos (id, nombre, descripcion, precio, categoria_id, activo) values
  ('00000000-0000-0000-0004-000000000009', 'Agua Purificada 500ml',
   'Agua fría en botella', 20.00,
   '00000000-0000-0000-0003-000000000003', true),
  ('00000000-0000-0000-0004-000000000010', 'Agua Mineral 355ml',
   'Agua mineral con gas', 25.00,
   '00000000-0000-0000-0003-000000000003', true)
on conflict (id) do nothing;

-- Productos: Bowls (alimentos)
insert into productos (id, nombre, descripcion, precio, categoria_id, activo) values
  ('00000000-0000-0000-0004-000000000011', 'Bowl Banana + Granola',
   'Plátano, granola casera, miel y semillas', 110.00,
   '00000000-0000-0000-0003-000000000004', true),
  ('00000000-0000-0000-0004-000000000012', 'Bowl Açaí Power',
   'Açaí, granola, fresa, plátano y miel de agave', 125.00,
   '00000000-0000-0000-0003-000000000004', true),
  ('00000000-0000-0000-0004-000000000013', 'Bowl Tropical',
   'Mango, piña, coco rallado, granola y chía', 115.00,
   '00000000-0000-0000-0003-000000000004', true)
on conflict (id) do nothing;

-- Productos: Snacks (alimentos)
insert into productos (id, nombre, descripcion, precio, categoria_id, activo) values
  ('00000000-0000-0000-0004-000000000014', 'Snack Choco-Avena',
   'Barra de avena con chips de chocolate', 35.00,
   '00000000-0000-0000-0003-000000000005', true),
  ('00000000-0000-0000-0004-000000000015', 'Snack Proteína Almendra',
   'Barra de proteína con almendras y miel', 40.00,
   '00000000-0000-0000-0003-000000000005', true),
  ('00000000-0000-0000-0004-000000000016', 'Energy Ball',
   'Bolitas de dátil, avena y coco', 30.00,
   '00000000-0000-0000-0003-000000000005', true)
on conflict (id) do nothing;

-- Insumos principales
insert into insumos (id, nombre, unidad, stock_actual, stock_minimo, costo_unitario) values
  ('00000000-0000-0000-0005-000000000001', 'Proteína de suero',  'kg',    5.0,  1.0, 350.00),
  ('00000000-0000-0000-0005-000000000002', 'Leche entera',       'litro', 15.0, 3.0,  22.00),
  ('00000000-0000-0000-0005-000000000003', 'Plátano',            'kg',    8.0,  2.0,  18.00),
  ('00000000-0000-0000-0005-000000000004', 'Fresa',              'kg',    6.0,  1.5,  45.00),
  ('00000000-0000-0000-0005-000000000005', 'Mango',              'kg',    7.0,  2.0,  30.00),
  ('00000000-0000-0000-0005-000000000006', 'Avena',              'kg',    4.0,  1.0,  35.00),
  ('00000000-0000-0000-0005-000000000007', 'Granola',            'kg',    3.0,  0.5,  80.00),
  ('00000000-0000-0000-0005-000000000008', 'Cacao en polvo',     'kg',    2.0,  0.5, 120.00),
  ('00000000-0000-0000-0005-000000000009', 'Espinaca',           'kg',    3.0,  0.5,  25.00),
  ('00000000-0000-0000-0005-000000000010', 'Café molido',        'kg',    2.5,  0.5, 180.00),
  ('00000000-0000-0000-0005-000000000011', 'Azúcar',             'kg',    5.0,  1.0,  20.00),
  ('00000000-0000-0000-0005-000000000012', 'Hielo',              'kg',   20.0,  5.0,   3.00),
  ('00000000-0000-0000-0005-000000000013', 'Açaí (pulpa)',       'kg',    2.0,  0.5, 220.00),
  ('00000000-0000-0000-0005-000000000014', 'Almendra',           'kg',    1.5,  0.3, 280.00),
  ('00000000-0000-0000-0005-000000000015', 'Leche de coco',      'litro', 4.0,  1.0,  55.00),
  ('00000000-0000-0000-0005-000000000016', 'Matcha en polvo',    'kg',    0.5,  0.1, 600.00)
on conflict (id) do nothing;

-- Stock en almacén sucursal
insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
select '00000000-0000-0000-0002-000000000002', id, stock_actual, stock_minimo
from insumos
on conflict (almacen_id, insumo_id) do update
  set stock_actual = excluded.stock_actual,
      stock_minimo = excluded.stock_minimo;

-- Usuarios internos
insert into usuarios (id, nombre, email, rol) values
  ('00000000-0000-0000-0006-000000000001', 'CEO Shake Aholic', 'ceo@shakeaholic.mx',    'admin'),
  ('00000000-0000-0000-0006-000000000002', 'Ana García',       'ana@shakeaholic.mx',    'cajero'),
  ('00000000-0000-0000-0006-000000000003', 'Carlos López',     'carlos@shakeaholic.mx', 'cajero'),
  ('00000000-0000-0000-0006-000000000004', 'Chef Ramírez',     'cocina@shakeaholic.mx', 'cocina'),
  ('00000000-0000-0000-0006-000000000005', 'Barista Jorge',    'jorge@shakeaholic.mx',  'cocina')
on conflict (id) do nothing;

-- Empleados
insert into empleados (id, usuario_id, nombre, sucursal_id, rol, pin, activo) values
  ('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0006-000000000001',
   'CEO Shake Aholic', '00000000-0000-0000-0000-000000000001', 'administrador', '9999', true),
  ('00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0006-000000000002',
   'Ana García',       '00000000-0000-0000-0000-000000000001', 'cajero',        '1234', true),
  ('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0006-000000000003',
   'Carlos López',     '00000000-0000-0000-0000-000000000001', 'cajero',        '2222', true),
  ('00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0006-000000000004',
   'Chef Ramírez',     '00000000-0000-0000-0000-000000000001', 'cocina',        '3333', true),
  ('00000000-0000-0000-0007-000000000005', '00000000-0000-0000-0006-000000000005',
   'Barista Jorge',    '00000000-0000-0000-0000-000000000001', 'bebidas',       '4444', true)
on conflict (id) do nothing;

-- Clientes de lealtad
insert into clientes (id, nombre, email, telefono, nivel, puntos, wallet_saldo) values
  ('00000000-0000-0000-0008-000000000001', 'María González',  'maria@email.com',  '55-100-0001', 'plata',    450, 120.50),
  ('00000000-0000-0000-0008-000000000002', 'Roberto Sánchez', null,               '55-100-0002', 'oro',     1850,   0.00),
  ('00000000-0000-0000-0008-000000000003', 'Laura Torres',    null,               '55-100-0003', 'bronce',    80,  50.00),
  ('00000000-0000-0000-0008-000000000004', 'Diego Hernández', 'diego@email.com',  '55-100-0004', 'platino', 5200, 350.00),
  ('00000000-0000-0000-0008-000000000005', 'Carmen Ruiz',     'carmen@email.com', '55-100-0005', 'bronce',   120,   0.00),
  ('00000000-0000-0000-0008-000000000006', 'Fernanda Castro', null,               '55-100-0006', 'plata',    780,  75.00)
on conflict (id) do nothing;

-- Gift cards demo
insert into gift_cards (codigo, saldo, saldo_inicial, activa, vence_en) values
  ('GIFT-2024',  150.00, 150.00, true,  current_date + interval '6 months'),
  ('GIFT-PROMO',  50.00,  50.00, true,  current_date + interval '3 months'),
  ('GIFT-BDAY',  200.00, 200.00, true,  current_date + interval '1 year'),
  ('GIFT-AGOT',    0.00, 100.00, false, null)
on conflict (codigo) do nothing;

-- Promociones
insert into promociones (nombre, descripcion, tipo, valor, codigo, activa, aplica_a,
  fecha_inicio, fecha_fin, horas_inicio, horas_fin) values
  ('FRESH15', '15% en toda tu orden — usa el código al pagar',
   'descuento_porcentaje', 15, 'FRESH15', true, 'todo', null, null, null, null),
  ('Happy Hour Café', '10% off en cafés de 4 a 6 PM',
   'descuento_porcentaje', 10, null, true, 'categoria', null, null, '16:00', '18:00'),
  ('Bowl Power Combo', '$20 off llevando Bowl + Shake',
   'descuento_monto', 20, null, true, 'todo', null, null, null, null),
  ('BIENVENIDA', '$50 en tu primera orden',
   'descuento_monto', 50, 'BIENVENIDA', true, 'todo', null, null, null, null),
  ('Segunda al 50%', 'La segunda Shake al 50% — comparte la vibra',
   'segunda_unidad', 50, null, true, 'todo', null, null, null, null)
on conflict (codigo) do nothing;

-- ─── 10. HISTORIAL DE ÓRDENES (30 días) ──────────────────────────────────────
-- Genera ~15-25 órdenes por día con productos y montos reales

do $$
declare
  v_dia        timestamptz;
  v_orden_id   uuid;
  v_num_ord    int;
  v_num_items  int;
  v_prod_id    uuid;
  v_precio     numeric;
  v_cocina_id  uuid;
  v_cantidad   int;
  v_total      numeric;
  v_hora_base  interval;
  v_metodo     metodo_pago;
  v_canal      canal_orden;
  v_cliente_id uuid;

  -- Arrays de IDs de producto y su precio
  prods uuid[] := array[
    '00000000-0000-0000-0004-000000000001'::uuid,
    '00000000-0000-0000-0004-000000000002'::uuid,
    '00000000-0000-0000-0004-000000000003'::uuid,
    '00000000-0000-0000-0004-000000000004'::uuid,
    '00000000-0000-0000-0004-000000000005'::uuid,
    '00000000-0000-0000-0004-000000000006'::uuid,
    '00000000-0000-0000-0004-000000000007'::uuid,
    '00000000-0000-0000-0004-000000000008'::uuid,
    '00000000-0000-0000-0004-000000000009'::uuid,
    '00000000-0000-0000-0004-000000000010'::uuid,
    '00000000-0000-0000-0004-000000000011'::uuid,
    '00000000-0000-0000-0004-000000000012'::uuid,
    '00000000-0000-0000-0004-000000000013'::uuid,
    '00000000-0000-0000-0004-000000000014'::uuid,
    '00000000-0000-0000-0004-000000000015'::uuid,
    '00000000-0000-0000-0004-000000000016'::uuid
  ];
  precios numeric[] := array[85,85,80,90,90,65,45,70,20,25,110,125,115,35,40,30];
  cocinas uuid[] := array[
    '00000000-0000-0000-0001-000000000002'::uuid, -- shake bebidas
    '00000000-0000-0000-0001-000000000002'::uuid,
    '00000000-0000-0000-0001-000000000002'::uuid,
    '00000000-0000-0000-0001-000000000002'::uuid,
    '00000000-0000-0000-0001-000000000002'::uuid,
    '00000000-0000-0000-0001-000000000002'::uuid, -- café bebidas
    '00000000-0000-0000-0001-000000000002'::uuid,
    '00000000-0000-0000-0001-000000000002'::uuid,
    '00000000-0000-0000-0001-000000000002'::uuid, -- agua bebidas
    '00000000-0000-0000-0001-000000000002'::uuid,
    '00000000-0000-0000-0001-000000000001'::uuid, -- bowl alimentos
    '00000000-0000-0000-0001-000000000001'::uuid,
    '00000000-0000-0000-0001-000000000001'::uuid,
    '00000000-0000-0000-0001-000000000001'::uuid, -- snack alimentos
    '00000000-0000-0000-0001-000000000001'::uuid,
    '00000000-0000-0000-0001-000000000001'::uuid
  ];
  metodos metodo_pago[] := array[
    'efectivo'::metodo_pago,'efectivo'::metodo_pago,'efectivo'::metodo_pago,
    'tarjeta_debito'::metodo_pago,'tarjeta_debito'::metodo_pago,
    'tarjeta_credito'::metodo_pago,
    'qr'::metodo_pago,'qr'::metodo_pago
  ];
  canales canal_orden[] := array[
    'pos'::canal_orden,'pos'::canal_orden,'pos'::canal_orden,
    'kiosko'::canal_orden,'kiosko'::canal_orden
  ];
  clientes_ids uuid[] := array[
    null::uuid, null::uuid, null::uuid,
    '00000000-0000-0000-0008-000000000001'::uuid,
    '00000000-0000-0000-0008-000000000002'::uuid,
    '00000000-0000-0000-0008-000000000004'::uuid,
    null::uuid, null::uuid
  ];

  idx int;
  ci  int;
begin
  for v_dia in
    select generate_series(
      (now() - interval '30 days')::date::timestamptz,
      (now() - interval '1 day')::date::timestamptz,
      interval '1 day'
    )
  loop
    v_num_ord := 10 + floor(random() * 16)::int;

    for ord_i in 1..v_num_ord loop
      v_orden_id   := gen_random_uuid();
      v_hora_base  := (interval '1 second' * floor(random() * 36000 + 28800)::int); -- 8am-6pm
      v_metodo     := metodos[(floor(random() * 8)::int % 8) + 1];
      v_canal      := canales[(floor(random() * 5)::int % 5) + 1];
      ci           := (floor(random() * 8)::int % 8) + 1;
      v_cliente_id := clientes_ids[ci];
      v_total      := 0;

      insert into ordenes (id, folio, estado, total, metodo_pago, pagado,
        sucursal_id, canal, cliente_id, created_at, updated_at)
      values (
        v_orden_id,
        nextval('ordenes_folio_seq'),
        'entregada',
        0,
        v_metodo,
        true,
        '00000000-0000-0000-0000-000000000001',
        v_canal,
        v_cliente_id,
        v_dia + v_hora_base,
        v_dia + v_hora_base + interval '8 minutes'
      );

      -- Ítems: 1-3 productos por orden
      v_num_items := 1 + floor(random() * 3)::int;
      for item_i in 1..v_num_items loop
        idx        := (floor(random() * 16)::int % 16) + 1;
        v_prod_id  := prods[idx];
        v_precio   := precios[idx];
        v_cocina_id := cocinas[idx];
        v_cantidad := 1 + floor(random() * 2)::int;

        insert into orden_items (orden_id, producto_id, cantidad, precio_unitario, cocina_id)
        values (v_orden_id, v_prod_id, v_cantidad, v_precio, v_cocina_id);

        v_total := v_total + (v_precio * v_cantidad);
      end loop;

      -- Actualizar total en la orden
      update ordenes set total = v_total where id = v_orden_id;

      -- Insertar venta directamente (la orden ya nace pagada)
      insert into ventas (orden_id, total, metodo_pago)
      values (v_orden_id, v_total, v_metodo);

    end loop;
  end loop;
end $$;

-- Verificación final
select
  (select count(*) from cocinas)      as cocinas,
  (select count(*) from categorias)   as categorias,
  (select count(*) from productos)    as productos,
  (select count(*) from insumos)      as insumos,
  (select count(*) from empleados)    as empleados,
  (select count(*) from clientes)     as clientes,
  (select count(*) from ordenes)      as ordenes_historicas,
  (select count(*) from ventas)       as ventas,
  (select sum(total) from ventas)     as ingreso_total_semilla;
