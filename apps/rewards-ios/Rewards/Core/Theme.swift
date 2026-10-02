import SwiftUI

/// La marca, copiada de `packages/brand/tokens.css` (la fuente de la verdad).
/// Si se toca un color allá, se copia aquí: esta app no pasa por el
/// empaquetador de la web y se desviaría sola.
enum Marca {
    static let verde = Color(hex: 0x2C4A3E)
    static let verdeProfundo = Color(hex: 0x1A2E26)
    static let tinta = Color(hex: 0x14241D)
    static let crema = Color(hex: 0xE8E6CC)
    static let cremaSuave = Color(hex: 0xF2EFD9)
    static let cremaPapel = Color(hex: 0xEDE9D0)
    static let cremaCalida = Color(hex: 0xDDD9B8)
    static let platano = Color(hex: 0xF0C649)
    static let fresa = Color(hex: 0xE04E5C)
    static let menta = Color(hex: 0x88C0A0)

    /// Bagel Fat One: solo de 18 pt para arriba y en su único peso. Pedirle
    /// negritas la engorda a la fuerza y se emborrona (regla del kiosko).
    static func display(_ tamano: CGFloat) -> Font {
        .custom("Bagel Fat One", size: max(tamano, 18))
    }

    static func cuerpo(_ tamano: CGFloat, _ peso: Font.Weight = .regular) -> Font {
        .custom("DM Sans", size: tamano).weight(peso)
    }

    /// Cifras y etiquetas chicas en versalitas.
    static func mono(_ tamano: CGFloat, _ peso: Font.Weight = .regular) -> Font {
        .custom(peso == .regular ? "DMMono-Regular" : "DMMono-Medium", size: tamano)
    }
}

extension Color {
    init(hex: UInt32, opacidad: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacidad
        )
    }
}

/// Pesos mexicanos, como `mxn()` de @shake/utils.
func mxn(_ valor: Double?) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.currencyCode = "MXN"
    f.currencySymbol = "$"
    f.locale = Locale(identifier: "es_MX")
    f.maximumFractionDigits = (valor ?? 0).truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2
    return f.string(from: NSNumber(value: valor ?? 0)) ?? "$0"
}

/// El botón principal: escala un poco al presionarlo, con resorte.
struct BotonPrincipal: ButtonStyle {
    var fondo: Color = Marca.platano
    var texto: Color = Marca.tinta

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Marca.display(20))
            .foregroundStyle(texto)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(fondo, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Para tarjetas y renglones tocables.
struct Presionable: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

/// La hoja crema sobre el fondo verde: la "tarjeta de papel" de la PWA.
struct Hoja<Contenido: View>: View {
    var titulo: String?
    @ViewBuilder var contenido: Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let titulo {
                Text(titulo).font(Marca.display(20)).foregroundStyle(Marca.verde)
            }
            contenido
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Marca.cremaPapel, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .foregroundStyle(Marca.tinta)
    }
}

/// Etiqueta chica en versalitas, como las de la PWA.
struct Etiqueta: View {
    let texto: String
    var color: Color = Marca.platano

    var body: some View {
        Text(texto.uppercased())
            .font(Marca.mono(11, .medium))
            .tracking(2)
            .foregroundStyle(color)
    }
}
