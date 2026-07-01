# Kiosko de autoservicio (fase 5–6)

Se migrará desde el repo `puntodeventa`. Igual que el POS pero con
`canal: 'kiosko'` y sin manejo de efectivo (solo Clip/tarjeta).
Consume `@shake/supabase`; el catálogo sale de `productos` con
`imagen_url` y categorías activas.
