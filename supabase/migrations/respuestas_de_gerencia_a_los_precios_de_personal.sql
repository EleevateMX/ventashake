-- Gerencia contesto las cuatro dudas que quedaron al sembrar los precios
-- de personal (26/09):
--   1. Jugo Verde consume lugar de BEBIDA, al precio de la lista ($49).
--   2. Shake Mexa NO lleva precio de personal: se queda sin, se cobra completo.
--   3. El Clasico con Sascha a $61 esta bien: no se toca nada.
--   4. "Hazlo Crunchy" = que puedan agregarle galletitas como cualquier
--      cliente. Los extras ya se cobran completos y fuera del tope, asi que
--      no hace falta crear nada.
update productos
   set precio_personal = 49, grupo_personal = 'bebida'
 where id = '5344c670-b2e6-4330-b0d5-0d89fb877215'   -- Jugo Verde
   and precio >= 49;

update reportes_soporte set estado = 'cerrado', atendido_en = now(), respuesta = r.txt
  from (values
    ('2959fcba-1aed-42fd-bea7-bee10552bc2d'::uuid, 'Gerencia: consume lugar de bebida. Quedo en $49 de personal, grupo bebida.'),
    ('1ab41e3b-2415-4f03-9041-7f718b63f7a5'::uuid, 'Gerencia: no lleva precio de personal. Se queda como estaba: se cobra completo.'),
    ('41e43ec2-1b12-4c58-9e31-8419c836b007'::uuid, 'Gerencia: $61 esta bien. No se cambio nada.'),
    ('4b1ca9f3-49f4-40fc-8ab3-f8f566fded66'::uuid, 'Gerencia: es poder agregarle galletas como a cualquier cliente. Los extras ya se cobran completos y fuera del tope; no hace falta crear un extra nuevo.')
  ) as r(id, txt)
 where reportes_soporte.id = r.id;
