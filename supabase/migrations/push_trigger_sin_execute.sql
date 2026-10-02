-- La función del trigger de push nació con el EXECUTE que Supabase le da
-- por omisión a toda función nueva. No se puede invocar por HTTP (devuelve
-- `trigger`, PostgREST contesta 404), pero sale en los avisos de seguridad
-- como "abierta a anon" y confunde. Se cierra para que la lista diga la
-- verdad. Misma lección que CLAUDE.md §4: revocar a anon Y a PUBLIC.
revoke execute on function public.fn_push_encolar_mancuernas() from anon, authenticated, public;
