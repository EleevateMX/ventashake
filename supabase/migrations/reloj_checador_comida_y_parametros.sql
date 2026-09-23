-- La comida se checa, y las reglas las escribe gerencia.
--
-- Cuatro tipos de checada en vez de dos. Y con cuatro, deducir sola cual
-- toca deja de ser seguro: por eso la pantalla PREGUNTA al servidor en
-- que estado esta cada quien (fn_asistencia_estado) y solo ofrece los
-- botones que tienen sentido. Un boton de "salir a comer" para alguien
-- que ni ha entrado es un dato malo esperando a que alguien lo toque.
alter table asistencia_eventos drop constraint if exists asistencia_eventos_tipo_check;
alter table asistencia_eventos add constraint asistencia_eventos_tipo_check
  check (tipo in ('entrada', 'salida', 'inicio_comida', 'fin_comida'));

-- Las variables del checador, editables desde Admin -> Asistencia ->
-- Reglas. Estaban escritas dentro de la funcion (las 16 horas del turno
-- colgado) y cambiarlas obligaba a desplegar.
create table if not exists asistencia_config (
  id text primary key default 'default' check (id = 'default'),
  -- Informativos por ahora: para decir "llego tarde" hace falta un
  -- HORARIO por persona, que es otra cosa y todavia no existe.
  jornada_min int not null default 480,
  tolerancia_min int not null default 10,
  -- Cuanto deberia durar la comida, y si esos minutos se pagan. Si no se
  -- pagan, se restan del turno al calcular las horas trabajadas. Esta es
  -- LA casilla que mueve el numero de la nomina.
  comida_min int not null default 30,
  comida_se_paga boolean not null default false,
  comida_max_min int not null default 90,
  -- Una entrada mas vieja que esto ya no cuenta como turno abierto: es de
  -- ayer y se olvido checar salida.
  turno_max_horas int not null default 16,
  actualizado_en timestamptz not null default now()
);

insert into asistencia_config (id) values ('default') on conflict (id) do nothing;
alter table asistencia_config enable row level security;

create or replace function public.fn_asistencia_config()
returns asistencia_config
language sql stable security definer set search_path to 'public'
as $function$
  select c.* from asistencia_config c where c.id = 'default' and fn_es_staff();
$function$;

revoke execute on function public.fn_asistencia_config() from public;
revoke execute on function public.fn_asistencia_config() from anon;

create or replace function public.fn_asistencia_config_guardar(
  p_jornada_min int, p_tolerancia_min int, p_comida_min int,
  p_comida_se_paga boolean, p_comida_max_min int, p_turno_max_horas int
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las reglas del checador.';
  end if;
  -- Topes de cordura: un turno maximo de 200 horas o una comida negativa
  -- no son configuraciones, son errores de dedo que ensucian el historico.
  if p_turno_max_horas not between 4 and 24 then
    raise exception 'El turno maximo va entre 4 y 24 horas.';
  end if;
  if p_comida_min < 0 or p_comida_max_min < p_comida_min then
    raise exception 'Revisa los minutos de comida: el maximo no puede ser menor que lo esperado.';
  end if;
  if p_jornada_min not between 60 and 1440 or p_tolerancia_min not between 0 and 120 then
    raise exception 'Revisa la jornada y la tolerancia.';
  end if;

  update asistencia_config set
    jornada_min = p_jornada_min, tolerancia_min = p_tolerancia_min,
    comida_min = p_comida_min, comida_se_paga = p_comida_se_paga,
    comida_max_min = p_comida_max_min, turno_max_horas = p_turno_max_horas,
    actualizado_en = now()
  where id = 'default';
end;
$function$;

revoke execute on function public.fn_asistencia_config_guardar(int, int, int, boolean, int, int) from public;
revoke execute on function public.fn_asistencia_config_guardar(int, int, int, boolean, int, int) from anon;
