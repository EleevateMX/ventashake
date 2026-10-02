import SwiftUI
import CoreImage.CIFilterBuiltins
import UIKit

/// QR dibujado en el teléfono, sin llamadas externas (como `QR.tsx`).
struct CodigoQR: View {
    let texto: String

    var body: some View {
        if let imagen = Self.generar(texto) {
            Image(uiImage: imagen)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .accessibilityLabel("Código \(texto)")
        } else {
            Text(texto).font(Marca.mono(14))
        }
    }

    static func generar(_ texto: String) -> UIImage? {
        let filtro = CIFilter.qrCodeGenerator()
        filtro.message = Data(texto.utf8)
        filtro.correctionLevel = "M"
        guard let salida = filtro.outputImage else { return nil }
        let grande = salida.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        guard let cg = CIContext().createCGImage(grande, from: grande.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

enum Tacto {
    static func ligero() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func exito() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func error() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
}
