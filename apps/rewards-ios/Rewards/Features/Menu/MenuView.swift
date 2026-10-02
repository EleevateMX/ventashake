import SwiftUI

/// La carta viva de la barra: la misma tabla `productos` que leen el kiosko
/// y la web. Los scoops, suplementos y extras son surtido de mostrador, no
/// carta (mismo filtro que la PWA).
struct MenuView: View {
    @EnvironmentObject var estado: Estado

    private var carta: [(String, [Producto])] {
        var grupos: [String: [Producto]] = [:]
        var ordenCat: [String: Int] = [:]
        for p in estado.menu ?? [] {
            guard let cat = p.categorias?.nombre else { continue }
            if cat.range(of: #"^(extras|scoops|suplementos)"#, options: [.regularExpression, .caseInsensitive]) != nil {
                continue
            }
            grupos[cat, default: []].append(p)
            ordenCat[cat] = p.categorias?.orden ?? 999
        }
        return grupos
            .sorted { (ordenCat[$0.key] ?? 999, $0.key) < (ordenCat[$1.key] ?? 999, $1.key) }
            .map { ($0.key, $0.value) }
    }

    var body: some View {
        Pantalla(titulo: "Menú", alRefrescar: { await estado.cargarMenu() }) {
            Etiqueta(texto: "Lo que hay hoy en la barra")
            if estado.menu == nil {
                ProgressView().tint(Marca.platano).frame(maxWidth: .infinity).padding(.top, 40)
            } else if carta.isEmpty {
                Text("El menú no está disponible ahora.")
                    .font(Marca.cuerpo(15)).foregroundStyle(Marca.crema.opacity(0.6))
            } else {
                ForEach(carta, id: \.0) { categoria, productos in
                    Hoja(titulo: categoria) {
                        ForEach(productos) { p in
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.nombreVisible).font(Marca.cuerpo(15, .medium))
                                    if let d = p.descripcion, !d.isEmpty {
                                        Text(d).font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.55))
                                    }
                                }
                                Spacer(minLength: 12)
                                Text(mxn(p.precio)).font(Marca.mono(14)).foregroundStyle(Marca.verde)
                            }
                            .padding(.vertical, 3)
                        }
                    }
                }
                Link(destination: Config.whatsapp) {
                    Text("Pedir por WhatsApp")
                }
                .buttonStyle(BotonPrincipal())
            }
        }
    }
}
