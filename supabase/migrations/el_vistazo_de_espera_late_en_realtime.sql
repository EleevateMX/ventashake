-- Admin -> En vivo se suscribe a esta tabla para repintarse sola. Sin
-- meterla a la publicacion, el canal se suscribe y no llega nada nunca:
-- no falla, simplemente no se entera, y quedaria dependiendo del refresco
-- de respaldo cada tantos segundos. Realtime respeta RLS, y la politica
-- de esta tabla ya exige `fn_es_staff()`.
alter publication supabase_realtime add table public.ventas_en_espera_vistazo;
