// Edge Function: wallet-pase
//
// Devuelve el pase de Apple Wallet del cliente que llama (su QR SHK-XXXXXX,
// el mismo que lee la caja). Así el código vive en el iPhone y en el Apple
// Watch sin abrir la app: doble clic al botón lateral y listo.
//
// Lo que NO lleva: el saldo de mancuernas. Un pase se actualiza solo con un
// servicio web de registro que no tenemos, y un número viejo en la muñeca
// es peor que ninguno. El saldo se ve en la app; el pase es la identidad.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   WALLET_PASS_CERT          certificado del Pass Type ID, PEM
//   WALLET_PASS_KEY           su llave privada, PEM (opcional: WALLET_PASS_KEY_PASSWORD)
//   WALLET_PASS_TYPE_ID       por omisión pass.mx.shakeaholic.rewards
//   APPLE_TEAM_ID             por omisión 269U859QV3
import { createClient } from 'jsr:@supabase/supabase-js@2'
// Copia de `_shared/cors.ts`: la función se despliega sola, sin la carpeta
// compartida, y una importación relativa hacia arriba se rompe al subirla.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { desdeBase64, firmarPase } from './pkpass.ts'
import { IMAGENES } from './imagenes.ts'
import { WWDR_G4 } from './wwdr.ts'

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
  const certPem = Deno.env.get('WALLET_PASS_CERT')
  const keyPem = Deno.env.get('WALLET_PASS_KEY')
  if (!url || !anon || !servicio) {
    return responder({ ok: false, error: { codigo: 'not_configured', mensaje: 'Falta configuración del servidor.' } }, 500)
  }
  if (!certPem || !keyPem) {
    return responder(
      { ok: false, error: { codigo: 'sin_certificado', mensaje: 'El pase de Wallet todavía no está listo. Pronto.' } },
      503,
    )
  }

  // Quién llama: la sesión del cliente, tal cual viene en Authorization.
  const auth = req.headers.get('Authorization') ?? ''
  const comoCliente = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: errorUsuario } = await comoCliente.auth.getUser()
  if (errorUsuario || !user) {
    return responder({ ok: false, error: { codigo: 'sin_sesion', mensaje: 'Entra a tu cuenta para agregar el pase.' } }, 401)
  }

  const sb = createClient(url, servicio, { auth: { persistSession: false } })
  const { data: cliente, error: errorCliente } = await sb
    .from('clientes')
    .select('id, nombre, codigo, telefono')
    .eq('auth_user_id', user.id)
    .eq('activo', true)
    .maybeSingle()
  if (errorCliente) {
    return responder({ ok: false, error: { codigo: 'error_servidor', mensaje: errorCliente.message } }, 500)
  }
  if (!cliente?.codigo) {
    return responder({ ok: false, error: { codigo: 'sin_tarjeta', mensaje: 'Tu tarjeta todavía no tiene código. Abre la app otra vez.' } }, 404)
  }

  const passTypeId = Deno.env.get('WALLET_PASS_TYPE_ID') ?? 'pass.mx.shakeaholic.rewards'
  const teamId = Deno.env.get('APPLE_TEAM_ID') ?? '269U859QV3'

  const pass = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: cliente.codigo,
    organizationName: 'Shakeaholic',
    description: 'Tarjeta Shakeaholic Rewards',
    // La marca: verde profundo, crema y plátano (packages/brand/tokens.css).
    backgroundColor: 'rgb(26,46,38)',
    foregroundColor: 'rgb(232,230,204)',
    labelColor: 'rgb(240,198,73)',
    sharingProhibited: true,
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: cliente.codigo,
        messageEncoding: 'iso-8859-1',
        altText: cliente.codigo,
      },
    ],
    storeCard: {
      secondaryFields: [{ key: 'nombre', label: 'CLIENTE', value: cliente.nombre }],
      auxiliaryFields: [
        { key: 'codigo', label: 'CÓDIGO', value: cliente.codigo, textAlignment: 'PKTextAlignmentRight' },
      ],
      backFields: [
        {
          key: 'como',
          label: 'Cómo funciona',
          value:
            'Muestra este pase en la barra al pagar y juntas mancuernas en cada compra. ' +
            'Cámbialas por tus favoritos cuando quieras. Tu saldo y tus metas están en la app.',
        },
        ...(cliente.telefono
          ? [{ key: 'telefono', label: 'Teléfono registrado', value: cliente.telefono }]
          : []),
        { key: 'web', label: 'Tu tarjeta en la web', value: 'https://rewards.shakeaholic.mx' },
        { key: 'whatsapp', label: 'WhatsApp', value: 'https://wa.me/529995044797' },
      ],
    },
  }

  const archivos: Record<string, Uint8Array> = {
    'pass.json': new TextEncoder().encode(JSON.stringify(pass)),
  }
  for (const [nombre, b64] of Object.entries(IMAGENES)) archivos[nombre] = desdeBase64(b64)

  let pkpass: Uint8Array
  try {
    pkpass = await firmarPase(archivos, {
      certPem,
      keyPem,
      keyPassword: Deno.env.get('WALLET_PASS_KEY_PASSWORD') || undefined,
      wwdrPem: WWDR_G4,
    })
  } catch (e) {
    return responder({ ok: false, error: { codigo: 'firma', mensaje: `No se pudo firmar el pase: ${(e as Error).message}` } }, 500)
  }

  return new Response(pkpass, {
    status: 200,
    headers: {
      ...corsHeaders,
      'content-type': 'application/vnd.apple.pkpass',
      'content-disposition': 'attachment; filename="shakeaholic.pkpass"',
      'cache-control': 'no-store',
    },
  })
})
