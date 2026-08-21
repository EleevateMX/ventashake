-- ============================================================================
-- Las funciones que solo corren del lado del servidor dejan de estar abiertas
-- ============================================================================
-- El repositorio es publico y la llave publicable esta dentro del frontend
-- desplegado, asi que "lo puede llamar anon" significa "lo puede llamar
-- cualquiera con un navegador". Habia 59 funciones de ESCRITURA en esa
-- situacion.
--
-- La mas grave, ahora que la terminal de Clip esta activa:
-- `fn_confirmar_venta` es la que marca una orden como pagada. Estando abierta,
-- cualquiera podia confirmar una venta sin que existiera un cobro.
--
-- Este bloque cierra unicamente las que NINGUN navegador llama —se verifico
-- una por una contra el codigo de las apps— porque son disparadores internos
-- o las invocan las Edge Functions con la llave de servicio, que no pasa por
-- estos permisos. Cerrarlas no le quita nada a nadie.
--
-- Las que SI llama el navegador (fn_crear_empleado, fn_rotar_token_impresora,
-- fn_guardar_extra...) NO se tocan aqui: primero hay que darle a Admin y a
-- caja una sesion de verdad, o se quedan sin poder trabajar. Ese es el
-- siguiente paso.
--
-- Nota sobre disparadores: Postgres verifica el permiso de EXECUTE de una
-- funcion de trigger al CREAR el trigger, no cada vez que se dispara. Por eso
-- revocar aqui no apaga el encolado de comandas ni el descuento de inventario.
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in (
        'fn_confirmar_venta',               -- la escribe el servidor tras cobrar
        'fn_pago_aprobado',
        'fn_descontar_inventario_por_orden',
        'fn_encolar_comanda',
        'fn_encolar_comanda_para_pedido',
        'fn_encolar_comandas_desde_items',
        'fn_crear_pedidos_cocina',
        'fn_sync_app_data',
        'trg_sync_app_data',
        '_aplicar_delta_almacen',
        'fn_sync_stock_costos',
        'fn_imprimir_liberar_vencidos'
      )
  loop
    execute format('revoke execute on function %s from anon, authenticated', f.firma);
    n := n + 1;
  end loop;
  raise notice 'Cerradas % funciones de servidor.', n;
end $$;
