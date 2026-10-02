import SwiftUI
import UserNotifications
import Supabase

/// Avisos push. La app solo hace dos cosas: pedir permiso (en un momento que
/// tenga sentido, no al abrir) y registrar el token con la sesión. Quién
/// recibe qué lo decide el servidor (`push_cola`), y quien habla con Apple
/// es la Edge Function `push-cola`.
final class Push: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static let shared = Push()
    private(set) var token: String?
    private let llaveToken = "push.token"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        token = UserDefaults.standard.string(forKey: llaveToken)
        return true
    }

    /// Se llama cuando ya hay tarjeta en pantalla: la primera vez pide
    /// permiso; después solo registra el token si Apple lo cambió.
    @MainActor
    func activar() async {
        let centro = UNUserNotificationCenter.current()
        let ajustes = await centro.notificationSettings()
        switch ajustes.authorizationStatus {
        case .notDetermined:
            guard (try? await centro.requestAuthorization(options: [.alert, .sound, .badge])) == true else { return }
        case .denied:
            return
        default:
            break
        }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        token = hex
        UserDefaults.standard.set(hex, forKey: llaveToken)
        Task { await Self.registrar(hex) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // En el simulador no hay APNs: no es un error que valga la pena enseñar.
    }

    static func registrar(_ token: String) async {
        #if DEBUG
        let entorno = "sandbox"
        #else
        let entorno = "production"
        #endif
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        _ = try? await supabase.rpc(
            "fn_push_registrar",
            params: ParamPush(p_token: token, p_entorno: entorno, p_version: version)
        ).execute()
    }

    /// Al cerrar sesión el teléfono deja de ser de esa cuenta.
    static func quitar() async {
        guard let t = shared.token else { return }
        _ = try? await supabase.rpc("fn_push_quitar", params: ParamToken(p_token: t)).execute()
    }

    /// Con la app abierta el aviso también se enseña (arriba, como banner).
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }
}

struct ParamPush: Encodable, Sendable { let p_token: String; let p_entorno: String; let p_version: String? }
struct ParamToken: Encodable, Sendable { let p_token: String }
