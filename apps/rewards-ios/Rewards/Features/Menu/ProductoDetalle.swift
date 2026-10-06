import SwiftUI

/// La ficha de un producto: foto grande, descripción completa, la promo
/// que le aplica hoy, con qué va (la misma lista de extras del kiosko) y
/// «Lo quiero», que por ahora abre WhatsApp con el pedido ya escrito.
/// Pedir dentro de la app va después, con su interruptor en Admin.
struct ProductoDetalle: View {
    let producto: Producto
    @EnvironmentObject var estado: Estado
    @EnvironmentObject var pedidos: Pedidos
    @Environment(\.dismiss) private var cerrar
    @State private var extras: [ExtraProducto]?
    @State private var pidiendo = false

    private var promo: Promo? {
        estado.promos.first { ($0.productos ?? []).contains(producto.id) }
    }

    private var esFavorito: Bool {
        (estado.resumen?.favoritos ?? []).contains { $0.nombre.caseInsensitiveCompare(producto.nombreVisible) == .orderedSame }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                FotoGrande(url: producto.imagen_url, nombre: producto.nombreVisible)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        if let cat = producto.categorias?.nombre {
                            Etiqueta(texto: cat, color: Marca.platano)
                        }
                        if estado.destacados[producto.id] == 1 { Insignia(texto: "Más pedido") }
                        if producto.esNuevo { Insignia(texto: "Nuevo", fondo: Marca.menta) }
                        if esFavorito { Insignia(texto: "Tu favorito", fondo: Marca.menta) }
                    }
                    Text(producto.nombreVisible).font(Marca.display(28)).foregroundStyle(Marca.crema)
                    Text(mxn(producto.precio)).font(Marca.mono(20, .medium)).foregroundStyle(Marca.platano)
                }
                if let d = producto.descripcion, !d.isEmpty {
                    Text(d).font(Marca.cuerpo(15)).foregroundStyle(Marca.crema.opacity(0.85))
                }

                if let promo {
                    VStack(alignment: .leading, spacing: 4) {
                        Etiqueta(texto: "Promo de hoy", color: Marca.tinta.opacity(0.6))
                        Text(promo.nombre).font(Marca.display(22)).foregroundStyle(Marca.tinta)
                        if let t = promo.descripcion, !t.isEmpty {
                            Text(t).font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.75))
                        }
                    }
                    .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Marca.platano, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }

                if let extras, !extras.isEmpty {
                    ConQueVa(extras: extras)
                }

                // Los botones los decide gerencia (Admin → Rewards → Pedidos
                // por la app). Apagados los dos, el producto solo se mira.
                if let cfg = pedidos.config, cfg.activo {
                    if cfg.abierto_ahora, estado.resumen?.cliente != nil {
                        Button { pidiendo = true } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "bag.fill")
                                Text("Lo quiero · pedir y pagar")
                            }
                            .font(Marca.cuerpo(17, .semibold))
                            .frame(maxWidth: .infinity).frame(height: 54)
                        }
                        .buttonStyle(BotonPrincipal())
                        Text("Pagas con tarjeta aquí y pasas por él en \(cfg.minutos_preparacion ?? 20) minutos.")
                            .font(Marca.cuerpo(12)).foregroundStyle(Marca.crema.opacity(0.5))
                            .frame(maxWidth: .infinity)
                    } else if !cfg.abierto_ahora {
                        Text(cfg.mensaje_cerrado ?? "Recibimos pedidos de \(cfg.hora_inicio ?? "") a \(cfg.hora_fin ?? "").")
                            .font(Marca.cuerpo(13)).foregroundStyle(Marca.crema.opacity(0.6))
                            .frame(maxWidth: .infinity)
                    }
                }
                if pedidos.config?.whatsapp == true {
                    Link(destination: whatsapp) {
                        HStack(spacing: 10) {
                            Image(systemName: "message.fill")
                            Text("Pedir por WhatsApp")
                        }
                        .font(Marca.cuerpo(16, .semibold))
                        .frame(maxWidth: .infinity).frame(height: 50)
                    }
                    .buttonStyle(BotonPrincipal(fondo: Marca.crema.opacity(0.12), texto: Marca.crema))
                }

                Button("Cerrar") { cerrar() }
                    .buttonStyle(BotonPrincipal(fondo: Marca.tinta, texto: Marca.crema))
            }
            .padding(.horizontal, 22).padding(.top, 18).padding(.bottom, 30)
        }
        .background(Marca.verdeProfundo.ignoresSafeArea())
        .task {
            extras = await estado.extras(de: producto.id)
            if Vitrina.arg("-abrir") == "pedido" { try? await Task.sleep(nanoseconds: 600_000_000); pidiendo = true }
        }
        .sheet(isPresented: $pidiendo) {
            PedidoSheet(producto: producto, extras: extras ?? [])
                .presentationDetents([.large])
        }
    }

    private var whatsapp: URL {
        let texto = "Hola, quiero un \(producto.nombreVisible) (\(mxn(producto.precio))). Paso a recogerlo."
        let q = texto.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://wa.me/529995044797?text=\(q)") ?? Config.whatsapp
    }
}

private struct FotoGrande: View {
    let url: String?
    let nombre: String
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Marca.cremaPapel)
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { fase in
                    if let img = fase.image { img.resizable().scaledToFit().padding(10) } else { milo }
                }
            } else {
                milo
            }
        }
        .frame(maxWidth: .infinity).frame(height: 260)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityLabel(nombre)
    }
    private var milo: some View {
        VStack(spacing: 6) {
            Image("Milo").resizable().scaledToFit().frame(height: 120).opacity(0.85)
            Text("Milo se lo comió").font(Marca.cuerpo(13, .semibold)).foregroundStyle(Marca.verde)
        }
    }
}

struct Insignia: View {
    let texto: String
    var fondo: Color = Marca.platano
    var body: some View {
        Text(texto.uppercased()).font(Marca.mono(9, .medium)).tracking(1)
            .foregroundStyle(Marca.tinta)
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(fondo, in: Capsule())
    }
}

/// Los extras agrupados como en el kiosko, pero para verse: las opciones
/// de cada grupo como pastillas (la de casa, resaltada) y los extras
/// sueltos como mosaicos con icono y precio.
private struct ConQueVa: View {
    let extras: [ExtraProducto]
    @State private var todos = false
    private let columnas = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    private var grupos: [(String, [ExtraProducto])] {
        let conGrupo = extras.filter { !($0.grupo ?? "").isEmpty }
        let d = Dictionary(grouping: conGrupo) { $0.grupo ?? "" }
        return d.keys.sorted().map { ($0, d[$0] ?? []) }
    }
    private var sueltos: [ExtraProducto] { extras.filter { ($0.grupo ?? "").isEmpty } }
    private var mostrados: [ExtraProducto] { todos ? sueltos : Array(sueltos.prefix(6)) }

    /// «Proteína BIRDMAN FALCON - Chocolate» → «BIRDMAN FALCON · Chocolate».
    static func corto(_ nombre: String, grupo: String) -> String {
        var n = nombre
        for prefijo in [grupo, grupo.capitalized, "Proteína", "Proteina"] where n.lowercased().hasPrefix(prefijo.lowercased() + " ") {
            n = String(n.dropFirst(prefijo.count + 1))
        }
        return n.replacingOccurrences(of: " - ", with: " · ").trimmingCharacters(in: .whitespaces)
    }

    /// Un icono por familia de extra, por el nombre. Lo demás, una chispa.
    static func icono(_ nombre: String) -> String {
        let n = nombre.lowercased()
        if n.contains("galleta") || n.contains("cookie") { return "circle.grid.2x2.fill" }
        if n.contains("doble") || n.contains("scoop") { return "plus.circle.fill" }
        if n.contains("agua") || n.contains("leche") { return "drop.fill" }
        if n.contains("creatina") || n.contains("bcaa") || n.contains("pre") { return "bolt.fill" }
        if n.contains("colágeno") || n.contains("colageno") || n.contains("probiotic") || n.contains("vitamin") { return "pills.fill" }
        if n.contains("chía") || n.contains("chia") || n.contains("avena") || n.contains("linaza") || n.contains("espirulina") { return "leaf.fill" }
        if n.contains("fruta") || n.contains("plátano") || n.contains("fresa") || n.contains("mango") { return "apple.logo" }
        if n.contains("café") || n.contains("cafe") || n.contains("espresso") { return "cup.and.saucer.fill" }
        return "sparkles"
    }

    var body: some View {
        Hoja(titulo: "Con qué va") {
            ForEach(grupos, id: \.0) { grupo, lista in
                VStack(alignment: .leading, spacing: 8) {
                    Text(grupo.uppercased()).font(Marca.mono(10)).tracking(1.5).foregroundStyle(Marca.tinta.opacity(0.5))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(lista.sorted { ($0.por_defecto == true ? 0 : 1, $0.nombre) < ($1.por_defecto == true ? 0 : 1, $1.nombre) }) { e in
                                Pastilla(texto: Self.corto(e.nombre, grupo: grupo), casa: e.por_defecto == true, precio: e.precio)
                            }
                        }
                        .padding(.horizontal, 1)
                    }
                }
            }
            if !sueltos.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("EXTRAS").font(Marca.mono(10)).tracking(1.5).foregroundStyle(Marca.tinta.opacity(0.5))
                    LazyVGrid(columns: columnas, spacing: 10) {
                        ForEach(mostrados) { e in Mosaico(extra: e) }
                    }
                    if sueltos.count > 6 {
                        Button(todos ? "Ver menos" : "Ver los \(sueltos.count) extras") { withAnimation { todos.toggle() } }
                            .font(Marca.cuerpo(13, .semibold)).foregroundStyle(Marca.verde)
                    }
                }
            }
            Text("★ la de casa. Pídelo como lo quieras en la barra.")
                .font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.5))
        }
    }
}

/// Una opción de grupo: la de casa va llena, las demás con borde.
private struct Pastilla: View {
    let texto: String
    let casa: Bool
    let precio: Double?
    var body: some View {
        HStack(spacing: 6) {
            if casa { Text("★").font(.system(size: 11)) }
            Text(texto).font(Marca.cuerpo(13, .semibold)).lineLimit(1)
            if let p = precio, p > 0 {
                Text("+\(mxn(p))").font(Marca.mono(11)).opacity(0.8)
            }
        }
        .foregroundStyle(casa ? Marca.crema : Marca.tinta)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(casa ? Marca.verde : Marca.cremaCalida, in: Capsule())
    }
}

/// Un extra suelto: icono, nombre y precio.
private struct Mosaico: View {
    let extra: ExtraProducto
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: ConQueVa.icono(extra.nombre))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Marca.verde)
                .frame(width: 32, height: 32)
                .background(Marca.menta.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(extra.nombre).font(Marca.cuerpo(13, .medium)).foregroundStyle(Marca.tinta).lineLimit(2)
                Text((extra.precio ?? 0) > 0 ? "+\(mxn(extra.precio))" : "incluido")
                    .font(Marca.mono(11, .medium))
                    .foregroundStyle((extra.precio ?? 0) > 0 ? Marca.verde : Marca.tinta.opacity(0.5))
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Marca.cremaCalida.opacity(0.6), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
