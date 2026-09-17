-- "Al hacerle click, poder ver que contiene la venta en espera. Y tambien
-- la hora."
--
-- El vistazo mandaba solo las etiquetas ("El Clasico +1"), que sirven para
-- reconocer la venta pero no para saber que lleva ni desde cuando espera.
-- Ahora viaja una fila por venta con sus renglones y su hora.
--
-- Sigue sin ser una orden: no hay folio, ni id de producto, ni precio por
-- renglon -- solo nombre y cantidad, que es lo que un humano necesita para
-- decir "ah, es el de los dos shakes". La verdad de la venta sigue en el
-- navegador que la aparto.
--
-- `etiquetas` se queda. Entre que esta migracion se aplica y que el kiosko
-- nuevo se despliega hay una ventana en la que la pantalla vieja sigue
-- mandando solo etiquetas, y en esa ventana el panel tiene que seguir
-- mostrando algo. `p_ventas` va con default por lo mismo: la llamada de
-- cuatro argumentos sigue resolviendo.
alter table public.ventas_en_espera_vistazo
  add column if not exists ventas jsonb not null default '[]'::jsonb;

comment on column public.ventas_en_espera_vistazo.ventas is
  'Una fila por venta apartada: etiqueta, total, hora y renglones (nombre + cantidad). Sin folio ni precios por renglon: no es una orden.';

-- Se borra la firma de 4 para que no queden dos conviviendo -- la trampa
-- de siempre: cambiar la firma no reemplaza, duplica.
drop function if exists public.fn_espera_publicar(text, integer, numeric, jsonb);

create function public.fn_espera_publicar(
  p_pantalla text,
  p_cuantas integer,
  p_total numeric,
  p_etiquetas jsonb default '[]'::jsonb,
  p_ventas jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  -- Se reconstruye renglon por renglon en vez de guardar el jsonb que
  -- llego: asi lo que se almacena tiene forma conocida y tamano acotado,
  -- y nadie puede usar esta puerta (abierta a anon) de pizarron.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_ventas
  from (
    select jsonb_build_object(
             'etiqueta', left(coalesce(v->>'etiqueta', 'Venta'), 60),
             'total', greatest(0, coalesce((v->>'total')::numeric, 0)),
             'hora', left(coalesce(v->>'hora', ''), 5),
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'n', left(coalesce(i->>'n', '?'), 60),
                        'c', greatest(1, coalesce((i->>'c')::int, 1))))
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
$$;

revoke all on function public.fn_espera_publicar(text, integer, numeric, jsonb, jsonb) from public;
grant execute on function public.fn_espera_publicar(text, integer, numeric, jsonb, jsonb)
  to anon, authenticated, service_role;

drop function if exists public.fn_espera_en_vivo();

create function public.fn_espera_en_vivo()
returns table (
  pantalla text, cuantas integer, total numeric,
  etiquetas jsonb, ventas jsonb, hace_minutos integer
)
language sql
stable
security definer
set search_path = public
as $$
  select v.pantalla, v.cuantas, v.total, v.etiquetas,
         -- Mientras el kiosko viejo siga mandando solo etiquetas, se
         -- arma el detalle minimo con ellas: es mejor una fila sin
         -- renglones que una pantalla vacia.
         case when jsonb_array_length(v.ventas) > 0 then v.ventas
              else coalesce((
                select jsonb_agg(jsonb_build_object(
                         'etiqueta', e, 'total', 0, 'hora', '', 'items', '[]'::jsonb))
                from jsonb_array_elements_text(v.etiquetas) e
              ), '[]'::jsonb)
         end,
         (extract(epoch from (now() - v.actualizado_en)) / 60)::int
  from ventas_en_espera_vistazo v
  where fn_es_staff()
    and v.cuantas > 0
    and v.actualizado_en > now() - interval '12 hours'
  order by v.pantalla;
$$;

revoke all on function public.fn_espera_en_vivo() from public;
revoke execute on function public.fn_espera_en_vivo() from anon;
grant execute on function public.fn_espera_en_vivo() to authenticated, service_role;
