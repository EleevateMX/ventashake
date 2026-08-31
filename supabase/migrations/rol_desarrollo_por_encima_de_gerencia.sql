-- Una puerta que gerencia no puede abrir.
--
-- Hasta hoy "soporte" era el rol `admin`, que se llama "Administrador" —
-- justo el permiso por encima del cual hay que estar— y que ademas NO LO
-- TENIA NADIE: la consola de Soporte no la podia abrir ni quien la
-- mantiene. Se cambia por un rol propio, `desarrollo`, que no es un puesto
-- del negocio y que gerencia no puede repartirse (ver la migracion de
-- empleados).
--
-- Orden a proposito: PRIMERO el rol existe y pasa por todos lados, DESPUES
-- se cierran las funciones. Al reves, la cuenta nueva nace sin poder hacer
-- nada.

insert into roles (slug, nombre)
select 'desarrollo', 'Desarrollo'
where not exists (select 1 from roles where slug = 'desarrollo');

-- Desarrollo puede todo lo que gerencia, y ademas lo suyo.
create or replace function fn_es_jefe()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(fn_rol_staff() in ('admin', 'administrador', 'gerente', 'desarrollo'), false)
$$;

-- Y esto ya no es "administrador": es quien mantiene el sistema. Gerencia
-- —los duenos— queda fuera a proposito.
create or replace function fn_es_soporte()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(fn_rol_staff() = 'desarrollo', false)
$$;
