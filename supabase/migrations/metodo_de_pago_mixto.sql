-- 'mixto' es lo que queda escrito en `ordenes.metodo_pago` cuando el cobro
-- se hizo en partes. El desglose real vive en `pagos`, un renglon por parte.
--
-- Va en su propia migracion porque Postgres no deja USAR un valor de enum
-- en la misma transaccion en que se agrega, y la funcion de cobro dividido
-- (pago_dividido_efectivo_y_tarjeta.sql) lo escribe.
alter type metodo_pago add value if not exists 'mixto';
