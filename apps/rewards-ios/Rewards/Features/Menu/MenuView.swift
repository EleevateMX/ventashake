import SwiftUI

/// La carta viva de la barra: la misma tabla `productos` que leen el kiosko
/// y la web, con la misma foto que enseña el kiosko. Los scoops, suplementos
/// y extras son surtido de mostrador, no carta (mismo filtro que la PWA).
///
/// Las filas son perezosas a propósito: son 300 productos con foto, y una
/// pila normal pediría las 300 imágenes al abrir la pestaña.
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
                LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
                    ForEach(carta, id: \.0) { categoria, productos in
                        Section {
                            ForEach(productos) { p in
                                FilaProducto(producto: p)
                            }
                        } header: {
                            Text(categoria)
                                .font(Marca.display(22))
                                .foregroundStyle(Marca.platano)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 8)
                                .background(Marca.verdeProfundo)
                        }
                    }
                }
                Link(destination: Config.whatsapp) {
                    Text("Pedir por WhatsApp")
                }
                .buttonStyle(BotonPrincipal())
                .padding(.top, 8)
            }
        }
    }
}

/// Una tarjeta por producto: la foto a la izquierda, el nombre y el precio.
private struct FilaProducto: View {
    let producto: Producto

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Foto(url: producto.imagen_url, nombre: producto.nombreVisible)
            VStack(alignment: .leading, spacing: 3) {
                Text(producto.nombreVisible)
                    .font(Marca.cuerpo(15, .semibold))
                    .foregroundStyle(Marca.tinta)
                    .lineLimit(2)
                if let d = producto.descripcion, !d.isEmpty {
                    Text(d).font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.55)).lineLimit(2)
                }
                Text(mxn(producto.precio)).font(Marca.mono(14, .medium)).foregroundStyle(Marca.verde)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Marca.cremaPapel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// La foto del producto, o Milo que se lo comió.
private struct Foto: View {
    let url: String?
    let nombre: String
    private let lado: CGFloat = 76

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Marca.cremaCalida)
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { fase in
                    switch fase {
                    case .success(let imagen):
                        imagen.resizable().scaledToFill()
                    case .failure:
                        seLoComio
                    default:
                        ProgressView().tint(Marca.verde)
                    }
                }
            } else {
                seLoComio
            }
        }
        .frame(width: lado, height: lado)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityLabel(url == nil ? "\(nombre), sin foto" : nombre)
    }

    /// Sin foto no hay hueco gris: Milo se la comió. Es el mismo guiño que
    /// la app usa en todas partes, y le dice al cliente que no es un error.
    private var seLoComio: some View {
        VStack(spacing: 2) {
            Image("Milo").resizable().scaledToFit()
                .frame(width: 44, height: 40)
                .opacity(0.85)
            Text("Milo se\nlo comió")
                .font(Marca.cuerpo(9, .semibold))
                .foregroundStyle(Marca.verde)
                .multilineTextAlignment(.center)
                .lineSpacing(-1)
        }
    }
}
