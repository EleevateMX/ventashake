-- Las cuatro vistas de reportes perdieron su `security_invoker` y corrian
-- como SECURITY DEFINER: quien las consultaba se saltaba el RLS de las
-- tablas de abajo.
--
-- Es EXACTAMENTE la trampa que ya esta escrita en el CLAUDE.md:
-- `create or replace view` borra las reloptions, y hay que volver a
-- declararlas o la vista queda insegura en silencio. Volvio a pasar, y
-- por eso el aviso de Supabase las marcaba como ERROR.
--
-- Hoy la exposicion practica era pequena porque esas tablas ya se pueden
-- leer, pero eso es cierto HOY: el dia que se cierre `ordenes` o `pagos`,
-- estas cuatro seguirian sirviendo todo por la puerta de atras y nadie se
-- enteraria.
--
-- Verificado ANTES de aplicar que las tablas de abajo (ordenes,
-- orden_items, pagos, caja_cortes, productos, inventario_stock,
-- almacenes, ventas) tienen lectura y politica para anon/authenticated.
-- Verificado DESPUES por HTTP con una sesion de personal real: las cuatro
-- contestan 200 y devuelven datos.
alter view public.vw_ventas_diarias         set (security_invoker = true);
alter view public.vw_productos_mas_vendidos set (security_invoker = true);
alter view public.vw_stock_almacen          set (security_invoker = true);
alter view public.vw_corte_resumen          set (security_invoker = true);
