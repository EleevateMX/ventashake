-- Expediente laboral: que papeles debe tener cada quien y cuales entrego.
-- NO genera contratos ni textos legales; esto es control administrativo.
--
-- ⚠ EL BUCKET ES PRIVADO, y es la diferencia que importa. Los otros tres
-- (productos, avatares, evidencias) son PUBLICOS: cualquiera con la URL
-- ve la foto de un shake y no pasa nada. Aqui van actas de nacimiento,
-- INE y CURP de personas reales.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expedientes', 'expedientes', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Solo gerencia. Ni anon, ni la barra: el expediente de un companero no
-- es asunto de quien esta en la caja.
drop policy if exists exp_leer on storage.objects;
drop policy if exists exp_subir on storage.objects;
drop policy if exists exp_cambiar on storage.objects;
drop policy if exists exp_borrar on storage.objects;
create policy exp_leer on storage.objects for select
  using (bucket_id = 'expedientes' and fn_es_jefe());
create policy exp_subir on storage.objects for insert
  with check (bucket_id = 'expedientes' and fn_es_jefe());
create policy exp_cambiar on storage.objects for update
  using (bucket_id = 'expedientes' and fn_es_jefe());
create policy exp_borrar on storage.objects for delete
  using (bucket_id = 'expedientes' and fn_es_jefe());

create table if not exists expediente_requisitos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, descripcion text,
  obligatorio boolean not null default true,
  caduca boolean not null default false,
  orden int not null default 100,
  activo boolean not null default true
);

create table if not exists expediente_documentos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  requisito_id uuid not null references expediente_requisitos(id) on delete cascade,
  -- Puede ir vacio: un papel entregado en fisico se marca sin subir nada.
  archivo_ruta text, archivo_nombre text,
  entregado_en date not null default (now() at time zone 'America/Merida')::date,
  vence_en date, nota text,
  recibido_por uuid references empleados(id),
  actualizado_en timestamptz not null default now(),
  unique (empleado_id, requisito_id)
);

-- Quien abrio el archivo de quien. Con datos personales, saber quien los
-- consulto es parte de cuidarlos: sin bitacora, una fuga no tiene de
-- donde empezar a investigarse.
create table if not exists expediente_accesos (
  id bigserial primary key,
  documento_id uuid not null references expediente_documentos(id) on delete cascade,
  quien uuid references empleados(id),
  cuando timestamptz not null default now()
);

alter table expediente_requisitos enable row level security;
alter table expediente_documentos enable row level security;
alter table expediente_accesos enable row level security;

-- Lista de arranque. Es un punto de partida, NO una recomendacion legal:
-- gerencia la ajusta con su contador.
insert into expediente_requisitos (nombre, descripcion, obligatorio, caduca, orden)
select * from (values
  ('Contrato firmado', 'El que redacto el abogado, firmado por ambas partes', true, false, 10),
  ('Acta de nacimiento', null, true, false, 20),
  ('CURP', null, true, false, 30),
  ('RFC', 'Constancia de situacion fiscal', true, false, 40),
  ('INE', 'Identificacion oficial vigente', true, true, 50),
  ('Numero de Seguridad Social (NSS)', null, true, false, 60),
  ('Alta en el IMSS', 'Comprobante del alta', true, false, 70),
  ('Comprobante de domicilio', 'No mayor a 3 meses al entregarlo', true, false, 80),
  ('Comprobante de estudios', null, false, false, 90),
  ('Certificado medico', null, false, true, 100),
  ('Datos de contacto de emergencia', null, true, false, 110),
  ('Cuenta bancaria para nomina', null, false, false, 120)
) as v(nombre, descripcion, obligatorio, caduca, orden)
where not exists (select 1 from expediente_requisitos);

-- Las funciones (fn_expediente_*) piden GERENCIA y estan cerradas a anon
-- y a PUBLIC. Ver el proyecto para su cuerpo: fn_expediente_requisitos,
-- _requisito_guardar, _de, _marcar, _quitar, _resumen, _registrar_acceso.
