-- La lista de categorias que se dan de baja al desaparecer de Costeos era
-- una lista literal, y cada subcategoria nueva habia que acordarse de
-- agregarla. Ya se habia olvidado una: 'Energy Drinks' no estaba, asi que
-- una lata borrada del costeo se quedaba activa en el kiosko para siempre.
-- Con las doce subcategorias nuevas el olvido se volvia seguro.
--
-- El nombre ya trae la jerarquia ("Snacks - Nuts"), la misma marca que usa
-- el kiosko para plegar los chips. Se aprovecha: basta con que la FAMILIA
-- este en la lista. Asi cualquier subcategoria futura entra sola.
--
-- Parche por ancla, con verificacion: la funcion es de las grandes y
-- reescribirla entera aqui la dejaria congelada en esta version.
do $mig$
declare
  d text := pg_get_functiondef('fn_sync_app_data()'::regprocedure);
  ancla text := 'and c.nombre in (''Shakes'',''Alimentos'',''Bebidas'',''Snacks'',''Suplementos'',''Scoops'',';
  nuevo text := 'and (c.nombre in (''Shakes'',''Alimentos'',''Bebidas'',''Snacks'',''Suplementos'',''Scoops'',''Energy Drinks'',';
  cierre_viejo text := '''Suplementos - Pre-entrenos'',''Suplementos Birdman'')';
  cierre_nuevo text := '''Suplementos - Pre-entrenos'',''Suplementos Birdman'')
         -- ...o su familia lo este: "Snacks - Nuts" cuelga de "Snacks".
         or split_part(c.nombre, '' - '', 1) in (''Shakes'',''Alimentos'',''Bebidas'',''Snacks'',
              ''Suplementos'',''Scoops'',''Energy Drinks'',''Collagen Drinks'',''Amino Refreshers'',
              ''Hydration Drinks'',''Café'',''Tés'',''Kombuchas''))';
  veces int;
begin
  if position('split_part(c.nombre' in d) > 0 then
    raise notice 'ya estaba parchada, no se toca';
    return;
  end if;

  veces := (length(d) - length(replace(d, ancla, ''))) / length(ancla);
  if veces <> 1 then
    raise exception 'El ancla de la lista aparece % veces, no 1', veces;
  end if;
  veces := (length(d) - length(replace(d, cierre_viejo, ''))) / length(cierre_viejo);
  if veces <> 1 then
    raise exception 'El cierre de la lista aparece % veces, no 1', veces;
  end if;

  d := replace(d, ancla, nuevo);
  d := replace(d, cierre_viejo, cierre_nuevo);
  execute d;
end
$mig$;
