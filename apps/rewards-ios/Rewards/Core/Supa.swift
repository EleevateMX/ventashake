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

    /// El esquema con el que el login de Google vuelve a la app.
    static let vueltaLogin = URL(string: "mx.shakeaholic.rewards://auth")!

    /// A dónde le pide la app a Supabase que regrese el login de Google
    /// (17/11/26). Supabase solo regresa a direcciones de su lista, y el
    /// esquema de la app no estaba: el login terminaba en la web. Esta página
    /// vive en el mismo dominio que la web (Supabase la acepta siempre) y
    /// reenvía el `?code=` a `vueltaLogin`, que la ventana de login intercepta.
    static let puenteLogin = URL(string: "https://rewards.shakeaholic.mx/volver-app/")!

    static let whatsapp = URL(string: "https://wa.me/529995044797")!
    static let web = URL(string: "https://rewards.shakeaholic.mx")!
}

let supabase = SupabaseClient(
    supabaseURL: Config.supabaseURL,
    supabaseKey: Config.llavePublicable
)
