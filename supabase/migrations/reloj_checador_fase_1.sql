-- Reloj checador: se checa en el kiosko, con el PIN de siempre.
--
-- Por que aqui y no por WhatsApp: un checador existe para probar que
-- ALGUIEN ESTUVO AQUI a esta hora. Un mensaje prueba que se mando un
-- mensaje -desde la cama, desde el Uber-. El kiosko ya esta en la barra,
-- prendido, y ya sabe quien es quien por el PIN.
--
-- Cuatro reglas que hacen que el historico valga algo:
--
--  1. **La hora la pone el servidor** (`now()`), nunca la pantalla. Misma
--     regla que el dinero: con la hora del navegador, cambiarle el reloj a
--     la PC bastaria para falsear un turno.
--  2. **Nada se edita ni se borra.** Una correccion es una fila NUEVA que
--     apunta al original, con quien la autorizo y por que. Un historial
--     que se puede editar no es evidencia de nada. Lo impone un trigger,
--     no la buena voluntad.
--  3. **Se guardan EVENTOS, no turnos.** Es la decision mas importante: si
--     guardaramos "turno con entrada y salida", el dia que alguien se va
--     sin checar -y va a pasar- el registro se rompe o hay que inventarle
--     una hora. Con eventos sueltos, un olvido se ve como lo que es: un
--     pendiente, no un dato corrupto. El turno se CALCULA al mostrarlo.
--  4. **Se registra desde que pantalla se checo.** Si una checada viene
--     del navegador de un celular y no del kiosko de la barra, se nota.
--
-- Y NO se cuelga del corte de caja a proposito: quien esta en cocina nunca
-- abre la caja, y amarrarlo al turno de caja lo dejaria sin poder checar.

create table if not exists asistencia_eventos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id),
  tipo text not null check (tipo in ('entrada', 'salida')),
  -- La hora del hecho. La pone el servidor; el cliente no la manda.
  ocurrio_en timestamptz not null default now(),
  -- 'kiosko:a3f2' — la misma idea que el vistazo de ventas apartadas.
  pantalla text,
  origen text not null default 'kiosko' check (origen in ('kiosko', 'admin')),
  nota text,
  -- Una correccion apunta al evento que corrige. El original se queda.
  corrige_evento_id uuid references asistencia_eventos(id),
  autorizado_por uuid references empleados(id),
  creado_en timestamptz not null default now()
);

create index if not exists ix_asistencia_empleado_fecha
  on asistencia_eventos (empleado_id, ocurrio_en desc);
create index if not exists ix_asistencia_fecha
  on asistencia_eventos (ocurrio_en desc);

comment on table asistencia_eventos is
  'Checadas de entrada y salida. Solo se agrega: editar o borrar esta prohibido por trigger.';

-- El candado de "solo se agrega". Sin esto, la regla 2 seria una promesa.
create or replace function public.fn_asistencia_solo_se_agrega()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Una checada no se edita ni se borra. Registra una correccion.';
end;
$function$;

drop trigger if exists trg_asistencia_solo_se_agrega on asistencia_eventos;
create trigger trg_asistencia_solo_se_agrega
  before update or delete on asistencia_eventos
  for each row execute function public.fn_asistencia_solo_se_agrega();

-- Nadie escribe ni lee la tabla directo: todo pasa por las funciones de
-- abajo, que son las que ponen la hora y validan el PIN.
alter table asistencia_eventos enable row level security;
