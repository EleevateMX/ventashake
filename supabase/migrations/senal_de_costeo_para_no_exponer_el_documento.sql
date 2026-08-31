-- El aviso de "alguien mas guardo" sin abrir el documento entero.
--
-- Costeos escucha `postgres_changes` sobre `app_data` para avisar cuando
-- otro guarda desde otra maquina. Realtime respeta RLS: si se le cierra
-- `app_data` a anon —que es lo que hay que hacer— ese aviso deja de llegar.
--
-- Asi que el aviso viaja aparte y solo lleva lo que hace falta: quien y
-- cuando. Los costos se quedan donde tienen que estar.
create table if not exists app_data_senales (
  id bigserial primary key,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table app_data_senales enable row level security;

drop policy if exists sel_app_data_senales on app_data_senales;
create policy sel_app_data_senales on app_data_senales
  for select to anon, authenticated using (true);

grant select on app_data_senales to anon, authenticated;

create or replace function fn_app_data_senal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into app_data_senales (updated_by, updated_at)
  values (NEW.updated_by, NEW.updated_at);
  -- Solo interesa lo recien pasado; sin esto la tabla crece para siempre.
  delete from app_data_senales where updated_at < now() - interval '2 hours';
  return NEW;
end $$;

drop trigger if exists trg_app_data_senal on app_data;
create trigger trg_app_data_senal
  after update on app_data
  for each row execute function fn_app_data_senal();

alter publication supabase_realtime add table app_data_senales;
