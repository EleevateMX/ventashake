import SwiftUI

/// La carta viva de la barra: la misma tabla `productos` que leen el kiosko
/// y la web, con la misma foto que enseña el kiosko.
///
/// Las 37 categorías de la base se agrupan en **familias** para que la
/// gente llegue a lo suyo sin pasar por 250 shakes: Shakes, Alimentos,
/// Bebidas, De temporada, Snacks. Arriba de cada familia van **los más
/// pedidos** (el lugar lo manda el servidor por lo vendido en 60 días; la
/// app no cuenta nada). Scoops, suplementos y extras son surtido de
/// mostrador, no carta (mismo filtro que la PWA).
struct MenuView: View {
    @EnvironmentObject var estado: Estado
    @State private var familia: String?

    private static let ordenFamilias = ["Shakes", "Alimentos", "Bebidas", "De temporada", "Snacks", "Más"]

    /// A qué familia pertenece una categoría, por su nombre. `nil` = no es
    /// carta. «temporada» en el nombre manda sobre todo lo demás, para que
    /// una categoría nueva de temporada aparezca sola.
    static func familia(de categoria: String) -> String? {
        let c = categoria.lowercased()
        if c.contains("temporada") { return "De temporada" }
        if c.hasPrefix("scoops") || c.hasPrefix("suplementos") || c.hasPrefix("extras")
            || c.hasPrefix("recargas") || c.hasPrefix("ventas especiales") { return nil }
        if c.hasPrefix("shakes") { return "Shakes" }
        if c.hasPrefix("alimentos") || c.hasPrefix("combos") { return "Alimentos" }
        if c.hasPrefix("snacks") { return "Snacks" }
        for b in ["bebidas", "café", "cafe", "tés", "tes", "kombucha", "collagen", "amino", "hydration", "energy", "drinks"]
            where c.contains(b) { return "Bebidas" }
        return "Más"
    }

    private struct Seccion: Identifiable {
        let familia: String
        let destacados: [Producto]
        let categorias: [(String, [Producto])]
        var id: String { familia }
    }

    private var secciones: [Seccion] {
        var porFamilia: [String: [String: [Producto]]] = [:]
        var ordenCat: [String: Int] = [:]
        for p in estado.menu ?? [] {
            guard let cat = p.categorias?.nombre, let f = Self.familia(de: cat) else { continue }
            porFamilia[f, default: [:]][cat, default: []].append(p)
            ordenCat[cat] = p.categorias?.orden ?? 999
        }
        return Self.ordenFamilias.compactMap { f in
            guard let cats = porFamilia[f] else { return nil }
            let categorias = cats
                .sorted { (ordenCat[$0.key] ?? 999, $0.key) < (ordenCat[$1.key] ?? 999, $1.key) }
                .map { ($0.key, $0.value) }
            // Los más pedidos de la familia: por lugar, y entre iguales por
            // el orden de la categoría; cuatro como máximo.
            let destacados = categorias.flatMap { $0.1 }
                .compactMap { p in estado.destacados[p.id].map { (p, $0) } }
                .sorted { ($0.1, ordenCat[$0.0.categorias?.nombre ?? ""] ?? 999) < ($1.1, ordenCat[$1.0.categorias?.nombre ?? ""] ?? 999) }
                .prefix(4).map { $0.0 }
            return Seccion(familia: f, destacados: Array(destacados), categorias: categorias)
        }
    }

    var body: some View {
        Pantalla(titulo: "Menú", alRefrescar: { await estado.cargarMenu() }) {
            Etiqueta(texto: "Lo que hay hoy en la barra")
            if estado.menu == nil {
                ProgressView().tint(Marca.platano).frame(maxWidth: .infinity).padding(.top, 40)
            } else if secciones.isEmpty {
                Text("El menú no está disponible ahora.")
                    .font(Marca.cuerpo(15)).foregroundStyle(Marca.crema.opacity(0.6))
            } else {
                chips
                LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
                    ForEach(secciones.filter { familia == nil || $0.familia == familia }) { s in
                        Section {
                            if !s.destacados.isEmpty {
                                MasPedidos(productos: s.destacados)
                            }
                            ForEach(s.categorias, id: \.0) { categoria, productos in
                                if s.categorias.count > 1 {
                                    Text(categoria)
                                        .font(Marca.mono(11)).tracking(1.5)
                                        .foregroundStyle(Marca.crema.opacity(0.55))
                                        .padding(.top, 6)
                                }
                                ForEach(productos) { p in
                                    FilaProducto(producto: p, lugar: estado.destacados[p.id])
                                }
                            }
                        } header: {
                            Text(s.familia)
                                .font(Marca.display(24))
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

    /// Las familias como fichas: «Todo» y una por familia que exista hoy.
    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Chip(texto: "Todo", activa: familia == nil) { familia = nil }
                ForEach(secciones) { s in
                    Chip(texto: s.familia, activa: familia == s.familia) {
                        familia = familia == s.familia ? nil : s.familia
                    }
                }
            }
            .padding(.horizontal, 2)
        }
        .animation(.easeOut(duration: 0.2), value: familia)
    }
}

private struct Chip: View {
    let texto: String
    let activa: Bool
    let accion: () -> Void
    var body: some View {
        Button(action: accion) {
            Text(texto)
                .font(Marca.cuerpo(14, .semibold))
                .foregroundStyle(activa ? Marca.tinta : Marca.crema)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(activa ? Marca.platano : Marca.crema.opacity(0.12), in: Capsule())
        }
        .buttonStyle(Presionable())
    }
}

/// Los más pedidos de la familia: fotos grandes en fila.
private struct MasPedidos: View {
    let productos: [Producto]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Etiqueta(texto: "Los más pedidos", color: Marca.crema.opacity(0.7))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(productos) { p in
                        VStack(alignment: .leading, spacing: 6) {
                            Foto(url: p.imagen_url, nombre: p.nombreVisible, lado: 150)
                            Text(p.nombreVisible).font(Marca.cuerpo(14, .semibold)).foregroundStyle(Marca.crema).lineLimit(2)
                            Text(mxn(p.precio)).font(Marca.mono(13, .medium)).foregroundStyle(Marca.platano)
                        }
                        .frame(width: 150, alignment: .leading)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
        .padding(.bottom, 4)
    }
}

/// Una tarjeta por producto: la foto a la izquierda, el nombre y el precio.
private struct FilaProducto: View {
    let producto: Producto
    let lugar: Int?

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Foto(url: producto.imagen_url, nombre: producto.nombreVisible, lado: 76)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(producto.nombreVisible)
                        .font(Marca.cuerpo(15, .semibold))
                        .foregroundStyle(Marca.tinta)
                        .lineLimit(2)
                    if let lugar, lugar == 1 {
                        Text("MÁS PEDIDO").font(Marca.mono(9, .medium)).tracking(1)
                            .foregroundStyle(Marca.tinta)
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(Marca.platano, in: Capsule())
                    }
                }
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
    let lado: CGFloat

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
                .frame(width: lado * 0.58, height: lado * 0.52)
                .opacity(0.85)
            Text("Milo se\nlo comió")
                .font(Marca.cuerpo(lado > 100 ? 12 : 9, .semibold))
                .foregroundStyle(Marca.verde)
                .multilineTextAlignment(.center)
                .lineSpacing(-1)
        }
    }
}
