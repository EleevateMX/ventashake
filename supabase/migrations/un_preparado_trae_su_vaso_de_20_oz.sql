-- El Clasico es de 16 oz. Con un "Preparado" encima es un signature, y
-- esos van en el vaso de 20 — pero los 11 "Preparado: ..." tenian
-- `onzas` en null, asi que la pantalla de barra leia las onzas del
-- producto base y decia 16. El shake se preparaba en el vaso chico.
--
-- Se arregla en el DATO y no en la pantalla a proposito: el dia que
-- entre un preparado nuevo tiene que traer su vaso solo, sin que nadie
-- toque codigo. La pantalla ya toma el vaso mas grande de todo lo que va
-- adentro (`vasoDeItem`, con pruebas) — un extra puede subir el tamano,
-- nunca bajarlo.
update productos
   set onzas = 20
 where nombre like 'Preparado:%'
   and es_extra
   and onzas is distinct from 20;
