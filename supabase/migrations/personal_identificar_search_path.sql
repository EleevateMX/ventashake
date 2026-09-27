-- crypt() vive en el esquema extensions. fn_personal_identificar nacio con
-- search_path = public y reventaba con "function crypt(text, text) does not
-- exist" en cuanto alguien tecleaba una clave (27/09, primera clave real:
-- hasta que el kiosko tuvo pad numerico no habia forma de escribirla).
alter function public.fn_personal_identificar(text) set search_path to 'public', 'extensions';
