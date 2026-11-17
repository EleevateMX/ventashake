-- Sellos y recompensas en la app (17/11/26, pedido de gerencia).
--
-- Hasta hoy la tarjeta 13+1 era sorpresa: el servidor no mandaba números
-- (ver fn_mi_resumen_lealtad, 'sorpresa'). Gerencia pidió enseñar el avance
-- («Shakes 3 de 13») para generar emoción, con un interruptor POR TARJETA en
-- Admin → Rewards. Nace APAGADO: el día del despliegue nada cambia.
--
--   * config_sellos.mostrar_progreso (default false).
--   * fn_config_sellos_progreso(tipo, mostrar, nombre): solo gerencia. Va
--     aparte de fn_config_sellos_guardar para no cambiarle la firma (cambiarla
--     la duplica).
--   * fn_mi_resumen_lealtad agrega 'sellos' SOLO con las tarjetas prendidas:
--     si está apagada el número no viaja (el inspector lo leería).
--   * fn_rewards_parametros enseña el interruptor.

alter table public.config_sellos add column if not exists mostrar_progreso boolean not null default false;

create or replace function public.fn_config_sellos_progreso(p_tipo text, p_mostrar boolean, p_nombre text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar la tarjeta de sellos';
  end if;
  update config_sellos
     set mostrar_progreso = coalesce(p_mostrar, mostrar_progreso),
         nombre = coalesce(nullif(trim(p_nombre), ''), nombre)
   where tipo = p_tipo;
  if not found then raise exception 'No existe esa tarjeta'; end if;
  return jsonb_build_object('ok', true);
end;
$function$;

do $$
declare v text; a text;
begin
  select pg_get_functiondef('public.fn_mi_resumen_lealtad()'::regprocedure) into v;
  a := '    ''paquetes'', (';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla fn_mi_resumen_lealtad'; end if;
  v := replace(v, a, $p$    'sellos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', cs.tipo,
        'nombre', coalesce(cs.nombre, initcap(cs.tipo)),
        'tiene', least(t.tiene, cs.requeridos),
        'requeridos', cs.requeridos,
        'lista', t.tiene >= cs.requeridos,
        'texto', case when t.tiene >= cs.requeridos then cs.aviso_listo_texto end
      ) order by cs.tipo desc), '[]'::jsonb)
      from config_sellos cs
      cross join lateral (
        select case when cs.tipo = 'bebida'
                    then coalesce(v_cliente.sellos_bebida, 0)
                    else coalesce(v_cliente.sellos_alimento, 0) end
      ) as t(tiene)
      where cs.activo and cs.mostrar_progreso
    ),

$p$ || a);
  execute v;

  select pg_get_functiondef('public.fn_rewards_parametros()'::regprocedure) into v;
  a := '        ''aviso_listo_texto'', cs.aviso_listo_texto,';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla fn_rewards_parametros'; end if;
  v := replace(v, a, a || $p$
        'mostrar_progreso', cs.mostrar_progreso,$p$);
  execute v;
end $$;
