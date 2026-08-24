-- Punto 2 del cliente: la etiqueta debe decir "Kombucha - Limonada Durazno".
-- La tubería ya existía (fn_items_comanda manda categorias.nombre_singular y
-- el agente imprime "Familia - Nombre"); faltaban dos singulares.
update categorias set nombre_singular = 'Café' where nombre = 'Café' and nombre_singular is null;
update categorias set nombre_singular = 'Energy Drink' where nombre = 'Energy Drinks' and nombre_singular is null;
