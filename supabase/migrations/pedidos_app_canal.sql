-- PASO A de «Pedidos por la app» (06/10/26). Va SOLO, en su propia corrida:
-- un valor nuevo de un enum no se puede usar en la misma transacción en
-- que se crea, y el PASO B lo usa.
alter type canal_orden add value if not exists 'app';
