-- ============================================================================
-- El pedido lleva nombre
-- ============================================================================
-- La etiqueta reparte por nombre (es lo más grande que imprime), pero solo lo
-- tenía si el cliente se identificaba en lealtad; si no, salía el folio. La
-- caja necesita preguntar "¿a nombre de quién?" sin dar de alta a nadie:
-- un nombre por pedido, sin teléfono, sin ficha.
--
-- `nombre_cliente` es del PEDIDO, no del cliente: si además se identificó en
-- lealtad, el nombre tecleado gana en la etiqueta (es la intención de ESTA
-- orden), y las mancuernas siguen llegando a su ficha por cliente_id.
--
-- NOTA: copia resumida de la migración aplicada `nombre_del_pedido`; los
-- cuerpos completos de fn_crear_orden / fn_crear_orden_kiosko_caja viven en
-- el historial de Supabase. Cambios:
--   1. alter table ordenes add column nombre_cliente text
--   2. fn_crear_orden gana la sobrecarga de 10 parámetros con
--      p_nombre_cliente (default null); las de 8 y 9 delegan.
--   3. fn_crear_orden_kiosko_caja gana p_nombre_cliente (la de 5 delega).
--   4. fn_encolar_comanda y fn_encolar_comanda_para_pedido arman el payload
--      con: 'cliente', coalesce(o.nombre_cliente, cl.nombre)
--      — el nombre tecleado gana sobre el de lealtad.
-- ============================================================================

alter table ordenes add column if not exists nombre_cliente text;

comment on column ordenes.nombre_cliente is
  'A nombre de quién va el pedido (para gritar/etiquetar). Independiente de la ficha de lealtad.';
