-- Registrar producción: una receta de Costeo Alimentos se convierte en
-- existencia de un ingrediente elaborado (24/10/26, pedido de Perla con la
-- salsa chipotle).
--
-- Ejemplo: 1 lote de «Salsa de Chipotle» (1 lata de chipotle, 388 g de
-- media crema, sal, envases, tapas) → 39 piezas de «Salsa Chipotle
-- Preparada» en el kiosko. Al vender un wrap o una chapata se descuenta solo
-- la pieza de salsa; la lata, la crema, los envases y las tapas ya se
-- descontaron al producir.
--
-- Cómo, y por qué así:
--
-- * Las cantidades salen de la tabla `recetas` del producto-receta, que
--   `fn_sync_app_data` reescribe desde Costeos en cada guardado. O sea: si
--   Perla cambia la receta en Costeo Alimentos, la producción ya usa lo
--   nuevo. No hay una copia de la receta aquí.
-- * Qué receta produce qué ingrediente vive en `produccion_recetas`
--   (Admin → Inventario → Producción). El rendimiento por lote es el
--   `contenido` del ingrediente («Lote 39pz» → 39) salvo que ahí se diga otro.
-- * Todo en el almacén del KIOSKO: ahí se prepara y ahí se vende.
-- * Antes de mover nada revisa que alcance. Si falta algo NO escribe y
--   contesta qué falta; se puede registrar de todos modos con una nota (el
--   inventario de la tienda ya trae negativos, y bloquear del todo dejaría
--   la salsa hecha sin registrar).
-- * Un rendimiento distinto del esperado (salieron 37, no 39) pide nota.
-- * Idempotente: la pantalla manda el id de la producción. Un doble toque o
--   un reintento por red devuelve la misma, no registra dos.
-- * Cada producción queda en `producciones` (quién, cuándo, cuánto, nota,
--   costo) y en el kardex como movimientos tipo `produccion` ligados a ella.
-- * Sin tablas temporales ni `delete` (corre desde la app) y sin `drop` ni
--   `revoke` (el conector los frena): RLS con política de lectura para
--   gerencia, y las funciones validan quién llama.

set lock_timeout = '3s';

create table if not exists public.produccion_recetas (
  producto_id uuid primary key references public.productos(id),
  insumo_id   uuid not null references public.insumos(id),
  rinde       numeric(12,3) check (rinde > 0),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);
comment on table public.produccion_recetas is
  'Qué receta de Costeos produce qué ingrediente elaborado. rinde = piezas por lote (null: el contenido del ingrediente).';
alter table public.produccion_recetas enable row level security;
create policy produccion_recetas_gerencia on public.produccion_recetas for select using (fn_es_jefe());

create table if not exists public.producciones (
  id          uuid primary key,
  producto_id uuid not null references public.productos(id),
  insumo_id   uuid not null references public.insumos(id),
  almacen_id  uuid not null references public.almacenes(id),
  lotes       numeric(10,3) not null check (lotes > 0),
  esperado    numeric(12,3) not null,
  cantidad    numeric(12,3) not null check (cantidad > 0),
  nota        text,
  faltantes   jsonb,
  costo_total numeric(12,2),
  empleado_id uuid references public.empleados(id),
  creado_en   timestamptz not null default now()
);
comment on table public.producciones is
  'Cada producción registrada: qué receta, cuántos lotes, cuánto salió, quién, cuándo, y lo que faltaba si se forzó.';
alter table public.producciones enable row level security;
create policy producciones_gerencia on public.producciones for select using (fn_es_jefe());

-- La primera: la salsa chipotle. Por nombre, no por id.
insert into public.produccion_recetas (producto_id, insumo_id)
select p.id, i.id
  from productos p, insumos i
 where lower(p.nombre) = 'salsa de chipotle' and not p.es_extra and not p.es_combo
   and lower(i.nombre) = 'salsa chipotle preparada'
on conflict (producto_id) do nothing;

-- Costeos dice «pz»; la sync nunca actualiza la unidad después de crear el
-- insumo, y estos dos nacieron en gramos.
update insumos set unidad = 'pz'
 where lower(nombre) in ('salsa chipotle preparada', 'chipotle') and tipo = 'alimento' and unidad = 'g';

-- ── Lo que el kiosko enseña ─────────────────────────────────────────────
create or replace function public.fn_produccion_opciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_k uuid; v jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede registrar producción.';
  end if;
  select id into v_k from almacenes where tipo = 'kiosko' order by id limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'producto_id', pr.producto_id,
           'receta', p.nombre,
           'insumo_id', i.id,
           'salida', i.nombre,
           'unidad', i.unidad,
           'rinde', coalesce(pr.rinde, nullif(i.contenido, 0), 1),
           'existencia', coalesce((select s.stock_actual from inventario_stock s
                                    where s.insumo_id = i.id and s.almacen_id = v_k), 0),
           'lineas', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'insumo_id', ri.id, 'nombre', ri.nombre, 'unidad', ri.unidad,
                       'cantidad', r.cantidad,
                       'existencia', coalesce((select s.stock_actual from inventario_stock s
                                                where s.insumo_id = ri.id and s.almacen_id = v_k), 0))
                     order by ri.tipo, ri.nombre)
                from recetas r join insumos ri on ri.id = r.insumo_id
               where r.producto_id = pr.producto_id and r.cantidad > 0 and ri.id <> i.id), '[]'::jsonb))
         order by p.nombre), '[]'::jsonb)
    into v
    from produccion_recetas pr
    join productos p on p.id = pr.producto_id
    join insumos i on i.id = pr.insumo_id
   where pr.activo;
  return v;
end;
$$;

-- ── Registrar ───────────────────────────────────────────────────────────
create or replace function public.fn_produccion_registrar(
  p_id uuid,
  p_producto_id uuid,
  p_lotes numeric,
  p_cantidad numeric,
  p_nota text default null,
  p_forzar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_k uuid; v_emp uuid; v_quien text;
  v_pr record; v_rinde numeric; v_esperado numeric;
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
  v_faltan jsonb; v_costo numeric := 0; v_antes numeric;
  r record; v_prev producciones;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede registrar producción.';
  end if;
  if p_id is null then raise exception 'Falta el identificador de la producción.'; end if;

  -- Ya registrada (doble toque o reintento): se devuelve la misma.
  select * into v_prev from producciones where id = p_id;
  if v_prev.id is not null then
    return jsonb_build_object('ok', true, 'repetida', true, 'id', v_prev.id,
                              'cantidad', v_prev.cantidad, 'lotes', v_prev.lotes);
  end if;

  select pr.*, p.nombre receta, i.nombre salida, i.unidad, i.contenido, i.costo_unitario costo_salida
    into v_pr
    from produccion_recetas pr
    join productos p on p.id = pr.producto_id
    join insumos i on i.id = pr.insumo_id
   where pr.producto_id = p_producto_id and pr.activo;
  if v_pr.producto_id is null then
    raise exception 'Esa receta no está ligada a producción (Admin → Inventario → Producción).';
  end if;
  if coalesce(p_lotes, 0) <= 0 or p_lotes > 50 then
    raise exception 'Los lotes van de 0.25 a 50.';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Escribe cuánto salió.';
  end if;

  v_rinde := coalesce(v_pr.rinde, nullif(v_pr.contenido, 0), 1);
  v_esperado := round(v_rinde * p_lotes, 3);
  if p_cantidad > v_esperado * 3 then
    raise exception 'Salieron % y se esperaban %: revisa la cantidad.', p_cantidad, v_esperado;
  end if;
  if abs(p_cantidad - v_esperado) > 0.0005 and coalesce(length(v_nota), 0) < 3 then
    raise exception 'Salieron % y se esperaban %: escribe una nota de por qué.', p_cantidad, v_esperado;
  end if;

  select id into v_k from almacenes where tipo = 'kiosko' order by id limit 1;
  select id, nombre into v_emp, v_quien from empleados where auth_user_id = auth.uid() limit 1;

  -- ¿Alcanza? Lo que se necesita contra lo que hay en el kiosko.
  select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'unidad', i.unidad,
                                      'necesita', round(rc.cantidad * p_lotes, 3),
                                      'hay', coalesce(s.stock_actual, 0)) order by i.nombre)
    into v_faltan
    from recetas rc
    join insumos i on i.id = rc.insumo_id
    left join inventario_stock s on s.insumo_id = i.id and s.almacen_id = v_k
   where rc.producto_id = p_producto_id and rc.cantidad > 0 and i.id <> v_pr.insumo_id
     and coalesce(s.stock_actual, 0) < rc.cantidad * p_lotes;

  if v_faltan is not null and not coalesce(p_forzar, false) then
    return jsonb_build_object('ok', false, 'faltantes', v_faltan,
      'error', 'No alcanza lo que hay en el inventario del kiosko.');
  end if;
  if v_faltan is not null and coalesce(length(v_nota), 0) < 3 then
    raise exception 'Para registrar aunque falte inventario, escribe una nota.';
  end if;

  -- Sale lo de la receta.
  for r in
    select i.id, i.nombre, round(rc.cantidad * p_lotes, 3) necesita, coalesce(i.costo_unitario, 0) costo
      from recetas rc join insumos i on i.id = rc.insumo_id
     where rc.producto_id = p_producto_id and rc.cantidad > 0 and i.id <> v_pr.insumo_id
  loop
    select coalesce((select stock_actual from inventario_stock where almacen_id = v_k and insumo_id = r.id), 0)
      into v_antes;
    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, costo_unitario, referencia_id, nota,
       empleado_id, motivo, existencia_antes, existencia_despues)
    values (r.id, v_k, -r.necesita, 'produccion', r.costo, p_id,
            'Producción: ' || v_pr.salida || ' (' || trim_scale(p_cantidad) || ')' || coalesce(' · ' || v_quien, '')
              || coalesce(' · ' || v_nota, ''),
            v_emp, null, v_antes, v_antes - r.necesita);
    insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
    values (v_k, r.id, -r.necesita, 0)
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;
    v_costo := v_costo + r.necesita * r.costo;
  end loop;

  -- Entra lo producido.
  select coalesce((select stock_actual from inventario_stock where almacen_id = v_k and insumo_id = v_pr.insumo_id), 0)
    into v_antes;
  insert into inventario_movimientos
    (insumo_id, almacen_id, cantidad, tipo, costo_unitario, referencia_id, nota,
     empleado_id, motivo, existencia_antes, existencia_despues)
  values (v_pr.insumo_id, v_k, p_cantidad, 'produccion', round(v_costo / p_cantidad, 4), p_id,
          'Producción: ' || trim_scale(p_lotes) || ' lote(s) de ' || v_pr.receta || coalesce(' · ' || v_quien, '')
            || coalesce(' · ' || v_nota, ''),
          v_emp, null, v_antes, v_antes + p_cantidad);
  insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
  values (v_k, v_pr.insumo_id, p_cantidad, 0)
  on conflict (almacen_id, insumo_id)
  do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;

  insert into producciones (id, producto_id, insumo_id, almacen_id, lotes, esperado, cantidad,
                            nota, faltantes, costo_total, empleado_id)
  values (p_id, p_producto_id, v_pr.insumo_id, v_k, p_lotes, v_esperado, p_cantidad,
          v_nota, v_faltan, round(v_costo, 2), v_emp);

  return jsonb_build_object('ok', true, 'id', p_id, 'salida', v_pr.salida,
                            'cantidad', p_cantidad, 'lotes', p_lotes, 'esperado', v_esperado,
                            'costo_total', round(v_costo, 2),
                            'existencia', v_antes + p_cantidad, 'quien', v_quien);
end;
$$;

-- ── Admin ───────────────────────────────────────────────────────────────
-- Las ligas, y lo que se puede ligar: recetas de Costeos y sus ingredientes.
create or replace function public.fn_produccion_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede configurar la producción.';
  end if;
  return jsonb_build_object(
    'ligas', coalesce((select jsonb_agg(jsonb_build_object(
               'producto_id', pr.producto_id, 'receta', p.nombre, 'insumo_id', i.id, 'salida', i.nombre,
               'rinde', pr.rinde, 'contenido', i.contenido, 'activo', pr.activo) order by p.nombre)
             from produccion_recetas pr join productos p on p.id = pr.producto_id
             join insumos i on i.id = pr.insumo_id), '[]'::jsonb),
    -- Recetas de Costeo Alimentos y Shakes (por nombre, como las sincroniza
    -- fn_sync_app_data) que tienen receta escrita.
    'recetas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre) order by p.nombre)
             from productos p
            where not p.es_extra and not p.es_combo and p.archivado_en is null
              and exists (select 1 from recetas r where r.producto_id = p.id and r.cantidad > 0)
              and lower(p.nombre) in (
                select lower(trim(x->>'nombre')) from app_data a,
                       jsonb_array_elements((a.data->'foodRecipes')) x
                union
                select lower(trim(x->>'nombre')) from app_data a,
                       jsonb_array_elements((a.data->'shakeRecipes')) x)), '[]'::jsonb),
    'ingredientes', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre,
                     'contenido', i.contenido, 'unidad', i.unidad) order by i.nombre)
             from insumos i where i.activo and i.tipo in ('alimento', 'shake')), '[]'::jsonb),
    'recientes', coalesce((select jsonb_agg(x order by x.creado_en desc) from (
             select pc.creado_en, p.nombre receta, i.nombre salida, pc.lotes, pc.esperado, pc.cantidad,
                    pc.nota, pc.faltantes is not null forzada, pc.costo_total, e.nombre quien
               from producciones pc join productos p on p.id = pc.producto_id
               join insumos i on i.id = pc.insumo_id left join empleados e on e.id = pc.empleado_id
              order by pc.creado_en desc limit 50) x), '[]'::jsonb));
end;
$$;

create or replace function public.fn_produccion_ligar(p_producto_id uuid, p_insumo_id uuid, p_rinde numeric, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede configurar la producción.';
  end if;
  if p_rinde is not null and p_rinde <= 0 then
    raise exception 'El rendimiento tiene que ser mayor que 0.';
  end if;
  insert into produccion_recetas (producto_id, insumo_id, rinde, activo)
  values (p_producto_id, p_insumo_id, p_rinde, coalesce(p_activo, true))
  on conflict (producto_id) do update
    set insumo_id = excluded.insumo_id, rinde = excluded.rinde, activo = excluded.activo;
end;
$$;
