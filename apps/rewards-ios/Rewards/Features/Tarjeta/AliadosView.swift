import SwiftUI

/// Las marcas con las que colaboramos: logos en una fila; al tocar, qué
/// son, cómo contactarlos y la promo que tienen con Shakeaholic. Lo
/// administra gerencia en Admin → Aliados; aquí solo se pinta.
struct AliadosView: View {
    @EnvironmentObject var estado: Estado
    @State private var abierto: Aliado?

    var body: some View {
        if let aliados = estado.aliados, !aliados.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Etiqueta(texto: "Aliados Shakeaholic", color: Marca.crema.opacity(0.7))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(aliados) { a in
                            Button { abierto = a } label: {
                                LogoAliado(aliado: a, lado: 84)
                            }
                            .buttonStyle(Presionable())
                        }
                    }
                    .padding(.horizontal, 2)
                }
            }
            .sheet(item: $abierto) { a in
                AliadoDetalle(aliado: a)
                    .presentationDetents([.medium, .large])
            }
        }
    }
}

struct LogoAliado: View {
    let aliado: Aliado
    let lado: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Marca.cremaPapel)
            if let url = aliado.logo_url, let u = URL(string: url) {
                AsyncImage(url: u) { fase in
                    if let img = fase.image {
                        img.resizable().scaledToFit().padding(12)
                    } else {
                        iniciales
                    }
                }
            } else {
                iniciales
            }
        }
        .frame(width: lado, height: lado)
        .accessibilityLabel(aliado.nombre)
    }

    private var iniciales: some View {
        Text(aliado.nombre.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined())
            .font(Marca.display(26)).foregroundStyle(Marca.verde)
    }
}

/// La hoja del aliado: logo, qué son, la promo en amarillo y los botones de
/// contacto que tengan dato (sin dato no hay botón).
struct AliadoDetalle: View {
    let aliado: Aliado
    @Environment(\.dismiss) private var cerrar

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .center, spacing: 14) {
                    LogoAliado(aliado: aliado, lado: 72)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(aliado.nombre).font(Marca.display(24)).foregroundStyle(Marca.crema)
                        Text("Aliado de Shakeaholic").font(Marca.mono(11)).tracking(1.2).foregroundStyle(Marca.platano)
                    }
                    Spacer()
                }
                .padding(.top, 24)

                if let d = aliado.descripcion, !d.isEmpty {
                    Text(d).font(Marca.cuerpo(15)).foregroundStyle(Marca.crema.opacity(0.85))
                }

                if let titulo = aliado.promo_titulo, !titulo.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Etiqueta(texto: "Promo con tu tarjeta", color: Marca.tinta.opacity(0.6))
                        Text(titulo).font(Marca.display(22)).foregroundStyle(Marca.tinta)
                        if let t = aliado.promo_texto, !t.isEmpty {
                            Text(t).font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.75))
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Marca.platano, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }

                VStack(spacing: 10) {
                    if let w = aliado.whatsapp, let u = URL(string: "https://wa.me/52\(w.filter(\.isNumber))") {
                        Contacto(icono: "message.fill", texto: "WhatsApp", url: u)
                    }
                    if let ig = aliado.instagram, let u = URL(string: "https://instagram.com/\(ig.replacingOccurrences(of: "@", with: ""))") {
                        Contacto(icono: "camera.fill", texto: "Instagram", url: u)
                    }
                    if let w = aliado.web, let u = URL(string: w.hasPrefix("http") ? w : "https://\(w)") {
                        Contacto(icono: "globe", texto: "Sitio web", url: u)
                    }
                    if let t = aliado.telefono, let u = URL(string: "tel:\(t.filter(\.isNumber))") {
                        Contacto(icono: "phone.fill", texto: "Llamar", url: u)
                    }
                    if let d = aliado.direccion, let u = URL(string: "https://maps.apple.com/?q=\(d.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") {
                        Contacto(icono: "mappin.and.ellipse", texto: d, url: u)
                    }
                }

                Button("Cerrar") { cerrar() }
                    .buttonStyle(BotonPrincipal(fondo: Marca.tinta, texto: Marca.crema))
                    .padding(.top, 6)
            }
            .padding(.horizontal, 22)
            .padding(.bottom, 30)
        }
        .background(Marca.verdeProfundo.ignoresSafeArea())
    }
}

private struct Contacto: View {
    let icono: String
    let texto: String
    let url: URL

    var body: some View {
        Link(destination: url) {
            HStack(spacing: 12) {
                Image(systemName: icono).frame(width: 22)
                Text(texto).font(Marca.cuerpo(15, .medium)).lineLimit(1)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 12, weight: .bold)).opacity(0.5)
            }
            .foregroundStyle(Marca.crema)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(Marca.crema.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

/// La pestaña «Aliados»: todas las marcas, con su promo a la vista.
struct AliadosTab: View {
    @EnvironmentObject var estado: Estado
    @State private var abierto: Aliado?
    private let columnas = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        Pantalla(titulo: "Aliados", alRefrescar: { await estado.cargarAliados() }) {
            Etiqueta(texto: "Marcas que te consienten con tu tarjeta")
            if let aliados = estado.aliados {
                if aliados.isEmpty {
                    Hoja {
                        Text("Pronto.").font(Marca.cuerpo(16, .semibold))
                        Text("Estamos cerrando alianzas con marcas de Mérida para que tu tarjeta valga también fuera de la barra.")
                            .font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.65))
                    }
                } else {
                    LazyVGrid(columns: columnas, spacing: 12) {
                        ForEach(aliados) { a in
                            Button { abierto = a } label: {
                                VStack(alignment: .leading, spacing: 10) {
                                    LogoAliado(aliado: a, lado: 64)
                                    Text(a.nombre).font(Marca.cuerpo(15, .semibold)).foregroundStyle(Marca.tinta).lineLimit(2)
                                    if let p = a.promo_titulo, !p.isEmpty {
                                        Text(p).font(Marca.cuerpo(12, .medium)).foregroundStyle(Marca.verde).lineLimit(2)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .background(Marca.cremaPapel, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            }
                            .buttonStyle(Presionable())
                        }
                    }
                }
            } else {
                ProgressView().tint(Marca.platano).frame(maxWidth: .infinity).padding(.top, 40)
            }
        }
        .sheet(item: $abierto) { a in
            AliadoDetalle(aliado: a).presentationDetents([.medium, .large])
        }
        .onAppear { if Vitrina.arg("-abrir") == "aliado" { abierto = estado.aliados?.first } }
    }
}
