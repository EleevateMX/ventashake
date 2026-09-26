-- El candado del corte tenia una puerta de atras: cualquier persona del
-- personal podia BORRAR un corte (del_caja_cortes_staff) en vez de cerrarlo.
-- Ninguna pantalla borra cortes; queda solo para gerencia, como el UPDATE.
drop policy if exists del_caja_cortes_staff on caja_cortes;
create policy del_caja_cortes_jefe on caja_cortes for delete to anon, authenticated
  using (fn_es_jefe());
