-- Grupos del descuento de personal con su propio limite diario (30/09).
--
-- Pedido de Perla: crear "Snacks" (muffins y galletas) aparte de "Alimentos",
-- que tiene limite de 1 al dia, y darle su propio limite. Hasta hoy los
-- grupos eran tres fijos (shake/alimento/bebida), escritos en un CHECK, en
-- tres columnas de personal_config y en tres `if` dentro de las funciones
-- que cotizan y cobran.
--
-- Ahora los grupos viven en `personal_grupos`, y la revision del limite es
-- UNA funcion que recorre los grupos (`fn_personal_exceso`), la misma para
-- cotizar y para cobrar — lo cotizado y lo cobrado siguen siendo el mismo
-- codigo. `fn_crear_orden` NO se toca.
--
-- Compatibilidad: las columnas usado_shake/max_shake… que ya devuelven
-- fn_personal_restante y fn_personal_identificar siguen igual (el kiosko no
-- cambia); solo leen el maximo de la tabla nueva. Los tres grupos de
-- siempre nacen con los limites que ya tenian: el dia del despliegue no
-- cambia ningun numero.

create table if not exists personal_grupos (
  slug       text primary key,
  nombre     text not null,
  max_diario int  not null check (max_diario between 0 and 10),
  orden      int  not null default 100,
  creado_en  timestamptz not null default now()
);
alter table personal_grupos enable row level security;
revoke all on personal_grupos from public, anon, authenticated;

insert into personal_grupos (slug, nombre, max_diario, orden)
select 'shake', 'Shakes o Clásicos', max_shake, 10 from personal_config where id = 'default'
union all
select 'alimento', 'Alimentos', max_alimento, 20 from personal_config where id = 'default'
union all
select 'bebida', 'Bebidas', max_bebida, 30 from personal_config where id = 'default'
on conflict (slug) do nothing;

-- El CHECK de tres valores se vuelve llave foranea: un grupo existe si esta
-- en la tabla.
alter table productos drop constraint if exists productos_grupo_personal_check;
alter table productos drop constraint if exists productos_grupo_personal_fkey;
alter table productos add constraint productos_grupo_personal_fkey
  foreign key (grupo_personal) references personal_grupos(slug) on update cascade;

-- El maximo de los tres de siempre ahora sale de la tabla.
create or replace function public.fn_personal_restante(p_empleado_id uuid)
returns table(usado_shake integer, usado_alimento integer, usado_bebida integer,
              usado_importe numeric, tope numeric,
              max_shake integer, max_alimento integer, max_bebida integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (select * from personal_config where id = 'default'),
  hoy as (
    select c.grupo, sum(c.cantidad)::int as piezas, sum(c.importe_personal) as importe
      from personal_consumos c
     where c.empleado_id = p_empleado_id
       and c.dia = (now() at time zone 'America/Merida')::date
     group by c.grupo
  )
  select coalesce((select piezas from hoy where grupo = 'shake'), 0),
         coalesce((select piezas from hoy where grupo = 'alimento'), 0),
         coalesce((select piezas from hoy where grupo = 'bebida'), 0),
         coalesce((select sum(importe) from hoy), 0),
         (select tope_diario from cfg),
         (select max_diario from personal_grupos where slug = 'shake'),
         (select max_diario from personal_grupos where slug = 'alimento'),
         (select max_diario from personal_grupos where slug = 'bebida');
$function$;

-- La regla del limite, para TODOS los grupos. Devuelve el primer grupo que
-- se pasa (texto listo para ensenar) o null si todo cabe. Mismas reglas de
-- conteo que fn_personal_calcular: los hijos (extras) no cuentan, y solo
-- cuenta lo que tiene precio de personal y grupo.
create or replace function public.fn_personal_exceso(p_empleado_id uuid, p_items jsonb)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pedido as (
    select pr.grupo_personal as g,
           sum(greatest(coalesce((i->>'cantidad')::int, 1), 1))::int as n
      from jsonb_array_elements(p_items) i
      join productos pr on pr.id = (i->>'producto_id')::uuid
     where coalesce(i->>'padre_linea', '') = ''
       and pr.precio_personal is not null
       and pr.grupo_personal is not null
     group by 1
  ),
  usado as (
    select c.grupo as g, sum(c.cantidad)::int as n
      from personal_consumos c
     where c.empleado_id = p_empleado_id
       and c.dia = (now() at time zone 'America/Merida')::date
     group by 1
  )
  select format('Solo %s al dia de %s. Hoy ya lleva %s.', g.max_diario, g.nombre, coalesce(u.n, 0))
    from pedido p
    join personal_grupos g on g.slug = p.g
    left join usado u on u.g = p.g
   where coalesce(u.n, 0) + p.n > g.max_diario
   order by g.orden, g.slug
   limit 1;
$function$;
revoke execute on function public.fn_personal_exceso(uuid, jsonb) from public, anon, authenticated;

-- Administrar los grupos (Admin -> Personal -> Descuentos -> Reglas).
create or replace function public.fn_personal_grupos()
returns table(slug text, nombre text, max_diario int, orden int, productos int, fijo boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select g.slug, g.nombre, g.max_diario, g.orden,
         (select count(*)::int from productos p where p.grupo_personal = g.slug and p.activo),
         g.slug in ('shake', 'alimento', 'bebida')
    from personal_grupos g
   where fn_es_jefe()
   order by g.orden, g.nombre;
$function$;

create or replace function public.fn_personal_grupo_guardar(p_slug text, p_nombre text, p_max int)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_nombre text := nullif(trim(p_nombre), ''); v_slug text;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las reglas del beneficio.';
  end if;
  if v_nombre is null then
    raise exception 'El grupo necesita nombre.';
  end if;
  if p_max is null or p_max not between 0 and 10 then
    raise exception 'El limite va de 0 a 10 al dia.';
  end if;

  if p_slug is null then
    v_slug := trim(both '_' from regexp_replace(lower(fn_sin_acentos(v_nombre)), '[^a-z0-9]+', '_', 'g'));
    if v_slug = '' then
      raise exception 'Ese nombre no sirve para un grupo.';
    end if;
    if exists (select 1 from personal_grupos where slug = v_slug or lower(nombre) = lower(v_nombre)) then
      raise exception 'Ya hay un grupo que se llama asi.';
    end if;
    insert into personal_grupos (slug, nombre, max_diario, orden)
    values (v_slug, v_nombre, p_max, coalesce((select max(orden) from personal_grupos), 0) + 10);
  else
    v_slug := p_slug;
    update personal_grupos set nombre = v_nombre, max_diario = p_max where slug = v_slug;
    if not found then
      raise exception 'Ese grupo ya no existe: recarga la pagina.';
    end if;
    -- Los tres de siempre tambien viven en personal_config (lo lee la
    -- pantalla vieja de reglas): se mantienen iguales.
    update personal_config set
      max_shake    = case when v_slug = 'shake'    then p_max else max_shake end,
      max_alimento = case when v_slug = 'alimento' then p_max else max_alimento end,
      max_bebida   = case when v_slug = 'bebida'   then p_max else max_bebida end,
      actualizado_en = now()
     where id = 'default' and v_slug in ('shake', 'alimento', 'bebida');
  end if;
  return v_slug;
end;
$function$;

create or replace function public.fn_personal_grupo_borrar(p_slug text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n int;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las reglas del beneficio.';
  end if;
  if p_slug in ('shake', 'alimento', 'bebida') then
    raise exception 'Shakes, Alimentos y Bebidas no se borran: pon su limite en 0 si no aplican.';
  end if;
  select count(*) into v_n from productos where grupo_personal = p_slug;
  if v_n > 0 then
    raise exception 'Ese grupo todavia lo usan % producto(s). Cambialos de grupo primero.', v_n;
  end if;
  delete from personal_grupos where slug = p_slug;
end;
$function$;

revoke execute on function public.fn_personal_grupos() from public, anon;
revoke execute on function public.fn_personal_grupo_guardar(text, text, int) from public, anon;
revoke execute on function public.fn_personal_grupo_borrar(text) from public, anon;
grant execute on function public.fn_personal_grupos() to authenticated;
grant execute on function public.fn_personal_grupo_guardar(text, text, int) to authenticated;
grant execute on function public.fn_personal_grupo_borrar(text) to authenticated;

-- Parches con ancla (cada ancla debe aparecer exactamente una vez).
do $$
declare
  v_def text; a int; b int;
  v_ini text; v_fin text;
begin
  -- 1. calcular: un grupo nuevo tambien suma al importe del tope.
  v_def := pg_get_functiondef('fn_personal_calcular(uuid, jsonb)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'else continue;', ''))) / length('else continue;') <> 1 then
    raise exception 'ancla de fn_personal_calcular';
  end if;
  execute replace(v_def, 'else continue;', 'elsif v_p.grupo_personal is null then continue;');

  -- 2. cobrar: los tres `if` por grupo -> una sola revision generica.
  v_def := pg_get_functiondef('fn_crear_orden_personal'::regproc);
  v_ini := 'if v_r.usado_shake + v_c.n_shake > v_r.max_shake then';
  v_fin := 'if v_r.usado_importe + v_c.importe > v_r.tope then';
  a := position(v_ini in v_def); b := position(v_fin in v_def);
  if a = 0 or b = 0 or b < a
     or (length(v_def) - length(replace(v_def, v_ini, ''))) / length(v_ini) <> 1 then
    raise exception 'anclas de fn_crear_orden_personal';
  end if;
  v_def := substr(v_def, 1, a - 1)
        || 'v_motivo := fn_personal_exceso(v_emp.id, p_items);
  if v_motivo is not null then
    raise exception ''%'', v_motivo;
  end if;
  '
        || substr(v_def, b);
  execute v_def;

  -- 3. cotizar: igual, dentro de su cadena de elsif.
  v_def := pg_get_functiondef('fn_personal_cotizar'::regproc);
  v_ini := 'elsif v_r.usado_shake + v_c.n_shake > v_r.max_shake then';
  v_fin := 'elsif v_r.usado_importe + v_c.importe > v_r.tope then';
  a := position(v_ini in v_def); b := position(v_fin in v_def);
  if a = 0 or b = 0 or b < a
     or (length(v_def) - length(replace(v_def, v_ini, ''))) / length(v_ini) <> 1 then
    raise exception 'anclas de fn_personal_cotizar';
  end if;
  v_def := substr(v_def, 1, a - 1)
        || 'elsif fn_personal_exceso(v_emp.id, p_items) is not null then
      v_motivo := fn_personal_exceso(v_emp.id, p_items);
    '
        || substr(v_def, b);
  execute v_def;

  -- 4. guardar precio (uno y por categoria): el grupo es el de la tabla.
  v_def := pg_get_functiondef('fn_personal_precio_guardar'::regproc);
  v_ini := 'if p_grupo is not null and p_grupo not in (''shake'', ''alimento'', ''bebida'') then
    raise exception ''El grupo va en shake, alimento o bebida.'';';
  if position(v_ini in v_def) = 0 then raise exception 'ancla de fn_personal_precio_guardar'; end if;
  execute replace(v_def, v_ini,
    'if p_grupo is not null and not exists (select 1 from personal_grupos where slug = p_grupo) then
    raise exception ''Ese grupo no existe. Crealo en Reglas.'';');

  v_def := pg_get_functiondef('fn_personal_precio_categoria'::regproc);
  v_ini := 'if p_grupo not in (''shake'', ''alimento'', ''bebida'') then';
  if position(v_ini in v_def) = 0 then raise exception 'ancla de fn_personal_precio_categoria'; end if;
  execute replace(v_def, v_ini,
    'if not exists (select 1 from personal_grupos where slug = p_grupo) then');

  -- 5. La pantalla de reglas de siempre tambien escribe en la tabla nueva.
  v_def := pg_get_functiondef('fn_personal_config_guardar'::regproc);
  v_ini := 'where id = ''default'';';
  if (length(v_def) - length(replace(v_def, v_ini, ''))) / length(v_ini) <> 1 then
    raise exception 'ancla de fn_personal_config_guardar';
  end if;
  execute replace(v_def, v_ini, 'where id = ''default'';
  update personal_grupos set max_diario = case slug
      when ''shake'' then p_max_shake when ''alimento'' then p_max_alimento else p_max_bebida end
   where slug in (''shake'', ''alimento'', ''bebida'');');
end $$;
