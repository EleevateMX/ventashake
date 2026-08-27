-- Las ventas del dia se podian leer con la llave publica.
--
-- Cuatro vistas de reportes (ventas diarias, resumen del corte, stock y
-- mas vendidos) nunca se declararon `security_invoker`, asi que corren con
-- los permisos de quien las creo y se saltan RLS. Y encima tenian SELECT
-- (y INSERT/UPDATE/DELETE) concedido a `anon`.
--
-- La llave anon es publica por diseno: vive en el frontend de
-- shakeaholic.mx. O sea que cualquiera que abriera las herramientas del
-- navegador podia leer cuanto vendio la tienda ayer.
--
-- Quien las usa de verdad:
--   vw_ventas_diarias, vw_productos_mas_vendidos, vw_stock_almacen -> Admin
--   vw_corte_resumen -> POS y el corte de Milo en el kiosko
-- Los tres casos son personal con sesion real (PIN -> Supabase Auth).
-- Ninguno corre como anon: en el kiosko, `cargarContexto` solo se llama
-- despues de que `empleadoDeLaSesion` devolvio un empleado o de que el PIN
-- fue correcto. Por eso quitarle `anon` no apaga nada.
--
-- Los permisos de escritura sobre una VISTA tampoco tenian razon de ser.

revoke all on public.vw_ventas_diarias         from anon;
revoke all on public.vw_productos_mas_vendidos from anon;
revoke all on public.vw_stock_almacen          from anon;
revoke all on public.vw_corte_resumen          from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.vw_ventas_diarias, public.vw_productos_mas_vendidos,
     public.vw_stock_almacen, public.vw_corte_resumen
  from authenticated;

-- Queda pendiente cerrarlas tambien a `authenticated`: un cliente de
-- lealtad tambien es `authenticated`. Eso pide `security_invoker = true` y
-- politicas de RLS para el personal en las tablas de abajo, y se hace
-- fuera de horario -- si se equivoca uno ahi, se rompe el corte de caja.
