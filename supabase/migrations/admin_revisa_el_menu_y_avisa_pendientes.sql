-- Admin revisa el menu y dice que esta pendiente de arreglar.
--
-- Nace de un dia entero de reportes que sonaban a "se borro algo" y no lo
-- eran: los tes y el Smoky Chipotle los tapaba el corte de las 1000 filas
-- (eso ya se arreglo), pero al buscarlos aparecieron huecos reales que
-- nadie podia ver desde Admin:
--
--   · El combo del Latte dice "elige una" y solo tiene UNA opcion, porque
--     "Latte Caliente" quedo apagado al migrar del Chapata Pick viejo.
--   · Ese mismo extra NO SALE en Admin -> Extras, porque se quedo sin
--     categoria y esa pantalla solo lista los de "Extras Bebidas". O sea:
--     la pantalla escondia justo el renglon que explicaba el problema.
--
-- Esta funcion no arregla nada sola. Enumera lo que esta chueco con
-- nombre y apellido para que gerencia lo vea y lo componga, que es lo que
-- se pidio: "una alerta de pendientes a cambios para el menu".
--
-- Cada renglon trae `severidad`: 'rompe' = el cliente o el cajero ya lo
-- estan sufriendo; 'revisar' = huele mal y conviene mirarlo.
create or replace function public.fn_revision_menu()
returns table(
  tipo text, severidad text, producto text, producto_id uuid,
  detalle text, sugerencia text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  -- 1. Un grupo de UNA sola opcion: la pantalla dice "elige una" y no
  --    deja elegir nada. Casi siempre es una opcion que se apago.
  select 'grupo_de_una', 'rompe', p.nombre, p.id,
         'El grupo «' || pe.grupo || '» tiene una sola opcion: ' ||
           string_agg(e.nombre, ', '),
         'Prende la que falta en Admin -> Extras, o quitale el grupo para que sea un adicional suelto.'
    from producto_extras pe
    join productos p on p.id = pe.producto_id and p.activo
    join productos e on e.id = pe.extra_id and e.activo
   where fn_es_staff() and pe.grupo is not null and pe.grupo <> 'proteina'
   group by p.nombre, p.id, pe.grupo
  having count(*) = 1

  union all

  -- 2. Un extra apagado que sigue colgado de un producto activo: no sale
  --    en el menu y nadie se entera de por que.
  select 'extra_apagado_ligado', 'rompe', p.nombre, p.id,
         'Ofrece «' || e.nombre || '», que esta apagado, asi que no sale.',
         'Prendelo en Admin -> Extras, o quitale la palomita en ese producto.'
    from producto_extras pe
    join productos p on p.id = pe.producto_id and p.activo
    join productos e on e.id = pe.extra_id and not e.activo
   where fn_es_staff()

  union all

  -- 3. Un extra acotado con "solo si..." a un grupo que ese producto NO
  --    tiene: no va a aparecer nunca, y nada lo dice.
  select 'solo_si_huerfano', 'rompe', p.nombre, p.id,
         '«' || e.nombre || '» esta acotado a «' || pe.requiere_grupo ||
           '», y ese grupo no existe en este producto: nunca va a salir.',
         'Corrige la casilla «solo si...» en Admin -> Extras, o dejala vacia.'
    from producto_extras pe
    join productos p on p.id = pe.producto_id and p.activo
    join productos e on e.id = pe.extra_id
   where fn_es_staff()
     and nullif(btrim(coalesce(pe.requiere_grupo, '')), '') is not null
     and not exists (
       select 1 from producto_extras o
        where o.producto_id = pe.producto_id and o.grupo = pe.requiere_grupo
     )

  union all

  -- 4. Dos productos activos con el mismo nombre: el cajero le pega al
  --    equivocado. Es lo que dejo a la tienda sin poder vender El Clasico.
  select 'nombre_duplicado', 'rompe', d.nombre, d.id,
         'Hay ' || d.cuantos || ' productos activos con este mismo nombre.',
         'Apaga el que sobre en Admin -> Menu. El bueno es el que tiene Clave y receta.'
    from (
      -- min(uuid) no existe en Postgres; se toma el primero del array.
      select (array_agg(p.id order by p.id))[1] as id, p.nombre, count(*) as cuantos
        from productos p
       where p.activo and not p.es_extra
       group by p.nombre
      having count(*) > 1
    ) d
   where fn_es_staff()

  union all

  -- 5. Un extra sin categoria es invisible en Admin -> Extras, asi que no
  --    hay forma de prenderlo ni de ligarlo desde ahi.
  select 'extra_sin_categoria', 'revisar', e.nombre, e.id,
         'Es un extra sin categoria, por eso no aparece en la lista de Extras.',
         'Ponle la categoria «Extras Bebidas» en Admin -> Menu para poder administrarlo.'
    from productos e
   where fn_es_staff() and e.es_extra and e.categoria_id is null
     and exists (select 1 from producto_extras pe where pe.extra_id = e.id)

  union all

  -- 6. Un producto que se vende y no tiene receta no descuenta nada. El
  --    detalle por insumo vive en Inventario -> "Lo que no descuenta";
  --    aqui solo se cuenta, para que no se olvide.
  select 'sin_receta', 'revisar', p.nombre, p.id,
         'Se vende y no tiene receta: al cobrarlo no baja inventario.',
         'Costealo en Costeos, o decide que se vende si hay un gemelo.'
    from productos p
   where fn_es_staff() and p.activo and not p.es_extra
     and not exists (select 1 from recetas r where r.producto_id = p.id)
     and exists (
       select 1 from orden_items oi join ordenes o on o.id = oi.orden_id
        where oi.producto_id = p.id and o.pagado
          and o.created_at > now() - interval '30 days'
     )

  order by 2, 1, 3
$function$;

revoke execute on function public.fn_revision_menu() from public;
revoke execute on function public.fn_revision_menu() from anon;
