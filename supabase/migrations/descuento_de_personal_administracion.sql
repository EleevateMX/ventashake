-- Lo que gerencia toca: precios, claves, reglas e historial.

-- El catalogo con su precio de personal. Trae TODO lo vendible, tenga
-- beneficio o no: la pantalla que solo ensena lo que ya tiene precio no
-- deja poner el que falta, que es justo para lo que se abre.
create or replace function public.fn_personal_catalogo(p_texto text default null)
returns table(
  id uuid, nombre text, categoria text, precio numeric,
  precio_personal numeric, grupo_personal text, es_extra boolean
)
language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.nombre, c.nombre, p.precio, p.precio_personal, p.grupo_personal, p.es_extra
    from productos p
    left join categorias c on c.id = p.categoria_id
   where fn_es_jefe() and p.activo
     and (
       p_texto is null or btrim(p_texto) = ''
       or fn_sin_acentos(p.nombre) like '%' || fn_sin_acentos(btrim(p_texto)) || '%'
       or fn_sin_acentos(coalesce(c.nombre, '')) like '%' || fn_sin_acentos(btrim(p_texto)) || '%'
     )
   order by (p.precio_personal is null), c.nombre nulls last, p.nombre
   limit 500;
$function$;

create or replace function public.fn_personal_precio_guardar(
  p_producto_id uuid, p_precio_personal numeric, p_grupo text
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_precio numeric;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede tocar los precios de personal.';
  end if;
  select precio into v_precio from productos where id = p_producto_id;
  if v_precio is null then raise exception 'Ese producto no existe.'; end if;
  -- Un precio de personal MAYOR al publico no es un beneficio, es un error
  -- de dedo que le cobra de mas a quien se supone que se le cobra de menos.
  if p_precio_personal is not null and p_precio_personal > v_precio then
    raise exception 'El precio de personal no puede ser mayor al publico ($%).', v_precio;
  end if;
  if p_precio_personal is not null and p_precio_personal < 0 then
    raise exception 'Un precio negativo no es un descuento.';
  end if;
  if p_grupo is not null and p_grupo not in ('shake', 'alimento', 'bebida') then
    raise exception 'El grupo va en shake, alimento o bebida.';
  end if;
  update productos
     set precio_personal = p_precio_personal,
         grupo_personal = case when p_precio_personal is null then null else p_grupo end
   where id = p_producto_id;
end;
$function$;

-- La clave de cada quien. Se guarda con bcrypt: en la base queda la huella,
-- no el numero — igual que el PIN, y por la misma razon.
create or replace function public.fn_personal_clave_guardar(
  p_empleado_id uuid, p_clave text, p_activo boolean default null
) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede dar claves de personal.';
  end if;
  if p_clave is not null then
    if length(btrim(p_clave)) < 4 then
      raise exception 'La clave va de 4 digitos para arriba.';
    end if;
    -- Que dos personas compartan clave rompe lo unico que sostiene el
    -- "personal e intransferible": el historial diria que consumio quien no fue.
    if exists (
      select 1 from empleados e
       where e.id <> p_empleado_id and e.clave_personal_hash is not null
         and e.clave_personal_hash = crypt(btrim(p_clave), e.clave_personal_hash)
    ) then
      raise exception 'Esa clave ya es de alguien mas.';
    end if;
    update empleados set clave_personal_hash = crypt(btrim(p_clave), gen_salt('bf'))
     where id = p_empleado_id;
  end if;
  if p_activo is not null then
    update empleados set beneficio_personal = p_activo where id = p_empleado_id;
  end if;
end;
$function$;

-- Quien tiene beneficio y cuanto lleva hoy.
create or replace function public.fn_personal_quienes()
returns table(
  empleado_id uuid, nombre text, tiene_clave boolean, activo boolean,
  usado_shake int, usado_alimento int, usado_bebida int, usado_importe numeric
)
language sql stable security definer set search_path to 'public'
as $function$
  select e.id, e.nombre, e.clave_personal_hash is not null, e.beneficio_personal,
         r.usado_shake, r.usado_alimento, r.usado_bebida, r.usado_importe
    from empleados e
    cross join lateral fn_personal_restante(e.id) r
   where fn_es_jefe() and e.activo
   order by e.nombre;
$function$;

-- El historial de consumos, que fue pedido explicitamente.
create or replace function public.fn_personal_historial(
  p_desde date, p_hasta date, p_empleado_id uuid default null
)
returns table(
  id uuid, dia date, nombre text, grupo text, producto text,
  cantidad int, importe_personal numeric, precio_publico numeric,
  folio int, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  select c.id, c.dia, e.nombre, c.grupo, c.producto, c.cantidad,
         c.importe_personal, c.precio_publico, o.folio, c.created_at
    from personal_consumos c
    join empleados e on e.id = c.empleado_id
    left join ordenes o on o.id = c.orden_id
   where fn_es_jefe()
     and c.dia between p_desde and p_hasta
     and (p_empleado_id is null or c.empleado_id = p_empleado_id)
   order by c.created_at desc
   limit 1000;
$function$;

create or replace function public.fn_personal_config()
returns personal_config
language sql stable security definer set search_path to 'public'
as $function$
  select c.* from personal_config c where c.id = 'default' and fn_es_jefe();
$function$;

create or replace function public.fn_personal_config_guardar(
  p_tope numeric, p_max_shake int, p_max_alimento int, p_max_bebida int,
  p_exige_turno boolean, p_gracia_min int
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las reglas del beneficio.';
  end if;
  if p_tope not between 0 and 5000 then raise exception 'Ese tope no tiene sentido.'; end if;
  if p_max_shake not between 0 and 10 or p_max_alimento not between 0 and 10
     or p_max_bebida not between 0 and 10 then
    raise exception 'Los limites van de 0 a 10.';
  end if;
  if p_gracia_min not between 0 and 480 then raise exception 'La gracia va de 0 a 480 minutos.'; end if;
  update personal_config set
    tope_diario = p_tope, max_shake = p_max_shake, max_alimento = p_max_alimento,
    max_bebida = p_max_bebida, exige_turno = p_exige_turno, gracia_min = p_gracia_min,
    actualizado_en = now()
  where id = 'default';
end;
$function$;

-- Todas son de gerencia: a los DOS, anon y PUBLIC.
do $$
declare f text;
begin
  foreach f in array array[
    'fn_personal_catalogo(text)',
    'fn_personal_precio_guardar(uuid, numeric, text)',
    'fn_personal_clave_guardar(uuid, text, boolean)',
    'fn_personal_quienes()',
    'fn_personal_historial(date, date, uuid)',
    'fn_personal_config()',
    'fn_personal_config_guardar(numeric, int, int, int, boolean, int)'
  ] loop
    execute format('revoke execute on function public.%s from anon', f);
    execute format('revoke execute on function public.%s from public', f);
  end loop;
end $$;
