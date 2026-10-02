import Foundation
import Supabase

/// La conexión con el MISMO Supabase que usa la PWA.
///
/// La URL y la llave publicable son públicas por diseño: viajan en el
/// paquete de la web de todas formas. La seguridad está en el servidor
/// (RLS y las funciones), nunca aquí. Nada secreto puede vivir en la app.
enum Config {
    /// El dominio propio del proyecto (Custom Domain de Supabase), el mismo
    /// que usa la PWA (`packages/supabase/src/client.ts`). Importa por una
    /// razón visible: el aviso de iOS al entrar con Google dice «quiere
    /// utilizar api.shakeaholic.mx» en vez del id del proyecto.
    static let supabaseURL = URL(string: "https://api.shakeaholic.mx")!
    static let llavePublicable = "sb_publishable_cMUhN7qNUY_AY-E4U1dCnw_fR_C9sOb"

    /// El esquema con el que Supabase devuelve el login de Google a la app.
    /// Es el mismo que ya está registrado en Supabase → Redirect URLs.
    static let vueltaLogin = URL(string: "mx.shakeaholic.rewards://auth")!

    static let whatsapp = URL(string: "https://wa.me/529995044797")!
    static let web = URL(string: "https://rewards.shakeaholic.mx")!
}

let supabase = SupabaseClient(
    supabaseURL: Config.supabaseURL,
    supabaseKey: Config.llavePublicable
)
