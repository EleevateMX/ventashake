-- Las 8 ordenes de la falla del 27/08 (09:52-09:56).
--
-- Es el mismo pedido de "Ricardo" reintentado ocho veces mientras la caja no
-- podia cobrar -- el `delete` sin WHERE dentro del trigger. Ninguna se cobro
-- y ninguna entro al corte, pero seguian contando como pendientes de verdad
-- en la revision del sistema, tapando las que si importan.
--
-- Se cancelan explicitamente por folio y no por rango de fechas: en esa
-- ventana tambien hubo ventas buenas.
update ordenes
   set estado = 'cancelada', estado_pago_orden = 'cancelled'
 where folio between 1154 and 1161
   and not pagado
   and estado_pago_orden = 'pending_payment';
