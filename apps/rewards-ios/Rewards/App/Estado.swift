import Foundation
import Supabase
import AuthenticationServices
import CryptoKit

/// La sesión y el expediente del cliente. Un solo objeto para toda la app,
/// igual que `sincronizar()` en la PWA: sesión → vincular → resumen.
@MainActor
final class Estado: ObservableObject {
    enum Fase { case arrancando, sinSesion, cargando, lista }

    @Published var fase: Fase = .arrancando
    @Published var resumen: Resumen?
    @Published var metas: [Meta] = []
    @Published var menu: [Producto]?
    @Published var error: String?

    /// El nonce del login de Apple: se manda cifrado a Apple y en claro a
    /// Supabase, que comprueba que los dos empatan.
    private var nonceApple: String?
    /// Apple da el nombre SOLO la primera vez que alguien entra. Se guarda
    /// para mandarlo a `fn_vincular_cliente_auth` en esa misma vuelta.
    private var nombreApple: String?

    func arrancar() async {
        if (try? await supabase.auth.session) != nil {
            await sincronizar()
        } else {
            fase = .sinSesion
        }
        Task { await cargarMenu() }
        for await (evento, sesion) in supabase.auth.authStateChanges {
            switch evento {
            case .signedIn:
                await sincronizar()
            case .signedOut:
                resumen = nil
                metas = []
                fase = .sinSesion
            default:
                if sesion == nil, fase == .lista { fase = .sinSesion }
            }
        }
    }

    /// Trae el expediente. Al recién entrar la sesión tarda un instante en
    /// asentarse: los primeros tropiezos se reintentan en silencio, como en
    /// la PWA (un rojo que se va solo en un segundo alarma por nada).
    func sincronizar(intento: Int = 0) async {
        if resumen == nil { fase = .cargando }
        do {
            let sesion = try await supabase.auth.session
            let nombre = nombreApple ?? Self.nombreDe(sesion.user)
            _ = try await supabase.rpc("fn_vincular_cliente_auth", params: ParamNombre(p_nombre: nombre)).execute()
            nombreApple = nil
            let r: Resumen = try await supabase.rpc("fn_mi_resumen_lealtad").execute().value
            resumen = r
            let lasMetas: [Meta]? = try? await supabase.rpc("fn_mis_metas").execute().value
            metas = lasMetas ?? []
            error = nil
            fase = .lista
        } catch {
            if intento < 2 {
                try? await Task.sleep(nanoseconds: 700_000_000)
                await sincronizar(intento: intento + 1)
                return
            }
            if (try? await supabase.auth.session) == nil {
                fase = .sinSesion
            } else {
                self.error = Self.amable(error)
                fase = resumen == nil ? .sinSesion : .lista
            }
        }
    }

    func cargarMenu() async {
        var todos: [Producto] = []
        var desde = 0
        let pagina = 1000
        // PostgREST corta en 1000 sin avisar (CLAUDE.md): se pagina, con el
        // orden rematado en id para no saltar renglones.
        do {
            while true {
                let lote: [Producto] = try await supabase
                    .from("productos")
                    .select("id,nombre,descripcion,precio,orden,imagen_url,categorias(nombre,orden)")
                    .eq("activo", value: true)
                    .eq("es_extra", value: false)
                    .order("orden")
                    .order("nombre")
                    .order("id")
                    .range(from: desde, to: desde + pagina - 1)
                    .execute()
                    .value
                todos += lote
                if lote.count < pagina { break }
                desde += pagina
            }
            menu = todos
        } catch {
            if menu == nil { menu = [] }
        }
    }

    // MARK: Entrar y salir

    func entrarConGoogle() async {
        do {
            // supabase-swift abre la ventana de Google con
            // ASWebAuthenticationSession y recibe la vuelta por el esquema.
            _ = try await supabase.auth.signInWithOAuth(provider: .google, redirectTo: Config.vueltaLogin)
        } catch {
            if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { return }
            self.error = Self.amable(error)
        }
    }

    /// Prepara la petición del botón de Apple.
    func pedirApple(_ peticion: ASAuthorizationAppleIDRequest) {
        let nonce = Self.nonceAleatorio()
        nonceApple = nonce
        peticion.requestedScopes = [.fullName, .email]
        peticion.nonce = Self.sha256(nonce)
    }

    func terminarApple(_ resultado: Result<ASAuthorization, Error>) async {
        switch resultado {
        case .failure(let e):
            if let codigo = (e as? ASAuthorizationError)?.code {
                switch codigo {
                case .canceled:
                    return
                case .unknown:
                    // Sin cuenta de Apple en el teléfono (o en el simulador),
                    // Apple no abre la hoja: contesta 1000 "unknown".
                    error = "Para entrar con Apple, inicia sesión con tu cuenta de Apple en Configuración e intenta otra vez."
                default:
                    error = "Apple no pudo completar el inicio de sesión. Intenta otra vez o entra con Google."
                }
                return
            }
            error = Self.amable(e)
        case .success(let autorizacion):
            guard
                let credencial = autorizacion.credential as? ASAuthorizationAppleIDCredential,
                let datos = credencial.identityToken,
                let token = String(data: datos, encoding: .utf8),
                let nonce = nonceApple
            else {
                error = "Apple no devolvió la credencial. Intenta otra vez."
                return
            }
            if let n = credencial.fullName {
                let completo = [n.givenName, n.familyName].compactMap { $0 }.joined(separator: " ")
                if !completo.isEmpty { nombreApple = completo }
            }
            do {
                _ = try await supabase.auth.signInWithIdToken(
                    credentials: OpenIDConnectCredentials(provider: .apple, idToken: token, nonce: nonce)
                )
            } catch {
                self.error = Self.amable(error)
            }
        }
    }

    func salir() async {
        try? await supabase.auth.signOut()
    }

    // MARK: Acciones de la tarjeta

    func cobrarMeta(_ meta: Meta) async -> String {
        do {
            let r: ResultadoMeta = try await supabase.rpc("fn_meta_automatica", params: ParamClave(p_clave: meta.clave)).execute().value
            await sincronizar()
            if r.acreditada {
                Tacto.exito()
                return "¡Listo! +\(Int(r.mancuernas ?? meta.mancuernas)) mancuernas"
            }
            return r.motivo ?? "Esta meta todavía no se puede cobrar."
        } catch {
            Tacto.error()
            return Self.amable(error)
        }
    }

    func canjearTarjeta(_ codigo: String) async -> String {
        let limpio = codigo.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        do {
            let r: TarjetaCanjeada = try await supabase.rpc(
                "fn_canjear_tarjeta", params: ParamTarjeta(p_codigo: limpio, p_cliente_id: nil)
            ).execute().value
            await sincronizar()
            Tacto.exito()
            return "Se cargaron \(Int(r.cargadas)) mancuernas a tu cuenta."
        } catch {
            Tacto.error()
            return Self.amable(error)
        }
    }

    func guardarTelefono(_ telefono: String) async -> String? {
        let limpio = telefono.filter(\.isNumber)
        guard limpio.count == 10 else { return "Escribe los 10 dígitos." }
        do {
            _ = try await supabase.rpc("fn_mi_telefono_guardar", params: ParamTelefono(p_telefono: limpio)).execute()
            await sincronizar()
            return nil
        } catch {
            return Self.amable(error)
        }
    }

    // MARK: Ayudas

    private static func nombreDe(_ usuario: User) -> String? {
        for llave in ["full_name", "name"] {
            if case let .string(s)? = usuario.userMetadata[llave], !s.isEmpty { return s }
        }
        return usuario.email
    }

    /// El mensaje de Postgres tal cual suele ser legible ("Esa tarjeta ya
    /// se canjeó"); lo técnico se cambia por algo que el cliente entienda.
    static func amable(_ error: Error) -> String {
        let texto = (error as? PostgrestError)?.message ?? error.localizedDescription
        if texto.localizedCaseInsensitiveContains("network") || texto.localizedCaseInsensitiveContains("offline")
            || texto.localizedCaseInsensitiveContains("internet") {
            return "Sin conexión. Revisa tu internet e intenta otra vez."
        }
        return texto
    }

    private static func nonceAleatorio(_ largo: Int = 32) -> String {
        let letras = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var resultado = ""
        var generador = SystemRandomNumberGenerator()
        while resultado.count < largo {
            resultado.append(letras[Int(generador.next() % UInt64(letras.count))])
        }
        return resultado
    }

    private static func sha256(_ texto: String) -> String {
        SHA256.hash(data: Data(texto.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
