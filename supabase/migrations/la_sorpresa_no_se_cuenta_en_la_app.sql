-- El cliente deja de ver la cuenta regresiva.
--
-- Hasta hoy la app le decia "3/13" y "Te faltan 10 para tu bebida GRATIS",
-- con los trece circulitos pintados. Eso convierte el premio en una deuda
-- que el negocio anuncia: el cliente sabe exactamente cuanto le falta,
-- sabe que es gratis, y el dia que lo cobra no hay sorpresa que dar --
-- solo una cuenta que se salda.
--
-- Lo que se pidio es lo contrario: no decir "gratis" ni cuantas faltan, y
-- cerca del final soltar un guino. El premio se entrega igual; lo que
-- cambia es que se descubre, no se reclama.
--
-- **Por eso el numero sale del SERVIDOR, no solo de la pantalla.** Si
-- `faltan` siguiera viajando en el JSON, cualquiera lo lee en el inspector
-- del navegador y la sorpresa seguiria destripada para quien sepa mirar.
-- Esconderlo en el frontend habria sido teatro.
--
-- El personal SI sigue viendo el numero exacto: `fn_rewards_para_caja` y
-- `fn_rewards_admin` no se tocan. Quien entrega el premio tiene que saber.

alter table public.config_sellos
  add column if not exists nombre text,
  add column if not exists aviso_desde integer not null default 2,
  add column if not exists aviso_texto text,
  add column if not exists aviso_listo_texto text;

comment on column public.config_sellos.aviso_desde is
  'A cuantas compras del premio empieza el guino. 2 = aparece en la 11 de 13. 0 lo apaga.';
comment on column public.config_sellos.aviso_texto is
  'Lo que dice la app cuando ya esta cerca. Admite {faltan} si el dueno quiere ser explicito; por omision NO lo usa.';
comment on column public.config_sellos.aviso_listo_texto is
  'Lo que dice cuando la tarjeta ya se lleno. Tampoco dice que es ni que es gratis.';

update public.config_sellos set
  nombre = case tipo when 'bebida' then 'Bebidas' when 'alimento' then 'Comida' else initcap(tipo) end
where nombre is null;

update public.config_sellos set
  aviso_texto = 'Con un par de visitas más, quizá te llegue una sorpresa.'
where aviso_texto is null;

update public.config_sellos set
  aviso_listo_texto = 'Tienes una sorpresa esperándote. Pregúntanos en caja.'
where aviso_listo_texto is null;
