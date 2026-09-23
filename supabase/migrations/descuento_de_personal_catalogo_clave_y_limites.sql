-- Descuento de personal: precio especial, limite diario y clave propia.
--
-- Tres decisiones que ordenan todo lo demas:
--
-- 1. **El precio de personal vive en el PRODUCTO**, no en una tabla de
--    reglas por categoria. La lista que mando gerencia es por categoria
--    ("Sandwiches -> $99"), pero las excepciones existen desde el dia uno
--    (El Clasico no vale lo que los demas shakes) y una regla con
--    excepciones es una tabla de excepciones esperando a nacer. Se siembra
--    por categoria y despues se toca producto por producto desde Admin.
--
-- 2. **Lo que consume el limite diario tambien vive en el producto**
--    (`grupo_personal`), y es independiente del precio. Un producto puede
--    tener precio de personal y no consumir lugar, o al reves. Sin esta
--    separacion, "1 shake + 1 alimento + 1 bebida" hay que deducirlo del
--    nombre de la categoria, y el dia que se cree "Shakes de temporada"
--    deja de contar sin que nadie se entere.
--
-- 3. **Un producto sin `precio_personal` se cobra COMPLETO.** Ese es el
--    valor por omision para todo el catalogo, incluidos los boosters, los
--    extras, las leches vegetales y los combos — que es justo lo que pidio
--    gerencia. Que el beneficio sea la excepcion y no la regla es lo que
--    hace que un producto nuevo no nazca regalado.

alter table productos
  add column if not exists precio_personal numeric,
  add column if not exists grupo_personal text;

alter table productos drop constraint if exists productos_grupo_personal_check;
alter table productos add constraint productos_grupo_personal_check
  check (grupo_personal is null or grupo_personal in ('shake', 'alimento', 'bebida'));

comment on column productos.precio_personal is
  'Precio para el personal. Null = se cobra completo, que es el valor por omision.';
comment on column productos.grupo_personal is
  'Que lugar del limite diario consume: shake, alimento o bebida. Null = ninguno.';

-- La clave es de cada quien, aparte del PIN de caja. Se guarda con bcrypt
-- igual que el PIN: en la base no queda el numero, queda su huella.
alter table empleados
  add column if not exists clave_personal_hash text,
  add column if not exists beneficio_personal boolean not null default true;

-- Las reglas, editables por gerencia. Nacen con lo que pidieron.
create table if not exists personal_config (
  id text primary key default 'default' check (id = 'default'),
  tope_diario numeric not null default 263,
  max_shake int not null default 1,
  max_alimento int not null default 1,
  max_bebida int not null default 1,
  -- El beneficio es de quien esta trabajando: se exige turno abierto en el
  -- checador. La gracia cubre "al terminar su turno", que fue el pedido
  -- textual — checa salida, se sienta y se toma su shake.
  exige_turno boolean not null default true,
  gracia_min int not null default 60,
  actualizado_en timestamptz not null default now()
);
insert into personal_config (id) values ('default') on conflict (id) do nothing;
alter table personal_config enable row level security;

-- El historial. Una fila por renglon beneficiado, con el dia de MERIDA
-- ya resuelto: el limite es diario y "el dia" del negocio no es el de UTC.
create table if not exists personal_consumos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id),
  orden_id uuid not null references ordenes(id),
  dia date not null,
  grupo text not null,
  producto_id uuid references productos(id),
  producto text not null,
  cantidad int not null,
  -- Lo que CUENTA para el tope: el precio de personal del producto base.
  -- Los extras se cobran normal y no entran aqui.
  importe_personal numeric not null,
  precio_publico numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_personal_consumos_dia on personal_consumos (empleado_id, dia);
create index if not exists ix_personal_consumos_orden on personal_consumos (orden_id);
alter table personal_consumos enable row level security;

-- Misma regla que el checador y que la bitacora de cancelaciones: un
-- historial que se puede editar no prueba nada.
create or replace function public.fn_personal_consumos_solo_se_agregan()
returns trigger language plpgsql as $function$
begin
  raise exception 'El historial de consumos de personal no se edita ni se borra.';
end;
$function$;

drop trigger if exists trg_personal_consumos_solo_se_agregan on personal_consumos;
create trigger trg_personal_consumos_solo_se_agregan
  before update or delete on personal_consumos
  for each row execute function public.fn_personal_consumos_solo_se_agregan();
