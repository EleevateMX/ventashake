import Foundation
import Security
import LocalAuthentication

/// La sesión de personal, guardada en el llavero del iPhone bajo biometría.
///
/// Sin Face ID (o Touch ID) el dato no se puede leer: ni la app, ni otra
/// app, ni quien tenga el teléfono desbloqueado. Y `biometryCurrentSet`
/// hace que si alguien agrega otra cara al teléfono, el dato se invalide
/// solo. Es lo que permite «abrir con Face ID» sin volver a dejar una
/// sesión de gerencia suelta en un teléfono prestado.
enum Llavero {
    private static let servicio = "mx.shakeaholic.rewards.personal"
    private static let cuenta = "sesion"
    private static let bandera = "personal.faceid"

    enum Falla: Error { case cancelado, noDisponible, otro(OSStatus) }

    /// Hay algo guardado (sin pedir la cara: solo la bandera).
    static var tieneSesion: Bool { UserDefaults.standard.bool(forKey: bandera) }

    static func guardar(_ datos: Data) throws {
        borrar()
        var error: Unmanaged<CFError>?
        guard let acceso = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, &error
        ) else { throw Falla.noDisponible }
        let consulta: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta,
            kSecAttrAccessControl as String: acceso,
            kSecValueData as String: datos,
        ]
        let estado = SecItemAdd(consulta as CFDictionary, nil)
        guard estado == errSecSuccess else { throw Falla.otro(estado) }
        UserDefaults.standard.set(true, forKey: bandera)
    }

    /// Pide la cara y devuelve lo guardado. `nil` si no hay nada.
    static func leer(motivo: String) throws -> Data? {
        let contexto = LAContext()
        contexto.localizedReason = motivo
        let consulta: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: contexto,
        ]
        var salida: CFTypeRef?
        let estado = SecItemCopyMatching(consulta as CFDictionary, &salida)
        switch estado {
        case errSecSuccess: return salida as? Data
        case errSecItemNotFound: UserDefaults.standard.set(false, forKey: bandera); return nil
        case errSecUserCanceled, errSecAuthFailed: throw Falla.cancelado
        default: throw Falla.otro(estado)
        }
    }

    static func borrar() {
        let consulta: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta,
        ]
        SecItemDelete(consulta as CFDictionary)
        UserDefaults.standard.set(false, forKey: bandera)
    }

    /// ¿El teléfono tiene Face ID o Touch ID listo?
    static var biometriaDisponible: Bool {
        var e: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &e)
    }
}
