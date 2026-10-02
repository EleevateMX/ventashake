import Foundation
import Supabase

/// La conexión con el MISMO Supabase que usa la PWA.
///
/// La URL y la llave publicable son públicas por diseño: viajan en el
/// paquete de la web de todas formas. La seguridad está en el servidor
/// (RLS y las funciones), nunca aquí. Nada secreto puede vivir en la app.
enum Config {
    static let supabaseURL = URL(string: "https://zyjtnaystsporbuzcmqk.supabase.co")!
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
