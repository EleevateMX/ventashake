import SwiftUI
import PassKit
import Supabase

/// «Agregar a Apple Wallet»: el QR del cliente en el iPhone y en el Apple
/// Watch sin abrir la app (doble clic al botón lateral).
///
/// El pase lo arma y lo firma el servidor (`wallet-pase`): el certificado
/// del Pass Type ID no puede vivir en la app. Aquí solo se pide, se recibe
/// el `.pkpass` y se le entrega a Wallet con la hoja de Apple, que es la que
/// pregunta «¿Agregar?» y la que lo manda al reloj.
@MainActor
final class Wallet: ObservableObject {
    @Published var pase: PaseParaAgregar?
    @Published var error: String?
    @Published var trabajando = false

    static var disponible: Bool { PKAddPassesViewController.canAddPasses() }

    func pedir() async {
        trabajando = true
        defer { trabajando = false }
        error = nil
        do {
            let datos: Data = try await supabase.functions.invoke("wallet-pase") { data, _ in data }
            pase = PaseParaAgregar(pase: try PKPass(data: datos))
        } catch let FunctionsError.httpError(_, data) {
            Tacto.error()
            error = Self.mensaje(de: data) ?? "No se pudo preparar el pase. Intenta otra vez."
        } catch {
            Tacto.error()
            self.error = Estado.amable(error)
        }
    }

    private static func mensaje(de datos: Data) -> String? {
        struct Falla: Decodable { struct E: Decodable { var mensaje: String? }; var error: E? }
        return (try? JSONDecoder().decode(Falla.self, from: datos))?.error?.mensaje
    }
}

struct PaseParaAgregar: Identifiable {
    let id = UUID()
    let pase: PKPass
}

/// El botón oficial de Apple («Agregar a Apple Wallet»), que es el que
/// exige la guía de Wallet: no se dibuja uno propio.
struct BotonWallet: UIViewRepresentable {
    let accion: () -> Void

    func makeUIView(context: Context) -> PKAddPassButton {
        let boton = PKAddPassButton(addPassButtonStyle: .blackOutline)
        boton.addTarget(context.coordinator, action: #selector(Coordinador.tocar), for: .touchUpInside)
        boton.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return boton
    }

    func updateUIView(_ uiView: PKAddPassButton, context: Context) {}
    func makeCoordinator() -> Coordinador { Coordinador(accion: accion) }

    final class Coordinador: NSObject {
        let accion: () -> Void
        init(accion: @escaping () -> Void) { self.accion = accion }
        @objc func tocar() { accion() }
    }
}

/// La hoja de Apple que enseña el pase y pregunta si se agrega.
struct AgregarAWallet: UIViewControllerRepresentable {
    let pase: PKPass
    let alTerminar: () -> Void

    func makeUIViewController(context: Context) -> UIViewController {
        guard let vc = PKAddPassesViewController(pass: pase) else { return UIViewController() }
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
    func makeCoordinator() -> Coordinador { Coordinador(alTerminar: alTerminar) }

    final class Coordinador: NSObject, PKAddPassesViewControllerDelegate {
        let alTerminar: () -> Void
        init(alTerminar: @escaping () -> Void) { self.alTerminar = alTerminar }
        func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
            controller.dismiss(animated: true)
            alTerminar()
        }
    }
}

/// La fila que va debajo del pase en «Tu tarjeta».
struct FilaWallet: View {
    @StateObject private var wallet = Wallet()

    var body: some View {
        if Wallet.disponible {
            VStack(alignment: .leading, spacing: 8) {
                BotonWallet { Task { await wallet.pedir() } }
                    .frame(height: 48)
                    .opacity(wallet.trabajando ? 0.5 : 1)
                    .disabled(wallet.trabajando)
                Text("Tu QR en el iPhone y en el Apple Watch, sin abrir la app.")
                    .font(Marca.cuerpo(13))
                    .foregroundStyle(Marca.crema.opacity(0.65))
                if let error = wallet.error {
                    Text(error).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.fresa)
                }
            }
            .sheet(item: $wallet.pase) { p in
                AgregarAWallet(pase: p.pase) { wallet.pase = nil }
                    .ignoresSafeArea()
            }
        }
    }
}
