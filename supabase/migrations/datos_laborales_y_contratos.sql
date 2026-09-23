-- Datos laborales y generador de contratos.
--
-- ⚠ El sistema NO redacta el contrato. El texto legal lo escribe o lo
-- revisa un abogado y vive en `contrato_plantillas`; el codigo solo
-- rellena variables y hace que el documento concuerde en genero. Un
-- contrato mal redactado es peor que no tener uno: en una junta una
-- clausula invalida no protege y si puede usarse en contra. La plantilla
-- que viene de fabrica esta marcada como BORRADOR a proposito.
--
-- Los datos van en tabla aparte y no en `empleados` porque `empleados` es
-- lo que el POS lee en cada login -nombre, rol, PIN- y no tiene por que
-- cargar el salario de nadie en cada arranque del kiosko.
create table if not exists empleado_laboral (
  empleado_id uuid primary key references empleados(id) on delete cascade,
  -- Solo para la concordancia del documento. 'x' escribe en neutro, y el
  -- neutro NO usa diagonal: "trabajador/a" obliga a tachar una de las dos
  -- con pluma en algo que se va a firmar.
  genero text not null default 'x' check (genero in ('m', 'f', 'x')),
  nombre_completo text, puesto text,
  salario_diario numeric(10,2),
  fecha_ingreso date,
  tipo_contrato text default 'indeterminado',
  jornada text,
  -- Los que asigna Shakeaholic. 0 = domingo, 6 = sabado.
  dias_descanso int[] not null default '{}',
  actualizado_en timestamptz not null default now()
);

create table if not exists contrato_plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, cuerpo text not null,
  activa boolean not null default true,
  actualizado_en timestamptz not null default now()
);

-- Lo generado se CONGELA: si manana cambia la plantilla o el salario, el
-- contrato que ya se imprimio y se firmo no debe cambiar con ellos.
create table if not exists contratos_generados (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  plantilla_id uuid references contrato_plantillas(id),
  cuerpo_final text not null,
  generado_en timestamptz not null default now(),
  generado_por uuid references empleados(id)
);

alter table empleado_laboral enable row level security;
alter table contrato_plantillas enable row level security;
alter table contratos_generados enable row level security;

create index if not exists ix_contratos_empleado
  on contratos_generados (empleado_id, generado_en desc);

-- Las funciones (fn_laboral_*, fn_contrato_*) piden GERENCIA y estan
-- cerradas a anon y a PUBLIC. El llenado de variables y la concordancia
-- viven en packages/utils/src/contratos.ts, con pruebas.
