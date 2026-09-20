-- El vistazo de espera dice a que hora entro CADA renglon.
--
-- Ya viajaba la hora del ticket ("se aparto a las 11:54"). Faltaba la de
-- cada producto: una apartada que se retoma para agregarle algo y se
-- vuelve a apartar tiene renglones de dos momentos, y desde Admin esa
-- diferencia es lo unico que distingue "la dejo completa hace una hora"
-- de "le acaban de agregar algo".
--
-- `h` es opcional a proposito: las apartadas que ya estaban en el
-- navegador antes de este cambio no traen sello por renglon. Se guarda
-- vacio y la pantalla no pinta nada, en vez de repetir la hora del
-- ticket -- eso seria contestar otra pregunta.
--
-- Se sigue reconstruyendo renglon por renglon (no se guarda el jsonb que
-- llego): esta puerta esta abierta a anon y no puede servir de pizarron.
create or replace function public.fn_espera_publicar(
  p_pantalla text,
  p_cuantas integer,
  p_total numeric,
  p_etiquetas jsonb default '[]'::jsonb,
  p_ventas jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_etiquetas jsonb; v_ventas jsonb;
begin
  if coalesce(btrim(p_pantalla), '') = '' then
    raise exception 'Falta decir que pantalla es.';
  end if;

  select coalesce(jsonb_agg(left(e, 60)), '[]'::jsonb) into v_etiquetas
  from (
    select jsonb_array_elements_text(coalesce(p_etiquetas, '[]'::jsonb)) e
    limit 12
  ) t;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_ventas
  from (
    select jsonb_build_object(
             'etiqueta', left(coalesce(v->>'etiqueta', 'Venta'), 60),
             'total', greatest(0, coalesce((v->>'total')::numeric, 0)),
             'hora', left(coalesce(v->>'hora', ''), 5),
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'n', left(coalesce(i->>'n', '?'), 60),
                        'c', greatest(1, coalesce((i->>'c')::int, 1)),
                        'h', left(coalesce(i->>'h', ''), 5)))
               from (
                 select jsonb_array_elements(coalesce(v->'items', '[]'::jsonb)) i
                 limit 20
               ) s
             ), '[]'::jsonb)
           ) x
    from (
      select jsonb_array_elements(coalesce(p_ventas, '[]'::jsonb)) v
      limit 12
    ) t
  ) y;

  insert into ventas_en_espera_vistazo
    (pantalla, cuantas, total, etiquetas, ventas, actualizado_en)
  values (left(btrim(p_pantalla), 40), greatest(0, coalesce(p_cuantas, 0)),
          greatest(0, coalesce(p_total, 0)), v_etiquetas, v_ventas, now())
  on conflict (pantalla) do update set
    cuantas = excluded.cuantas,
    total = excluded.total,
    etiquetas = excluded.etiquetas,
    ventas = excluded.ventas,
    actualizado_en = now();
end;
$function$;
