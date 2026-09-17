-- Perla quiere una seccion "EXTRAS" en el menu del kiosko, al lado de
-- Shakes / Collagen Drinks / Amino Refreshers: hay gente que entra solo
-- por un extra de chipotle o de pepinillos, y hay wraps que no los llevan
-- en la receta pero el cliente los pide aparte.
--
-- La maquinaria ya existia (`fn_extra_vender_solo`, probada en septiembre)
-- pero nunca tuvo boton, asi que nadie podia usarla. Para poner ese boton
-- la lista de Admin tiene que decir el estado actual: cual extra ya se
-- vende solo, con que precio y en que categoria. Sin eso el control seria
-- un interruptor que no sabe si esta prendido.
--
-- El gemelo se busca igual que en `fn_extra_vender_solo`: por el nombre
-- sin el "Extra " de adelante y con `es_extra = false`. Las dos reglas
-- tienen que seguir empatando -- si una cambia, la otra miente.
drop function if exists public.fn_extras_bebida_admin();

create function public.fn_extras_bebida_admin()
returns table (
  id uuid, nombre text, precio numeric, activo boolean, ligado_a bigint,
  vende_solo boolean, suelto_id uuid, suelto_nombre text,
  suelto_precio numeric, suelto_categoria text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, p.precio, p.activo,
         (select count(*) from producto_extras pe where pe.extra_id = p.id),
         coalesce(s.activo, false),
         s.id, s.nombre, s.precio, sc.nombre
    from productos p
    join categorias c on c.id = p.categoria_id
    left join lateral (
      select p2.* from productos p2
       where not p2.es_extra
         and lower(trim(p2.nombre)) =
             lower(trim(regexp_replace(p.nombre, '^\s*extra\s+', '', 'i')))
       order by p2.activo desc
       limit 1
    ) s on true
    left join categorias sc on sc.id = s.categoria_id
   where p.es_extra and c.nombre = 'Extras Bebidas'
   order by p.nombre;
$$;

revoke all on function public.fn_extras_bebida_admin() from public;
revoke execute on function public.fn_extras_bebida_admin() from anon;
grant execute on function public.fn_extras_bebida_admin() to authenticated, service_role;
