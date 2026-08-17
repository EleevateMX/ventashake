-- "Vaso con Hielo" heredó leches y galletas del bloque "todos los shakes"
-- (vive en la categoría Shakes). Al fin y al cabo solo es un vaso con hielo:
-- se le quitan todos los extras y las onzas para que entre en un toque y el
-- visor no diga nada de más. Si algún día se quiere de vuelta algo, son las
-- palomitas de Admin → Extras.
delete from producto_extras
where producto_id in (select id from productos where nombre ilike 'vaso con hielo');

update productos set onzas = null where nombre ilike 'vaso con hielo';
