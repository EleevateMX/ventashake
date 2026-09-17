-- Observaciones que aplican solo donde tienen sentido.
--
-- Hasta hoy los chips ("Sin hielo", "Cambio a cesar") eran por ESTACION:
-- los 15 de bebidas salian igual en un cafe que en un shake, y los 15 de
-- alimentos en cualquier cosa que fuera a cocina. Con 15 por lado ya es
-- una lista que hay que leer, y crece cada vez que alguien agrega uno.
--
-- El alcance se puede fijar por CATEGORIA o por PRODUCTO, y no es un
-- capricho: "Sin platano" aplica a los ~250 shakes (una categoria, un
-- clic) y "Cambio a cesar" a cuatro ensaladas (cuatro productos). Ofrecer
-- solo producto obligaria a marcar 250 casillas, que es como se garantiza
-- que nadie lo use.
--
-- REGLA DE RESPALDO, y es la que hace que esto se pueda desplegar con la
-- tienda abierta: una observacion SIN alcance sigue saliendo en toda su
-- estacion, exactamente como hoy. Nada cambia el dia del despliegue; se
-- va acotando una por una, y la que nadie toque se queda como estaba.

create table if not exists public.observacion_alcance (
  observacion_id uuid not null references public.observaciones(id) on delete cascade,
  categoria_id   uuid references public.categorias(id) on delete cascade,
  producto_id    uuid references public.productos(id)  on delete cascade,
  -- Exactamente uno de los dos. Una fila con los dos, o con ninguno, no
  -- significa nada y seria una fila que el lector tendria que adivinar.
  constraint alcance_es_uno check (num_nonnulls(categoria_id, producto_id) = 1)
);

create unique index if not exists uq_alcance_categoria
  on public.observacion_alcance (observacion_id, categoria_id)
  where categoria_id is not null;
create unique index if not exists uq_alcance_producto
  on public.observacion_alcance (observacion_id, producto_id)
  where producto_id is not null;

alter table public.observacion_alcance enable row level security;

-- Lectura abierta como `observaciones` (el kiosko las pinta sin sesion);
-- toda escritura pasa por la funcion de abajo, que si pide personal.
drop policy if exists sel_observacion_alcance on public.observacion_alcance;
create policy sel_observacion_alcance on public.observacion_alcance for select using (true);

grant select on public.observacion_alcance to anon, authenticated;

/**
 * Lo que el kiosko necesita de una sola vez: las observaciones activas con
 * su alcance. Son ~30 filas, asi que viajan enteras y la pantalla resuelve
 * cual va en cual producto sin volver a preguntar.
 */
create or replace function public.fn_observaciones_vigentes()
returns table (
  id uuid, texto text, orden integer, cocina_slug text,
  categorias uuid[], productos uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.texto, o.orden, k.slug,
         coalesce((select array_agg(a.categoria_id)
                     from observacion_alcance a
                    where a.observacion_id = o.id and a.categoria_id is not null),
                  '{}'::uuid[]),
         coalesce((select array_agg(a.producto_id)
                     from observacion_alcance a
                    where a.observacion_id = o.id and a.producto_id is not null),
                  '{}'::uuid[])
  from observaciones o
  join cocinas k on k.id = o.cocina_id
  where o.activa
  order by o.orden, o.texto
$$;

/**
 * Para Admin: en que categorias y productos aplica UNA observacion, con
 * todo lo disponible marcado o sin marcar — la misma forma de checklist
 * que ya usa "donde se ofrece" de los extras.
 */
create or replace function public.fn_observacion_alcance(p_observacion_id uuid)
returns table (
  tipo text, id uuid, nombre text, contexto text, marcado boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select 'categoria', c.id, c.nombre, k.nombre,
         exists (select 1 from observacion_alcance a
                  where a.observacion_id = p_observacion_id and a.categoria_id = c.id)
  from categorias c
  join cocinas k on k.id = c.cocina_id
  where c.activa
  union all
  select 'producto', p.id, p.nombre, k.nombre || ' · ' || c.nombre,
         exists (select 1 from observacion_alcance a
                  where a.observacion_id = p_observacion_id and a.producto_id = p.id)
  from productos p
  join categorias c on c.id = p.categoria_id
  join cocinas k on k.id = c.cocina_id
  where p.activo and not p.es_extra
  order by 1, 4, 3
$$;

/** Prende o apaga UNA casilla del alcance. Solo el personal. */
create or replace function public.fn_observacion_alcance_fijar(
  p_observacion_id uuid,
  p_tipo text,
  p_id uuid,
  p_incluir boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cambiar las observaciones.';
  end if;
  if p_tipo not in ('categoria', 'producto') then
    raise exception 'El alcance es por categoria o por producto.';
  end if;
  if not exists (select 1 from observaciones where id = p_observacion_id) then
    raise exception 'Esa observacion no existe.';
  end if;

  if p_incluir then
    insert into observacion_alcance (observacion_id, categoria_id, producto_id)
    values (
      p_observacion_id,
      case when p_tipo = 'categoria' then p_id end,
      case when p_tipo = 'producto'  then p_id end
    )
    on conflict do nothing;
  else
    delete from observacion_alcance
     where observacion_id = p_observacion_id
       and ((p_tipo = 'categoria' and categoria_id = p_id)
         or (p_tipo = 'producto'  and producto_id  = p_id));
  end if;
end;
$$;

revoke all on function public.fn_observaciones_vigentes() from public;
revoke all on function public.fn_observacion_alcance(uuid) from public;
revoke all on function public.fn_observacion_alcance_fijar(uuid, text, uuid, boolean) from public;

-- El kiosko lee sin sesion; escribir exige personal, comprobado adentro.
grant execute on function public.fn_observaciones_vigentes() to anon, authenticated, service_role;
grant execute on function public.fn_observacion_alcance(uuid) to authenticated, service_role;
grant execute on function public.fn_observacion_alcance_fijar(uuid, text, uuid, boolean) to authenticated, service_role;
