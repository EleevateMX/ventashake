// Edge Function: cuenta-eliminar
//
// Borra la cuenta de quien llama (la App Store exige que la app lo ofrezca:
// guideline 5.1.1). Dos cosas, en este orden:
//
//   1. El expediente del cliente se ANONIMIZA, no se borra: las ventas y los
//      movimientos de mancuernas son historia del negocio (cortes, cierres,
//      inventario) y apuntan a esa fila. Queda sin nombre, sin teléfono, sin
//      correo, sin foto, inactiva y sin cuenta de Auth ligada.
//   2. El usuario de Auth se borra de verdad (service_role). Con eso ya no
//      puede entrar ni con Apple ni con Google; si vuelve, nace de cero.
//
// Las mancuernas que tenía se pierden con la cuenta: el aviso de la app lo
// dice antes de confirmar.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !servicio) {
    return responder({ ok: false, error: { codigo: 'not_configured', mensaje: 'Falta configuración del servidor.' } }, 500)
  }

  const auth = req.headers.get('Authorization') ?? ''
  const comoCliente = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: errorUsuario } = await comoCliente.auth.getUser()
  if (errorUsuario || !user) {
    return responder({ ok: false, error: { codigo: 'sin_sesion', mensaje: 'Entra a tu cuenta para borrarla.' } }, 401)
  }

  const sb = createClient(url, servicio, { auth: { persistSession: false } })

  // El personal entra por PIN con una cuenta técnica (emp-…@staff): esa no
  // se borra desde aquí, la administra gerencia.
  const { data: empleado } = await sb.from('empleados').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (empleado) {
    return responder({ ok: false, error: { codigo: 'es_personal', mensaje: 'Las cuentas del personal se dan de baja desde Admin.' } }, 403)
  }

  const { error: errorAnon } = await sb
    .from('clientes')
    .update({
      nombre: 'Cuenta eliminada',
      telefono: null,
      email: null,
      notas: null,
      foto_url: null,
      foto_propia: false,
      fecha_nacimiento: null,
      sabor_favorito: null,
      activo: false,
      auth_user_id: null,
    })
    .eq('auth_user_id', user.id)
  if (errorAnon) {
    return responder({ ok: false, error: { codigo: 'error_expediente', mensaje: errorAnon.message } }, 500)
  }

  const { error: errorAuth } = await sb.auth.admin.deleteUser(user.id)
  if (errorAuth) {
    return responder({ ok: false, error: { codigo: 'error_auth', mensaje: errorAuth.message } }, 500)
  }

  return responder({ ok: true })
})
