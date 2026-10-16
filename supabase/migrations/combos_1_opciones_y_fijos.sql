-- Combos: cada opción descuenta su producto real, y lo fijo se declara (16/10/26).
--
-- Lo que había: cada combo es un producto de la categoría Combos y sus
-- opciones son EXTRAS con grupo («Muffin», «Té», «Sándwich»…). La venta sí
-- guardaba lo que eligió el cliente (orden_items hijos), pero esos extras
-- eran copias SIN receta: el «Blueberry» del combo no era el «Muffin -
-- Blueberry». En 30 días se vendieron 214 combos y no bajó ni un sándwich,
-- wrap, té, muffin, galleta ni chapata. La chapata ni siquiera estaba
-- ligada. Solo los cafés descontaban, con recetas copiadas que ya se habían
-- separado (el Americano Helado del combo descontaba 0 g de café).
--
-- Dos tablas, y ninguna toca `productos` (el kiosko la lee en cada venta):
--
-- * `inventario_como`: «este producto descuenta como aquel». La opción del
--   combo apunta al producto REAL y se usa SU receta, la que mantiene
--   Costeos. Sin copias que se separen.
-- * `combo_fijos`: lo que el combo trae siempre (la chapata).
--
-- NO se reusa `combo_items`: es el modelo viejo de combos y trae
-- `fn_combo_recalcular`, que COPIA la receta del componente al combo cada
-- vez que cambia — eso más la expansión del trigger descontaría dos veces.
-- Y exige `es_combo = true`, que saca al combo de la lista de Admin.

set lock_timeout = '3s';

create table if not exists public.inventario_como (
  producto_id      uuid primary key references public.productos(id),
  como_producto_id uuid not null references public.productos(id),
  actualizado_en   timestamptz not null default now(),
  check (producto_id <> como_producto_id)
);
comment on table public.inventario_como is
  'Una opción de combo (extra) descuenta la receta de su producto real. La lee fn_descontar_inventario_por_orden.';
alter table public.inventario_como enable row level security;
create policy inventario_como_personal on public.inventario_como for select using (fn_es_staff());

create table if not exists public.combo_fijos (
  combo_id    uuid not null references public.productos(id),
  producto_id uuid not null references public.productos(id),
  cantidad    numeric(10,3) not null default 1 check (cantidad > 0),
  primary key (combo_id, producto_id),
  check (combo_id <> producto_id)
);
comment on table public.combo_fijos is
  'Lo que un combo trae SIEMPRE (la chapata de los combos Milo). Se descuenta su receta × cantidad × combos vendidos.';
alter table public.combo_fijos enable row level security;
create policy combo_fijos_personal on public.combo_fijos for select using (fn_es_staff());

-- ── Cada opción, a su producto real ──────────────────────────────────────
do $$
declare
  r record;
  v_extra uuid;
begin
  for r in select * from (values
    ('Blueberry',                    '99115c71-fda1-45e4-a017-29ea3f2fc539'),  -- Muffin - Blueberry
    ('Chispas de Chocolate',         '67ec8a64-9f0d-433b-b292-b36bd3c3c016'),  -- Muffin - Chispas de Chocolate
    ('Chocolate',                    '15d12159-f04b-474f-aa43-4883da7ad4c9'),  -- Muffin - Chocolate
    ('Fit Club Turkey',              'e8dc3c6c-d45c-41ed-a573-8614949b0114'),  -- Sándwich -  Fit Club Turkey
    ('Honey Roast Deli',             '0be59fd2-1cc2-42f5-8f53-ba6a6865dfee'),
    ('Mediterranean Chicken',        '705d2791-b92b-4079-be1f-d386b62cebc0'),
    ('Fresh & Crunch Tuna',          'df002968-cf24-42a2-b6c9-47fd71b80fa6'),  -- Wrap
    ('Smoky Chipotle Chicken',       '6d463e64-9431-45dc-9002-8ea169004b95'),  -- Wrap
    ('Té Negro - Blueberry Açaí',    '82367369-4b3c-4e9c-b1e2-4bb5a4aedc6b'),  -- Tés
    ('Té Negro - Guayaba Jamaica',   '4ba15819-d8dc-4764-acc1-931d51d3f5b3'),
    ('Té Rojo - Jamaica Arándanos',  '12f80368-7f7c-468f-9ffa-b0cc121b199f'),
    ('Té Verde - Limonada Durazno',  '68b1fee6-b38a-4460-ba84-b88836228d73'),
    ('Galleta: Macadamia',           '184066f0-6315-46b2-9f37-23f87f9d23c3'),  -- Cookie - Macadamia
    ('Galleta: Chispas de Chocolate','ac526ad6-c28c-4e92-9a84-0793fb4d311e'),  -- Cookie - Chispas de Chocolate
    ('Americano Caliente',           '82ada1b9-5f6e-408e-aabe-dac6b58252e8'),  -- Café
    ('Americano Helado',             'cfc9d6d3-dffb-42dd-bb79-9e462d7d0f61'),
    ('Latte Helado',                 '433dcbca-03dd-4f2b-b0f4-42c7cff1833c')
  ) t(extra, real)
  loop
    select id into strict v_extra from productos
     where nombre = r.extra and es_extra and archivado_en is null;
    insert into inventario_como (producto_id, como_producto_id)
    values (v_extra, r.real::uuid)
    on conflict (producto_id) do update set como_producto_id = excluded.como_producto_id, actualizado_en = now();
  end loop;
end $$;

-- ── El Latte del combo también se elige caliente ─────────────────────────
-- Hoy el grupo «Café» del Chapata-Latte tiene una sola opción (helado):
-- nace la opción caliente, ligada al «Latte Caliente» real.
do $$
declare v_extra uuid;
begin
  select id into v_extra from productos
   where nombre = 'Latte Caliente' and es_extra and archivado_en is null;
  if v_extra is null then
    insert into productos (nombre, precio, activo, es_extra, categoria_id)
    values ('Latte Caliente', 0, true, true, '65d4f773-3ef0-453b-a0c4-5ae406c30d5a')
    returning id into v_extra;
  end if;
  insert into producto_extras (producto_id, extra_id, grupo, estacion, por_defecto)
  values ('b7620c25-0c2e-4723-9d7f-f003f387e1f3', v_extra, 'Café', 'bebidas', false)
  on conflict (producto_id, extra_id) do update set grupo = 'Café', estacion = 'bebidas';
  insert into inventario_como (producto_id, como_producto_id)
  values (v_extra, 'f0dfd70d-25ff-4c95-959e-53b7f02b44fd')
  on conflict (producto_id) do update set como_producto_id = excluded.como_producto_id, actualizado_en = now();
end $$;

-- ── La chapata, fija en los dos combos Milo ──────────────────────────────
insert into combo_fijos (combo_id, producto_id, cantidad) values
  ('29852a9c-9b77-4d65-8424-f05576d52650', 'eba6e2fc-deb3-48e4-9700-e6b4476d8ad3', 1),  -- Chapata-Americano
  ('b7620c25-0c2e-4723-9d7f-f003f387e1f3', 'eba6e2fc-deb3-48e4-9700-e6b4476d8ad3', 1)   -- Chapata-Latte
on conflict (combo_id, producto_id) do update set cantidad = excluded.cantidad;
