-- Un extra puede depender de que ya se haya elegido algo de un grupo.
--
-- El caso que lo pidio: las galletas son una promocion que solo aplica a
-- los preparados (los de $125). Colgadas de El Clasico sin mas, se
-- podrian poner a un shake de $69 y la promo se regalaria sola. Y al
-- reves -no ofrecerlas- deja sin ellas a quien si compro el preparado.
--
-- Vacio = siempre disponible, que es como nacieron todos los vinculos y
-- como se quedan los que nadie acote. Misma regla de respaldo que las
-- observaciones: un valor por omision no cambia nada el dia del
-- despliegue.
alter table producto_extras
  add column if not exists requiere_grupo text;

comment on column producto_extras.requiere_grupo is
  'Grupo que tiene que estar resuelto para que este extra aparezca. Null = siempre.';

-- OJO: `create or replace view` BORRA las reloptions. Sin volver a
-- declarar security_invoker la vista queda insegura en silencio.
create or replace view vw_producto_extras as
  select pe.producto_id,
         e.id as extra_id,
         e.nombre,
         coalesce(pe.precio, e.precio) as precio,
         e.activo,
         pe.grupo,
         e.marca,
         pe.por_defecto,
         pe.requiere_grupo
    from producto_extras pe
    join productos e on e.id = pe.extra_id;

alter view vw_producto_extras set (security_invoker = true);

-- El escritor. A diferencia de su hermana fn_extra_bebida_grupo -abierta a
-- anon desde que nacio- esta pide personal: nace hoy, solo la llama Admin,
-- y no hay instalador ni kiosko que la use. Es el mismo candado que
-- fn_observacion_alcance_fijar, que lleva semanas funcionando en Admin.
create or replace function public.fn_extra_bebida_requiere(
  p_extra_id uuid, p_producto_id uuid, p_requiere text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede acotar dónde aplica un extra.';
  end if;

  update producto_extras
  set requiere_grupo = nullif(trim(coalesce(p_requiere, '')), '')
  where producto_id = p_producto_id and extra_id = p_extra_id;
  if not found then
    raise exception 'Ese extra no se ofrece en ese producto todavía: márcalo primero.';
  end if;
end;
$function$;

-- `revoke all ... from public` NO le quita el permiso a anon: Supabase tiene
-- privilegios por omision que se lo dan como grant explicito al rol. Se
-- cierra a secas, y se comprueba mirando proacl.
revoke execute on function public.fn_extra_bebida_requiere(uuid, uuid, text) from anon;

-- Admin tiene que poder VER lo que acota, no solo escribirlo. Cambiar el
-- `returns table` obliga a drop + create: un create or replace con otra
-- firma no reemplaza, duplica.
drop function if exists public.fn_extra_bebida_productos(uuid);

create function public.fn_extra_bebida_productos(p_extra_id uuid)
returns table(producto_id uuid, nombre text, categoria text, ofrecido boolean,
              precio_propio numeric, precio_base numeric, grupo text,
              por_defecto boolean, requiere_grupo text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.id, p.nombre,
         coalesce(k.nombre || ' · ' || c.nombre, '—'),
         exists (select 1 from producto_extras pe
                  where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         (select pe.precio from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         (select e.precio from productos e where e.id = p_extra_id),
         (select pe.grupo from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         coalesce((select pe.por_defecto from producto_extras pe
                    where pe.producto_id = p.id and pe.extra_id = p_extra_id), false),
         (select pe.requiere_grupo from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id)
  from productos p
  join categorias c on c.id = p.categoria_id
  join cocinas k on k.id = c.cocina_id
  where p.activo and not p.es_extra
  order by k.slug, c.orden, p.nombre
$function$;
