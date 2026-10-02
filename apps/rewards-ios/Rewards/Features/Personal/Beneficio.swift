import SwiftUI

/// «Mi beneficio»: lo que llevo hoy, lo que me queda, el código para la
/// caja y la lista de precios de personal. Los números salen del servidor
/// (`fn_mi_personal`), que es el mismo que cobra; aquí no se calcula nada.
struct Beneficio: View {
    @EnvironmentObject var personal: Personal
    @State private var mostrandoCodigo = false
    @State private var verPrecios = false

    var body: some View {
        Hoja(titulo: "Mi beneficio") {
            if let mi = personal.mi {
                if !mi.beneficio {
                    Text(mi.motivo ?? "Tu beneficio todavía no está activo.")
                        .font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.tinta.opacity(0.75))
                } else {
                    grupos(mi)
                    tope(mi)
                    if let motivo = mi.motivo {
                        Text(motivo).font(Marca.cuerpo(13, .medium)).foregroundStyle(Marca.fresa)
                    }
                    Button("Mostrar mi código en la caja") { mostrandoCodigo = true }
                        .buttonStyle(BotonPrincipal())
                    if !mi.hoy.isEmpty {
                        Divider()
                        ForEach(mi.hoy) { c in
                            HStack {
                                Text("\(c.cantidad) × \(c.producto)").font(Marca.cuerpo(14))
                                Spacer()
                                Text(c.hora ?? "").font(Marca.mono(12)).foregroundStyle(Marca.tinta.opacity(0.5))
                                Text(mxn(c.importe)).font(Marca.mono(13))
                            }
                        }
                    }
                }
                if !mi.precios.isEmpty { precios(mi) }
            } else if let e = personal.miError {
                Text(e).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.fresa)
            } else {
                ProgressView().tint(Marca.verde)
            }
        }
        .fullScreenCover(isPresented: $mostrandoCodigo) {
            CodigoParaCaja { mostrandoCodigo = false }
        }
    }

    private func grupos(_ mi: MiPersonal) -> some View {
        HStack(spacing: 10) {
            ForEach(mi.grupos) { g in
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(g.usado)/\(g.max)")
                        .font(Marca.mono(18, .medium))
                        .foregroundStyle(g.usado >= g.max ? Marca.fresa : Marca.verde)
                    Text(g.nombre.uppercased()).font(Marca.mono(9)).tracking(1.2)
                        .foregroundStyle(Marca.tinta.opacity(0.5)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func tope(_ mi: MiPersonal) -> some View {
        let usado = mi.usado_importe ?? 0
        let tope = mi.tope ?? 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Hoy llevas \(mxn(usado)) de \(mxn(tope))").font(Marca.cuerpo(14, .medium))
                Spacer()
                Text("quedan \(mxn(max(tope - usado, 0)))").font(Marca.mono(12)).foregroundStyle(Marca.tinta.opacity(0.6))
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Marca.cremaCalida)
                    Capsule().fill(usado >= tope ? Marca.fresa : Marca.verde)
                        .frame(width: g.size.width * (tope > 0 ? min(usado / tope, 1) : 0))
                }
            }
            .frame(height: 10)
        }
    }

    private func precios(_ mi: MiPersonal) -> some View {
        let porCategoria = Dictionary(grouping: mi.precios) { $0.categoria ?? "Otros" }
        let categorias = porCategoria.keys.sorted()
        return VStack(alignment: .leading, spacing: 8) {
            Button { withAnimation { verPrecios.toggle() } } label: {
                HStack {
                    Text("Precios de personal").font(Marca.cuerpo(15, .semibold))
                    Spacer()
                    Image(systemName: verPrecios ? "chevron.up" : "chevron.down")
                }
                .foregroundStyle(Marca.verde)
            }
            if verPrecios {
                ForEach(categorias, id: \.self) { cat in
                    Text(cat.uppercased()).font(Marca.mono(10)).tracking(1.5)
                        .foregroundStyle(Marca.tinta.opacity(0.5)).padding(.top, 6)
                    ForEach(porCategoria[cat] ?? []) { p in
                        HStack {
                            Text(p.nombre).font(Marca.cuerpo(14)).lineLimit(1)
                            Spacer()
                            Text(mxn(p.precio)).font(Marca.mono(12)).strikethrough()
                                .foregroundStyle(Marca.tinta.opacity(0.4))
                            Text(mxn(p.precio_personal)).font(Marca.mono(14, .medium)).foregroundStyle(Marca.verde)
                        }
                    }
                }
            }
        }
    }
}

/// El QR para la caja, grande y sobre blanco (un lector falla con un QR
/// chico sobre verde). Se renueva solo al vencer; si la cajera ya lo
/// escaneó, el servidor lo mantiene vivo para esa venta aunque aquí cambie.
struct CodigoParaCaja: View {
    @EnvironmentObject var personal: Personal
    let cerrar: () -> Void
    @State private var error: String?
    @State private var brilloAntes: CGFloat = UIScreen.main.brightness

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()
            VStack(spacing: 22) {
                Text("Escanéalo en caja").font(Marca.display(26)).foregroundStyle(Marca.tinta)
                Text("Es para personal → escanear")
                    .font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.6))
                if let codigo = personal.codigo {
                    CodigoQR(texto: codigo).frame(maxWidth: 300, maxHeight: 300)
                    Text(codigo).font(Marca.mono(20, .medium)).foregroundStyle(Marca.tinta)
                    if let vence = personal.codigoVence {
                        TimelineView(.periodic(from: .now, by: 1)) { ctx in
                            let s = Int(vence.timeIntervalSince(ctx.date).rounded(.down))
                            Text(s > 0 ? "Vale \(s) s · un solo uso" : "Renovando…")
                                .font(Marca.mono(13)).foregroundStyle(Marca.tinta.opacity(0.6))
                                .task(id: s <= 0) { if s <= 0 { error = await personal.pedirCodigo() } }
                        }
                    }
                } else if let error {
                    Text(error).font(Marca.cuerpo(15, .medium)).foregroundStyle(Marca.fresa)
                        .multilineTextAlignment(.center).padding(.horizontal, 30)
                    Button("Intentar otra vez") { Task { self.error = await personal.pedirCodigo() } }
                        .buttonStyle(BotonPrincipal())
                        .padding(.horizontal, 60)
                } else {
                    ProgressView().tint(Marca.verde)
                }
                Button("Cerrar", action: cerrar)
                    .buttonStyle(BotonPrincipal(fondo: Marca.tinta, texto: Marca.crema))
                    .padding(.horizontal, 40)
            }
        }
        .task { if personal.codigo == nil || (personal.codigoVence ?? .distantPast) < Date() { error = await personal.pedirCodigo() } }
        .onAppear { brilloAntes = UIScreen.main.brightness; UIScreen.main.brightness = 1 }
        .onDisappear {
            UIScreen.main.brightness = brilloAntes
            Task { await personal.cargarMi() }
        }
    }
}
