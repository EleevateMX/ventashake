-- Las funciones del descuento de personal.
--
-- ⚠ La decision mas importante: **`fn_crear_orden` NO se toca.** Esa
-- funcion es el camino del dinero; ya tuvimos tres versiones viejas
-- conviviendo que no cobraban sobreprecios, y 145 ordenes al dia pasan por
-- ella. `fn_crear_orden_personal` la ENVUELVE: valida la clave, el turno y
-- los limites, calcula el descuento **en el servidor** y se lo pasa como
-- `p_descuento`. El cajero no manda un precio ni un descuento — manda una
-- clave, y el servidor decide cuanto vale.

-- Cuanto le queda hoy a alguien. Es lo que la pantalla ensena ANTES de
-- capturar: enterarse del limite al cobrar es enterarse tarde.
create or replace function public.fn_personal_restante(p_empleado_id uuid)
returns table(
  usado_shake int, usado_alimento int, usado_bebida int,
  usado_importe numeric, tope numeric,
  max_shake int, max_alimento int, max_bebida int
)
language sql stable security definer set search_path to 'public'
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
         (select max_shake from cfg), (select max_alimento from cfg), (select max_bebida from cfg);
$function$;

-- ¿Puede usar el beneficio ahora mismo? Aparte del limite, esta el turno.
create or replace function public.fn_personal_puede(p_empleado_id uuid)
returns text
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_cfg record; v_ult record; v_horas int;
begin
  select * into v_cfg from personal_config where id = 'default';
  if not v_cfg.exige_turno then return null; end if;

  select turno_max_horas into v_horas from asistencia_config where id = 'default';
  select a.tipo, a.ocurrio_en into v_ult
    from asistencia_eventos a
   where a.empleado_id = p_empleado_id
   order by a.ocurrio_en desc limit 1;

  if v_ult.tipo is null then
    return 'Todavia no has checado entrada.';
  end if;

  -- Turno abierto: cualquier cosa que no sea salida, y que no sea de ayer.
  if v_ult.tipo <> 'salida'
     and v_ult.ocurrio_en >= now() - make_interval(hours => coalesce(v_horas, 16)) then
    return null;
  end if;

  -- Recien salido: la gracia cubre "al terminar su turno", que fue el
  -- pedido textual — checa salida, se sienta y se toma su shake.
  if v_ult.tipo = 'salida'
     and v_ult.ocurrio_en >= now() - make_interval(mins => v_cfg.gracia_min) then
    return null;
  end if;

  return 'El beneficio es durante tu turno. Checa tu entrada primero.';
end;
$function$;

-- Identificar por clave. Abierta a `anon` porque el kiosko en modo cajero
-- corre como `anon` y la clave ES la credencial, igual que el PIN. Reusa
-- el mismo freno de intentos: una clave corta se adivina en una tarde.
create or replace function public.fn_personal_identificar(p_clave text)
returns table(
  empleado_id uuid, nombre text, motivo text,
  usado_shake int, usado_alimento int, usado_bebida int,
  usado_importe numeric, tope numeric,
  max_shake int, max_alimento int, max_bebida int
)
language plpgsql security definer set search_path to 'public'
as $function$
declare v_emp record;
begin
  if fn_pin_fallos_recientes('personal') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  select e.id, e.nombre into v_emp
    from empleados e
   where e.activo and e.beneficio_personal
     and e.clave_personal_hash is not null
     and e.clave_personal_hash = crypt(p_clave, e.clave_personal_hash)
   order by e.created_at limit 1;

  if v_emp.id is null then
    perform fn_pin_registrar_intento('personal', false);
    raise exception 'Esa clave no es de nadie.';
  end if;
  perform fn_pin_registrar_intento('personal', true);

  return query
    select v_emp.id, v_emp.nombre, fn_personal_puede(v_emp.id),
           r.usado_shake, r.usado_alimento, r.usado_bebida,
           r.usado_importe, r.tope, r.max_shake, r.max_alimento, r.max_bebida
      from fn_personal_restante(v_emp.id) r;
end;
$function$;

grant execute on function public.fn_personal_identificar(text) to anon, authenticated;
revoke execute on function public.fn_personal_restante(uuid) from anon;
revoke execute on function public.fn_personal_restante(uuid) from public;
revoke execute on function public.fn_personal_puede(uuid) from anon;
revoke execute on function public.fn_personal_puede(uuid) from public;
