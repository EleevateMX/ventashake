-- Cupones de descuento con PIN (24/10/26, pedido de Perla para «Trick or
-- Treat»: $20, 10 % y 15 % de descuento en un shake).
--
-- Cómo, y por qué así:
--
-- * `fn_crear_orden` y `fn_cobrar_orden` NO se tocan. El cupón entra igual
--   que los canjes de Rewards: se crea la orden normal, se le APLICA el
--   cupón (baja `ordenes.total`, sube `ordenes.descuento`) y luego se cobra
--   con cualquier método — efectivo, terminal, mixto o la del banco. El
--   precio del shake no se modifica: el renglón se queda a precio de lista
--   y el descuento queda aparte, con su nombre.
-- * Dos pasos. Al elegir el cupón, el PIN se revisa YA
--   (`fn_cupon_autorizar`) y deja una autorización que vive 20 minutos y se
--   usa una vez. Al cobrar, la orden la consume (`fn_cupon_aplicar`). Así un
--   PIN equivocado se sabe antes de crear la orden, y no quedan órdenes
--   colgadas por un PIN mal tecleado.
-- * Quién autoriza: la MISMA lista que las cortesías (`cortesia_autorizados`,
--   hoy Perla y Adrián). Mismo freno de PIN: 15 fallos en 15 minutos.
-- * El descuento lo calcula el servidor sobre lo que vale ESE shake (su
--   precio más sus extras, por unidad). $20 nunca pasa de lo que vale el
--   shake; un porcentaje se redondea a centavos. La pantalla enseña la misma
--   cuenta (`descuentoDeCupon` en @shake/utils) para que el cajero pida el
--   número correcto antes de tomar el dinero.
-- * Un cupón por orden, y no con precio de personal.
-- * Sin `drop`/`revoke` (el conector los frena): las tablas quedan cerradas
--   por RLS con una política de lectura para gerencia.

set lock_timeout = '3s';

-- ── Los cupones que existen ─────────────────────────────────────────────
create table if not exists public.cupones_tipos (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null check (length(trim(nombre)) >= 3),
  tipo      text not null check (tipo in ('monto', 'porcentaje')),
  valor     numeric(10,2) not null check (valor > 0),
  -- A qué familia de categorías aplica («Shakes» cubre «Shakes - …»).
  familia   text not null default 'Shakes',
  activo    boolean not null default true,
  orden     int not null default 0,
  creado_en timestamptz not null default now(),
  check (tipo <> 'porcentaje' or valor <= 100)
);
alter table public.cupones_tipos enable row level security;
create policy cupones_tipos_gerencia on public.cupones_tipos for select using (fn_es_jefe());

insert into public.cupones_tipos (nombre, tipo, valor, familia, orden)
select x.nombre, x.tipo, x.valor, 'Shakes', x.orden
  from (values ('$20 en un shake', 'monto', 20, 1),
               ('10 % en un shake', 'porcentaje', 10, 2),
               ('15 % en un shake', 'porcentaje', 15, 3)) x(nombre, tipo, valor, orden)
 where not exists (select 1 from public.cupones_tipos);

-- ── La autorización del PIN (vive 20 min, se usa una vez) ───────────────
create table if not exists public.cupones_autorizaciones (
  id          uuid primary key default gen_random_uuid(),
  cupon_id    uuid not null references public.cupones_tipos(id),
  producto_id uuid not null,
  autorizo_id uuid not null references public.empleados(id),
  creado_en   timestamptz not null default now(),
  vence_en    timestamptz not null default now() + interval '20 minutes',
  usado_en    timestamptz,
  orden_id    uuid
);
alter table public.cupones_autorizaciones enable row level security;
create policy cupones_autorizaciones_gerencia on public.cupones_autorizaciones for select using (fn_es_jefe());

-- ── Lo que se aplicó: cuánto valía, cuánto se descontó, quién autorizó ──
create table if not exists public.cupones_aplicados (
  id            uuid primary key default gen_random_uuid(),
  -- Sin llave foránea a `ordenes` a propósito (como `cortesias`): crearla
  -- pide un candado sobre `ordenes` en plena venta.
  orden_id      uuid not null unique,
  cupon_id      uuid not null references public.cupones_tipos(id),
  nombre        text not null,
  tipo          text not null,
  valor         numeric(10,2) not null,
  orden_item_id uuid not null,
  producto_id   uuid not null,
  base          numeric(10,2) not null,
  descuento     numeric(10,2) not null check (descuento >= 0),
  autorizo_id   uuid not null references public.empleados(id),
  cajero_id     uuid references public.empleados(id),
  creado_en     timestamptz not null default now()
);
comment on table public.cupones_aplicados is
  'Cada cupón aplicado en el kiosko: qué cupón, a qué shake, cuánto valía, cuánto se descontó y quién lo autorizó con su PIN.';
alter table public.cupones_aplicados enable row level security;
create policy cupones_aplicados_gerencia on public.cupones_aplicados for select using (fn_es_jefe());

-- La cuenta, en un solo lugar (su espejo es `descuentoDeCupon` en @shake/utils).
create or replace function public.fn_cupon_descuento(p_tipo text, p_valor numeric, p_base numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_base, 0) <= 0 then 0
    when p_tipo = 'monto' then least(p_valor, p_base)
    else least(p_base, round(p_base * p_valor / 100.0, 2))
  end
$$;

-- ¿Este producto entra en la familia del cupón? («Shakes» y «Shakes - …»)
create or replace function public.fn_cupon_aplica(p_familia text, p_producto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from productos p join categorias c on c.id = p.categoria_id
     where p.id = p_producto_id and not p.es_extra
       and (c.nombre = p_familia or split_part(c.nombre, ' - ', 1) = p_familia))
$$;

-- ── El kiosko: qué cupones hay y a qué productos aplican ────────────────
create or replace function public.fn_cupones_vigentes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'nombre', t.nombre, 'tipo', t.tipo, 'valor', t.valor, 'familia', t.familia,
           'productos', coalesce((select jsonb_agg(p.id)
                                    from productos p join categorias c on c.id = p.categoria_id
                                   where p.activo and not p.es_extra
                                     and (c.nombre = t.familia or split_part(c.nombre, ' - ', 1) = t.familia)), '[]'::jsonb))
         order by t.orden, t.nombre), '[]'::jsonb)
    from cupones_tipos t
   where t.activo
$$;

-- ── Paso 1: el PIN ──────────────────────────────────────────────────────
create or replace function public.fn_cupon_autorizar(p_pin text, p_cupon_id uuid, p_producto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_t cupones_tipos;
  v_aut uuid;
  v_aut_nombre text;
  v_id uuid;
begin
  select * into v_t from cupones_tipos where id = p_cupon_id and activo;
  if v_t.id is null then raise exception 'Ese cupón ya no está vigente.'; end if;
  if not fn_cupon_aplica(v_t.familia, p_producto_id) then
    raise exception 'Ese cupón solo aplica a %.', lower(v_t.familia);
  end if;

  if fn_pin_fallos_recientes('cupon') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;
  select e.id, e.nombre into v_aut, v_aut_nombre
    from empleados e
    join cortesia_autorizados ca on ca.empleado_id = e.id
   where e.activo and e.pin_hash is not null
     and e.pin_hash = crypt(coalesce(p_pin, ''), e.pin_hash)
   limit 1;
  perform fn_pin_registrar_intento('cupon', v_aut is not null);
  -- Se CONTESTA, no se lanza: un `raise` desharía el intento recién
  -- anotado y el freno de 15 fallos nunca contaría nada.
  if v_aut is null then
    return jsonb_build_object('ok', false, 'error', 'Ese PIN no puede autorizar cupones.');
  end if;

  insert into cupones_autorizaciones (cupon_id, producto_id, autorizo_id)
  values (v_t.id, p_producto_id, v_aut)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'autorizacion_id', v_id, 'autorizo', v_aut_nombre,
                            'cupon_id', v_t.id, 'nombre', v_t.nombre,
                            'tipo', v_t.tipo, 'valor', v_t.valor);
end;
$$;

-- ── Paso 2: aplicarlo a la orden, antes de cobrar ───────────────────────
create or replace function public.fn_cupon_aplicar(p_orden_id uuid, p_autorizacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a cupones_autorizaciones;
  v_t cupones_tipos;
  v_o ordenes;
  v_item orden_items;
  v_base numeric;
  v_desc numeric;
  v_prev cupones_aplicados;
begin
  select * into v_a from cupones_autorizaciones where id = p_autorizacion_id for update;
  if v_a.id is null then raise exception 'El cupón no está autorizado.'; end if;

  -- Reintento de la misma orden: devuelve lo que ya se aplicó.
  if v_a.usado_en is not null then
    if v_a.orden_id = p_orden_id then
      select * into v_prev from cupones_aplicados where orden_id = p_orden_id;
      select * into v_o from ordenes where id = p_orden_id;
      return jsonb_build_object('descuento', v_prev.descuento, 'base', v_prev.base,
        'nombre', v_prev.nombre, 'total_a_pagar', v_o.total, 'repetido', true);
    end if;
    -- Si la venta anterior NO se cobró (el cobro falló y el cajero volvió a
    -- intentar, lo que crea otra orden), el cupón pasa a la nueva. Si se
    -- cobró, ya se usó.
    if exists (select 1 from ordenes where id = v_a.orden_id and pagado) then
      raise exception 'Ese cupón ya se usó en otra venta.';
    end if;
  end if;
  if v_a.vence_en < now() then
    raise exception 'La autorización del cupón venció. Vuelve a pedir el PIN.';
  end if;

  select * into v_o from ordenes where id = p_orden_id for update;
  if v_o.id is null then raise exception 'La orden no existe.'; end if;
  if v_o.pagado then raise exception 'Esa orden ya está pagada.'; end if;
  if exists (select 1 from cupones_aplicados where orden_id = p_orden_id) then
    raise exception 'Esta venta ya tiene un cupón.';
  end if;
  if exists (select 1 from personal_consumos where orden_id = p_orden_id) then
    raise exception 'El cupón no se junta con el precio de personal.';
  end if;

  select * into v_t from cupones_tipos where id = v_a.cupon_id;

  -- El shake de la orden: el renglón base de ese producto que más vale.
  select * into v_item from orden_items
   where orden_id = p_orden_id and producto_id = v_a.producto_id
     and padre_item_id is null and precio_unitario > 0
   order by precio_unitario desc limit 1;
  if v_item.id is null then
    raise exception 'El producto del cupón no está en la venta.';
  end if;

  -- Lo que vale UNA unidad de ese shake: su precio más sus extras.
  v_base := v_item.precio_unitario + coalesce((
              select sum(h.precio_unitario * h.cantidad) from orden_items h
               where h.padre_item_id = v_item.id), 0) / greatest(v_item.cantidad, 1);
  v_desc := least(fn_cupon_descuento(v_t.tipo, v_t.valor, v_base), v_o.total);

  update ordenes
     set descuento = coalesce(descuento, 0) + v_desc,
         total = greatest(0, total - v_desc)
   where id = p_orden_id
  returning * into v_o;

  insert into cupones_aplicados (orden_id, cupon_id, nombre, tipo, valor, orden_item_id,
                                 producto_id, base, descuento, autorizo_id, cajero_id)
  values (p_orden_id, v_t.id, v_t.nombre, v_t.tipo, v_t.valor, v_item.id,
          v_item.producto_id, round(v_base, 2), v_desc, v_a.autorizo_id, v_o.empleado_id);

  update cupones_autorizaciones set usado_en = now(), orden_id = p_orden_id where id = v_a.id;

  return jsonb_build_object('descuento', v_desc, 'base', round(v_base, 2),
                            'nombre', v_t.nombre, 'total_a_pagar', v_o.total);
end;
$$;

-- El kiosko en modo cajero corre como anon: el PIN (paso 1) y la
-- autorización que deja (paso 2) son la credencial.
grant execute on function public.fn_cupones_vigentes() to anon, authenticated;
grant execute on function public.fn_cupon_autorizar(text, uuid, uuid) to anon, authenticated;
grant execute on function public.fn_cupon_aplicar(uuid, uuid) to anon, authenticated;

-- ── Admin: los que se aplicaron, y los cupones que existen ──────────────
create or replace function public.fn_cupones_aplicados(p_desde date, p_hasta date)
returns table (creado_en timestamptz, folio int, cupon text, producto text, base numeric,
               descuento numeric, pago numeric, autorizo text, cajero text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver los cupones.';
  end if;
  return query
    select c.creado_en, o.folio::int, c.nombre, p.nombre, c.base, c.descuento, o.total,
           a.nombre, cj.nombre
      from cupones_aplicados c
      join ordenes o on o.id = c.orden_id
      join productos p on p.id = c.producto_id
      join empleados a on a.id = c.autorizo_id
      left join empleados cj on cj.id = c.cajero_id
     where o.pagado
       and (c.creado_en at time zone 'America/Merida')::date between p_desde and p_hasta
     order by c.creado_en desc;
end;
$$;

create or replace function public.fn_cupones_tipos_admin()
returns setof cupones_tipos
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver los cupones.';
  end if;
  return query select * from cupones_tipos order by orden, nombre;
end;
$$;

-- Crear o cambiar un cupón. `p` = {id?, nombre, tipo, valor, familia?, activo?}
create or replace function public.fn_cupon_tipo_guardar(p jsonb)
returns cupones_tipos
language plpgsql
security definer
set search_path = public
as $$
declare v cupones_tipos;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar los cupones.';
  end if;
  if nullif(p->>'id', '') is null then
    insert into cupones_tipos (nombre, tipo, valor, familia, activo, orden)
    values (trim(p->>'nombre'), p->>'tipo', (p->>'valor')::numeric,
            coalesce(nullif(trim(p->>'familia'), ''), 'Shakes'),
            coalesce((p->>'activo')::boolean, true),
            coalesce((select max(orden) + 1 from cupones_tipos), 1))
    returning * into v;
  else
    update cupones_tipos set
      nombre  = coalesce(nullif(trim(p->>'nombre'), ''), nombre),
      tipo    = coalesce(nullif(p->>'tipo', ''), tipo),
      valor   = coalesce(nullif(p->>'valor', '')::numeric, valor),
      familia = coalesce(nullif(trim(p->>'familia'), ''), familia),
      activo  = coalesce((p->>'activo')::boolean, activo)
     where id = (p->>'id')::uuid
    returning * into v;
  end if;
  return v;
end;
$$;
