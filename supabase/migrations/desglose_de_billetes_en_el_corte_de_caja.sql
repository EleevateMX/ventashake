-- El conteo por denominaciones ya se capturaba al cerrar la caja, pero se
-- perdia: solo se guardaba la suma. El comentario en el codigo decia "si
-- manana falta un billete de 500, se ve cuantos habia" -- y no se veia,
-- porque nadie lo escribia.
--
-- Ahora se guarda, en la apertura y en el cierre. Es jsonb y no columnas
-- por denominacion a proposito: el dia que salga otro billete, o que
-- alguien quiera contar los de 5, no hay que migrar la tabla.
--
-- Forma: {"1000": 0, "500": 0, "200": 2, "100": 1, "50": 1, "20": 15,
--         "10": 15, "5": 0, "2": 0, "1": 0}
-- La llave es la denominacion en pesos; el valor, cuantas piezas.
alter table caja_cortes
  add column if not exists desglose_apertura jsonb,
  add column if not exists desglose_cierre  jsonb;

comment on column caja_cortes.desglose_apertura is
  'Cuantas piezas de cada denominacion se contaron al abrir. Llave = pesos, valor = piezas. La suma debe cuadrar con fondo_inicial.';
comment on column caja_cortes.desglose_cierre is
  'Lo mismo al cerrar. La suma debe cuadrar con efectivo_contado.';
