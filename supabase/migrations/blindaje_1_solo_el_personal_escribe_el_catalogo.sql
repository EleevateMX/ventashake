-- BLINDAJE 1/3: el catalogo, los precios y la caja solo los escribe el personal.
--
-- Encontrado el 31/08 auditando: estas tablas tenian politicas de escritura
-- `using (true)` Y el permiso concedido a `anon`. Con la llave publica —que
-- es publica por diseno y viaja en el frontend— cualquiera podia:
--
--   update productos set precio = 0;      -- y cobrarse un shake gratis
--   update promociones set valor = 100;   -- 100% de descuento
--   update caja_cortes set efectivo_contado = ...;  -- cuadrar un faltante
--   delete from recetas;                  -- dejar la tienda sin costeo
--
-- El dinero se calcula en el servidor, si — pero `fn_crear_orden` lee
-- `productos.precio`. Si el precio se puede tocar desde fuera, calcularlo
-- en el servidor no protege nada.
--
-- La condicion es `fn_es_staff()` (la sesion es de un empleado activo) y no
-- `authenticated` a secas: todo cliente de Rewards es `authenticated`.
--
-- Verificado antes de tocar: Costeos guarda en `app_data` y el catalogo lo
-- escribe el trigger `fn_sync_app_data`, que es SECURITY DEFINER y pasa por
-- encima de RLS — cerrar esto no lo afecta. Admin, POS y kiosko escriben
-- estas tablas siempre con sesion de personal (PIN -> staff-login).

do $$
declare
  t text;
  tablas text[] := array[
    'productos', 'categorias', 'insumos', 'recetas', 'combo_items',
    'promociones', 'parametros', 'inventario_stock', 'lotes',
    'transferencias', 'caja_cortes'
  ];
  p record;
begin
  foreach t in array tablas loop
    -- Se recrean solo las de escritura; las de lectura se dejan como estan
    -- (el kiosko necesita leer el catalogo sin sesion).
    for p in
      select polname from pg_policy
      where polrelid = t::regclass and polcmd::text in ('a','w','d')
    loop
      execute format('drop policy %I on %I', p.polname, t);
    end loop;

    execute format(
      'create policy %I on %I for insert to anon, authenticated with check (fn_es_staff())',
      'ins_' || t || '_staff', t);
    execute format(
      'create policy %I on %I for update to anon, authenticated using (fn_es_staff()) with check (fn_es_staff())',
      'upd_' || t || '_staff', t);
    execute format(
      'create policy %I on %I for delete to anon, authenticated using (fn_es_staff())',
      'del_' || t || '_staff', t);

    -- Y el permiso de tabla, que es la otra mitad del candado.
    execute format('revoke insert, update, delete on %I from anon', t);
    execute format('grant insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
