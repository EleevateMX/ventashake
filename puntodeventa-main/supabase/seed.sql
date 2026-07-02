-- Datos de prueba para desarrollo

-- Categorías de alimentos
insert into categorias (nombre, cocina_id, activa)
select 'Entradas', id, true from cocinas where slug = 'alimentos';

insert into categorias (nombre, cocina_id, activa)
select 'Platillos fuertes', id, true from cocinas where slug = 'alimentos';

insert into categorias (nombre, cocina_id, activa)
select 'Postres', id, true from cocinas where slug = 'alimentos';

-- Categorías de bebidas
insert into categorias (nombre, cocina_id, activa)
select 'Refrescos', id, true from cocinas where slug = 'bebidas';

insert into categorias (nombre, cocina_id, activa)
select 'Café', id, true from cocinas where slug = 'bebidas';

insert into categorias (nombre, cocina_id, activa)
select 'Agua y naturales', id, true from cocinas where slug = 'bebidas';

-- Insumos de ejemplo
insert into insumos (nombre, unidad, stock_actual, stock_minimo, costo_unitario) values
  ('Pollo', 'kg', 10.0, 2.0, 80.00),
  ('Lechuga', 'pieza', 20, 5, 8.00),
  ('Tomate', 'kg', 5.0, 1.0, 25.00),
  ('Leche', 'litro', 8.0, 2.0, 22.00),
  ('Café molido', 'kg', 2.0, 0.5, 180.00),
  ('Azúcar', 'kg', 5.0, 1.0, 20.00),
  ('Agua purificada', 'litro', 20.0, 5.0, 5.00);

-- Productos de alimentos
insert into productos (nombre, descripcion, precio, categoria_id)
select 'Ensalada César', 'Lechuga romana, crutones, aderezo césar y parmesano', 85.00, id
from categorias where nombre = 'Entradas' limit 1;

insert into productos (nombre, descripcion, precio, categoria_id)
select 'Pechuga a la plancha', 'Pechuga de pollo con arroz y verduras al vapor', 120.00, id
from categorias where nombre = 'Platillos fuertes' limit 1;

-- Productos de bebidas
insert into productos (nombre, descripcion, precio, categoria_id)
select 'Café americano', 'Café de grano recién molido', 35.00, id
from categorias where nombre = 'Café' limit 1;

insert into productos (nombre, descripcion, precio, categoria_id)
select 'Agua natural 500ml', 'Agua purificada fría', 20.00, id
from categorias where nombre = 'Agua y naturales' limit 1;
