-- Permisos por usuario y candado para el corte (26/09).
--
-- Pedido de gerencia: cada quien entra con su usuario y trabaja normal,
-- pero las funciones sensibles -- sobre todo el corte de caja -- solo las
-- hace quien tenga permiso. Si un cajero sin permiso intenta el corte, se
-- pide el PIN de alguien que si lo tenga, en vez de dejarlo pasar.
--
-- Hasta hoy la base solo preguntaba "es del personal": cualquier cajero
-- podia cerrar el corte con un UPDATE directo a caja_cortes.
--
-- Solo entran al catalogo las acciones que EXISTEN en la caja. Devoluciones,
-- cambiar precios y editar una orden ya cobrada no existen en el kiosko ni en
-- el POS -- nadie puede hacerlas ahi --, y cancelar una venta vive en Admin,
-- que ya es solo de gerencia. Un permiso que no controla nada es una casilla
-- que miente.
--
-- Gerencia (admin, administrador, gerente, desarrollo) puede todo siempre:
-- no se le puede quitar desde la pantalla, o gerencia se dejaria fuera sola.

create table if not exists empleado_permisos (
  empleado_id    uuid not null references empleados(id) on delete cascade,
  permiso        text not null check (permiso in ('cobrar', 'abrir_caja', 'cerrar_caja', 'descuento_manual')),
  permitido      boolean not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references empleados(id),
  primary key (empleado_id, permiso)
);
alter table empleado_permisos enable row level security;
revoke all on empleado_permisos from public, anon, authenticated;

alter table caja_cortes add column if not exists cierre_autorizado_por uuid references empleados(id);
comment on column caja_cortes.cierre_autorizado_por is
  'Quien autorizo el corte. Igual a empleado_cierre_id si esa persona tenia permiso; si no, el que puso su PIN.';

-- Lo que trae cada rol si nadie decidio otra cosa.
create or replace function public.fn_permiso_por_rol(p_rol text, p_permiso text)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p_rol in ('admin', 'administrador', 'gerente', 'desarrollo') then true
    when p_rol = 'cajero' then p_permiso in ('cobrar', 'abrir_caja')
    else false
  end
$function$;

create or replace function public.fn_tiene_permiso(p_empleado_id uuid, p_permiso text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select case
             when r.slug in ('admin', 'administrador', 'gerente', 'desarrollo') then true
             else coalesce(ep.permitido, fn_permiso_por_rol(r.slug, p_permiso))
           end
      from empleados e
      join roles r on r.id = e.rol_id
      left join empleado_permisos ep on ep.empleado_id = e.id and ep.permiso = p_permiso
     where e.id = p_empleado_id and e.activo
  ), false)
$function$;

-- Lo que puede quien tiene la sesion abierta. Lo leen el kiosko y el POS
-- para ensenar el boton correcto; el servidor lo vuelve a revisar al hacer.
create or replace function public.fn_mis_permisos()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'cobrar',           fn_tiene_permiso(fn_empleado_actual(), 'cobrar'),
    'abrir_caja',       fn_tiene_permiso(fn_empleado_actual(), 'abrir_caja'),
    'cerrar_caja',      fn_tiene_permiso(fn_empleado_actual(), 'cerrar_caja'),
    'descuento_manual', fn_tiene_permiso(fn_empleado_actual(), 'descuento_manual'))
$function$;

-- Admin: la matriz. Por persona y permiso: lo que vale, lo que traeria su
-- rol y si alguien lo decidio a mano.
create or replace function public.fn_permisos_personal()
 returns table(empleado_id uuid, nombre text, rol text, es_gerencia boolean,
               permiso text, permitido boolean, por_rol boolean, a_mano boolean)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select e.id, e.nombre, r.slug,
         r.slug in ('admin', 'administrador', 'gerente', 'desarrollo'),
         k.permiso,
         fn_tiene_permiso(e.id, k.permiso),
         fn_permiso_por_rol(r.slug, k.permiso),
         ep.permitido is not null
    from empleados e
    join roles r on r.id = e.rol_id
    cross join (values ('cobrar'), ('abrir_caja'), ('cerrar_caja'), ('descuento_manual')) k(permiso)
    left join empleado_permisos ep on ep.empleado_id = e.id and ep.permiso = k.permiso
   where fn_es_jefe() and e.activo
   order by (r.slug in ('admin', 'administrador', 'gerente', 'desarrollo')), e.nombre, k.permiso
$function$;

-- null = vuelve a lo de su rol.
create or replace function public.fn_permiso_guardar(p_empleado_id uuid, p_permiso text, p_permitido boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_rol text;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar permisos.';
  end if;
  if p_permiso not in ('cobrar', 'abrir_caja', 'cerrar_caja', 'descuento_manual') then
    raise exception 'Ese permiso no existe.';
  end if;
  select r.slug into v_rol from empleados e join roles r on r.id = e.rol_id where e.id = p_empleado_id;
  if v_rol is null then raise exception 'Esa persona no existe.'; end if;
  if v_rol in ('admin', 'administrador', 'gerente', 'desarrollo') then
    raise exception 'Gerencia puede todo siempre: no se le quitan permisos desde aqui.';
  end if;
  if p_permitido is null then
    delete from empleado_permisos where empleado_id = p_empleado_id and permiso = p_permiso;
  else
    insert into empleado_permisos (empleado_id, permiso, permitido, actualizado_por)
    values (p_empleado_id, p_permiso, p_permitido, fn_empleado_actual())
    on conflict (empleado_id, permiso) do update
      set permitido = excluded.permitido, actualizado_en = now(), actualizado_por = excluded.actualizado_por;
  end if;
end;
$function$;

-- Autorizar con el PIN de alguien que SI tenga el permiso. El PIN es la
-- credencial, igual que en el checador, y con el mismo freno: 15 fallos en
-- 15 minutos y se cierra, o un PIN de 4 digitos se adivina en una tarde.
create or replace function public.fn_autorizar_con_pin(p_pin text, p_permiso text)
 returns table(empleado_id uuid, nombre text)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare v_id uuid; v_nombre text;
begin
  if fn_pin_fallos_recientes('autorizar') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;
  select e.id, e.nombre into v_id, v_nombre
    from empleados e
   where e.activo and e.pin_hash is not null and e.pin_hash = crypt(coalesce(p_pin, ''), e.pin_hash)
     and fn_tiene_permiso(e.id, p_permiso)
   limit 1;
  perform fn_pin_registrar_intento('autorizar', v_id is not null);
  if v_id is null then
    raise exception 'Ese PIN no puede autorizar esto.';
  end if;
  return query select v_id, v_nombre;
end;
$function$;

-- El corte, con el candado adentro. La pantalla ya no escribe caja_cortes
-- directo: si lo hiciera, el candado seria de adorno.
create or replace function public.fn_cerrar_corte(
  p_corte_id uuid, p_efectivo numeric, p_desglose jsonb default null,
  p_notas text default null, p_pin_autoriza text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_emp uuid; v_aut uuid; v_aut_nombre text;
begin
  v_emp := fn_empleado_actual();
  if v_emp is null then
    raise exception 'Tu sesion de personal caduco. Sal y vuelve a entrar con tu PIN.';
  end if;

  if fn_tiene_permiso(v_emp, 'cerrar_caja') then
    v_aut := v_emp;
  elsif nullif(trim(coalesce(p_pin_autoriza, '')), '') is not null then
    select a.empleado_id into v_aut from fn_autorizar_con_pin(p_pin_autoriza, 'cerrar_caja') a;
  else
    raise exception 'Tu usuario no puede hacer el corte. Pide el PIN de quien tenga permiso.'
      using hint = 'requiere_autorizacion';
  end if;

  update caja_cortes
     set estado = 'cerrada',
         cerrado_en = now(),
         efectivo_contado = p_efectivo,
         empleado_cierre_id = v_emp,
         notas = nullif(trim(coalesce(p_notas, '')), ''),
         desglose_cierre = p_desglose,
         cierre_autorizado_por = v_aut
   where id = p_corte_id and estado <> 'cerrada';
  if not found then
    raise exception 'Ese corte ya estaba cerrado.';
  end if;

  select nombre into v_aut_nombre from empleados where id = v_aut;
  return jsonb_build_object('autorizo', v_aut_nombre, 'autorizo_id', v_aut);
end;
$function$;

-- El UPDATE directo queda solo para gerencia (correcciones desde Admin).
-- Abrir caja exige el permiso: la regla vive en la base, no en el boton.
drop policy if exists upd_caja_cortes_staff on caja_cortes;
create policy upd_caja_cortes_jefe on caja_cortes for update to anon, authenticated
  using (fn_es_jefe()) with check (fn_es_jefe());

drop policy if exists ins_caja_cortes_staff on caja_cortes;
create policy ins_caja_cortes_permiso on caja_cortes for insert to anon, authenticated
  with check (fn_es_staff() and fn_tiene_permiso(fn_empleado_actual(), 'abrir_caja'));

-- Permisos de ejecucion. Las dos caras de la trampa: PUBLIC y anon.
revoke execute on function fn_tiene_permiso(uuid, text) from public, anon;
revoke execute on function fn_mis_permisos() from public, anon;
revoke execute on function fn_permisos_personal() from public, anon;
revoke execute on function fn_permiso_guardar(uuid, text, boolean) from public, anon;
revoke execute on function fn_cerrar_corte(uuid, numeric, jsonb, text, text) from public, anon;
revoke execute on function fn_autorizar_con_pin(text, text) from public;
grant execute on function fn_tiene_permiso(uuid, text) to authenticated;
grant execute on function fn_mis_permisos() to authenticated;
grant execute on function fn_permisos_personal() to authenticated;
grant execute on function fn_permiso_guardar(uuid, text, boolean) to authenticated;
grant execute on function fn_cerrar_corte(uuid, numeric, jsonb, text, text) to authenticated;
-- El PIN es la credencial: se puede autorizar aunque la pantalla no tenga
-- sesion (el kiosko en modo cajero corre como anon, seccion 2.2).
grant execute on function fn_autorizar_con_pin(text, text) to anon, authenticated;
