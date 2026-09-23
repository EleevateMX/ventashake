-- El kiosko tambien tiene que poder decir "Vaso 20 oz" al elegir un
-- preparado: quien captura es quien a veces entrega el vaso, y enterarse
-- hasta la pantalla de barra es enterarse tarde.
--
-- ⚠ `create or replace view` BORRA las reloptions: hay que volver a
-- declarar `security_invoker = true` o la vista queda insegura en
-- silencio. Esta es la vista mas leida del sistema (kiosko y POS la
-- cargan para cada producto), asi que se re-declara abajo y se comprueba
-- mirando pg_class, no releyendo la migracion.
create or replace view public.vw_producto_extras as
  select pe.producto_id,
         e.id as extra_id,
         e.nombre,
         coalesce(pe.precio, e.precio) as precio,
         e.activo,
         pe.grupo,
         e.marca,
         pe.por_defecto,
         pe.requiere_grupo,
         e.onzas
    from producto_extras pe
    join productos e on e.id = pe.extra_id;

alter view public.vw_producto_extras set (security_invoker = true);
