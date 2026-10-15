-- Cortesías en el kiosko, con PIN, solo para quien se le dé a mano (15/10/26).
--
-- Lo pidió Perla: «aplicar cortesías en el kiosko (con clave), únicamente
-- para Adrián y para mí, y que se descuenten del inventario».
--
-- Cómo, y por qué así:
--
-- * `fn_crear_orden` y `fn_cobrar_orden` NO se tocan (camino del dinero).
--   `fn_cortesia_crear` las ENVUELVE, como `fn_crear_orden_personal`: crea
--   la orden normal, la deja en $0 con todo su valor como descuento y la
--   cobra con el método `cortesia` (ya existía en el enum) por $0. Al
--   quedar pagada pasa lo de siempre: comanda a barra/cocina, etiqueta y
--   DESCUENTO DE INVENTARIO por el trigger de siempre. Sin cliente ligado,
--   no suma mancuernas ni sellos.
-- * Quién puede vive en `cortesia_autorizados`, persona por persona, y NO lo
--   trae ningún rol, ni gerencia: «gerencia puede todo» habría abierto la
--   cortesía a cualquier admin futuro, y el pedido fue con nombre. No es un
--   permiso más de `empleado_permisos` porque su check fija los cuatro de
--   caja, y cambiarlo pedía quitar el check con la tienda abierta.
-- * El conector de Supabase pide confirmación para `drop`/`revoke` y se
--   corta al minuto si nadie aprueba: por eso aquí no hay ninguno. Las
--   tablas nuevas quedan cerradas por RLS (solo una política de lectura
--   para gerencia), y las funciones de gerencia validan `fn_es_jefe()`.
-- * La cortesía queda en `cortesias` con quién la autorizó, quién estaba en
--   caja, el motivo y cuánto valía. Una cortesía sin rastro es una fuga.
-- * Se autoriza con el PIN de quien tiene el permiso, con el mismo freno de
--   intentos que el resto de los PIN (15 en 15 min).

set lock_timeout = '3s';

-- ── El registro ──────────────────────────────────────────────────────────
create table if not exists public.cortesias (
  id          uuid primary key default gen_random_uuid(),
  -- Sin llave foránea a `ordenes` a propósito: crearla pide un candado
  -- sobre `ordenes` que, si espera, frena las órdenes nuevas en plena venta
  -- (y no hace falta: la única que escribe aquí es fn_cortesia_crear).
  orden_id    uuid not null unique,
  autorizo_id uuid not null references public.empleados(id),
  cajero_id   uuid references public.empleados(id),
  motivo      text not null check (length(trim(motivo)) >= 3),
  valor       numeric(12,2) not null check (valor >= 0),
  creado_en   timestamptz not null default now()
);
comment on table public.cortesias is
  'Cada cortesía del kiosko: quién la autorizó con su PIN, quién estaba en caja, por qué y cuánto valía a precio de lista.';
alter table public.cortesias enable row level security;
create policy cortesias_gerencia on public.cortesias for select using (fn_es_jefe());

create table if not exists public.cortesia_autorizados (
  empleado_id uuid primary key references public.empleados(id),
  dado_por    uuid references public.empleados(id),
  dado_en     timestamptz not null default now()
);
alter table public.cortesia_autorizados enable row level security;
create policy cortesia_autorizados_gerencia on public.cortesia_autorizados for select using (fn_es_jefe());

-- ── Dar la cortesía ──────────────────────────────────────────────────────
create or replace function public.fn_cortesia_crear(
  p_pin text,
  p_motivo text,
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_items jsonb,
  p_corte_id uuid default null,
  p_empleado_id uuid default null,
  p_nombre_cliente text default null,
  p_para_llevar boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '15s'
as $$
declare
  v_aut uuid;
  v_aut_nombre text;
  v_orden ordenes;
  v_valor numeric;
  v_motivo text := trim(coalesce(p_motivo, ''));
begin
  if length(v_motivo) < 3 then
    raise exception 'Escribe el motivo de la cortesía.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La cortesía no tiene productos.';
  end if;

  if fn_pin_fallos_recientes('cortesia') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;
  select e.id, e.nombre into v_aut, v_aut_nombre
    from empleados e
    join cortesia_autorizados ca on ca.empleado_id = e.id
   where e.activo and e.pin_hash is not null
     and e.pin_hash = crypt(coalesce(p_pin, ''), e.pin_hash)
   limit 1;
  perform fn_pin_registrar_intento('cortesia', v_aut is not null);
  if v_aut is null then
    raise exception 'Ese PIN no puede dar cortesías.';
  end if;

  -- La orden de siempre, con los precios de siempre (los pone el servidor).
  v_orden := fn_crear_orden(p_sucursal_id, p_almacen_id, 'pos'::canal_orden, p_items,
                            p_corte_id, p_empleado_id, null, 0, false,
                            p_nombre_cliente, p_para_llevar);
  v_valor := v_orden.descuento + v_orden.total;  -- lo que valía antes de promos

  -- Todo su valor pasa a descuento: se cobra $0 por cortesía.
  update ordenes set descuento = v_valor, total = 0 where id = v_orden.id;

  insert into cortesias (orden_id, autorizo_id, cajero_id, motivo, valor)
  values (v_orden.id, v_aut, p_empleado_id, v_motivo, v_valor);

  perform fn_cobrar_orden(v_orden.id, 'cortesia'::metodo_pago, 0,
                          left('Cortesía · ' || v_aut_nombre || ' · ' || v_motivo, 200),
                          v_aut, gen_random_uuid());

  return jsonb_build_object('id', v_orden.id, 'folio', v_orden.folio,
                            'valor', v_valor, 'autorizo', v_aut_nombre);
end;
$$;

-- El kiosko en modo cajero corre como anon (sección 2.2 de CLAUDE.md): el
-- PIN ES la credencial, igual que fn_autorizar_con_pin.
grant execute on function public.fn_cortesia_crear(text,text,uuid,uuid,jsonb,uuid,uuid,text,boolean) to anon, authenticated;

-- ── Verlas: solo gerencia ────────────────────────────────────────────────
create or replace function public.fn_cortesias(p_desde date, p_hasta date)
returns table (creado_en timestamptz, folio int, autorizo text, cajero text,
               motivo text, valor numeric, productos text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver las cortesías.';
  end if;
  return query
    select c.creado_en, o.folio::int, a.nombre, cj.nombre, c.motivo, c.valor,
           (select string_agg(oi.cantidad || '× ' || p.nombre, ', ' order by oi.id)
              from orden_items oi join productos p on p.id = oi.producto_id
             where oi.orden_id = o.id and oi.padre_item_id is null)
      from cortesias c
      join ordenes o on o.id = c.orden_id
      join empleados a on a.id = c.autorizo_id
      left join empleados cj on cj.id = c.cajero_id
     where (c.creado_en at time zone 'America/Merida')::date between p_desde and p_hasta
     order by c.creado_en desc;
end;
$$;

-- ── Admin → Personal → Permisos: ver y cambiar quién puede ──────────────
create or replace function public.fn_cortesia_autorizados()
returns table (empleado_id uuid, nombre text, rol text, puede boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nombre, r.slug, ca.empleado_id is not null
    from empleados e
    join roles r on r.id = e.rol_id
    left join cortesia_autorizados ca on ca.empleado_id = e.id
   where fn_es_jefe() and e.activo
   order by ca.empleado_id is null, e.nombre
$$;

create or replace function public.fn_cortesia_autorizar(p_empleado_id uuid, p_puede boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede decidir quién da cortesías.';
  end if;
  if coalesce(p_puede, false) then
    insert into cortesia_autorizados (empleado_id, dado_por)
    values (p_empleado_id, fn_empleado_actual())
    on conflict (empleado_id) do nothing;
  else
    delete from cortesia_autorizados where empleado_id = p_empleado_id;
  end if;
end;
$$;

-- ── Quién puede: Perla y Adrián (en el sistema, «Luna») ──────────────────
insert into public.cortesia_autorizados (empleado_id)
select e.id from public.empleados e
 where e.activo and e.nombre in ('Perla', 'Luna')
on conflict (empleado_id) do nothing;
