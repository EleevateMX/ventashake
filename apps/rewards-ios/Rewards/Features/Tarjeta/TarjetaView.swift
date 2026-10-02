import SwiftUI

struct TarjetaView: View {
    @EnvironmentObject var estado: Estado
    @State private var qrGrande: String?

    var body: some View {
        Pantalla(titulo: "Tu tarjeta") {
            if let c = estado.resumen?.cliente {
                Pase(cliente: c) { qrGrande = c.codigo }
                if c.codigo != nil { FilaWallet() }

                if let p = estado.resumen?.progreso, let meta = p.meta, meta > 0 {
                    Progreso(progreso: p)
                }

                ForEach(estado.resumen?.sorpresa ?? []) { s in
                    Hoja {
                        Etiqueta(texto: s.nombre, color: Marca.verde)
                        Text(s.texto).font(Marca.cuerpo(16, .medium))
                    }
                }

                let cupones = estado.resumen?.cupones ?? []
                if !cupones.isEmpty {
                    Hoja(titulo: "Tus cupones") {
                        ForEach(cupones) { cu in
                            Button { qrGrande = cu.codigo } label: {
                                HStack(spacing: 14) {
                                    CodigoQR(texto: cu.codigo).frame(width: 56, height: 56)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(cu.beneficio).font(Marca.cuerpo(16, .semibold))
                                        if let d = cu.dias_restantes {
                                            Text(d <= 0 ? "Vence hoy" : "Vence en \(Int(d)) día\(Int(d) == 1 ? "" : "s")")
                                                .font(Marca.mono(12)).foregroundStyle(Marca.tinta.opacity(0.6))
                                        }
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(Presionable())
                        }
                    }
                }

                if !estado.metas.isEmpty {
                    MetasView()
                }

                TarjetaDeRegalo()

                let paquetes = estado.resumen?.paquetes ?? []
                if !paquetes.isEmpty {
                    Hoja(titulo: "Recargas en caja") {
                        Text("Pídelas en la barra. Lo que recargas no caduca.")
                            .font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.65))
                        ForEach(paquetes) { p in
                            HStack {
                                Text(p.nombre).font(Marca.cuerpo(15, .medium))
                                Spacer()
                                Text("vale \(mxn(p.vale))").font(Marca.mono(14)).foregroundStyle(Marca.verde)
                            }
                        }
                    }
                }
            }
        }
        .fullScreenCover(item: Binding(
            get: { qrGrande.map { QRParaLeer(id: $0) } },
            set: { qrGrande = $0?.id }
        )) { qr in
            QRGrande(codigo: qr.id) { qrGrande = nil }
        }
    }
}

private struct QRParaLeer: Identifiable { let id: String }

/// El pase con la anatomía de Apple Wallet: arriba la marca, al centro lo
/// que vale, abajo el código.
private struct Pase: View {
    let cliente: Resumen.Cliente
    let alTocarQR: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Shakeaholic").font(Marca.display(22)).foregroundStyle(Marca.platano)
                Spacer()
                Etiqueta(texto: "Rewards", color: Marca.crema.opacity(0.7))
            }
            VStack(alignment: .leading, spacing: 2) {
                Etiqueta(texto: "Mancuernas", color: Marca.crema.opacity(0.6))
                Text("\(Int(cliente.total_canjeable ?? cliente.mancuernas ?? 0))")
                    .font(Marca.display(52)).foregroundStyle(Marca.crema)
                Text("Valen \(mxn(cliente.vale_pesos))")
                    .font(Marca.mono(14)).foregroundStyle(Marca.platano)
            }
            if (cliente.saldo ?? 0) > 0 {
                HStack(spacing: 18) {
                    Dato(valor: "\(Int(cliente.mancuernas ?? 0))", pie: "ganadas")
                    Dato(valor: "\(Int(cliente.saldo ?? 0))", pie: "recargadas")
                }
            }
            Divider().overlay(Marca.crema.opacity(0.2))
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(cliente.nombre).font(Marca.cuerpo(17, .semibold)).foregroundStyle(Marca.crema)
                    if let codigo = cliente.codigo {
                        Text(codigo).font(Marca.mono(13)).foregroundStyle(Marca.crema.opacity(0.7))
                    }
                }
                Spacer()
                if let codigo = cliente.codigo {
                    Button(action: alTocarQR) {
                        CodigoQR(texto: codigo)
                            .frame(width: 70, height: 70)
                            .padding(6)
                            .background(.white, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(Presionable())
                    .accessibilityHint("Toca para agrandar y que lo lean en caja")
                }
            }
        }
        .padding(20)
        .background(
            LinearGradient(colors: [Marca.verde, Marca.tinta], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 26, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Marca.crema.opacity(0.15)))
    }
}

private struct Dato: View {
    let valor: String
    let pie: String
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(valor).font(Marca.mono(18, .medium)).foregroundStyle(Marca.crema)
            Text(pie.uppercased()).font(Marca.mono(10)).tracking(1.5).foregroundStyle(Marca.crema.opacity(0.55))
        }
    }
}

private struct Progreso: View {
    let progreso: Resumen.Progreso

    var body: some View {
        Hoja {
            HStack {
                Etiqueta(texto: "Tu próximo premio", color: Marca.verde)
                Spacer()
                if let f = progreso.faltan {
                    Text("faltan \(Int(f))").font(Marca.mono(12)).foregroundStyle(Marca.tinta.opacity(0.6))
                }
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Marca.cremaCalida)
                    Capsule().fill(Marca.verde)
                        .frame(width: g.size.width * min(max((progreso.pct ?? 0) / 100, 0), 1))
                }
            }
            .frame(height: 12)
        }
    }
}

/// El QR grande sobre blanco: un lector falla con un QR chico sobre verde.
private struct QRGrande: View {
    let codigo: String
    let cerrar: () -> Void
    @State private var brilloAntes: CGFloat = UIScreen.main.brightness

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()
            VStack(spacing: 22) {
                Text("Muéstralo en caja").font(Marca.display(26)).foregroundStyle(Marca.tinta)
                CodigoQR(texto: codigo).frame(maxWidth: 300, maxHeight: 300)
                Text(codigo).font(Marca.mono(20, .medium)).foregroundStyle(Marca.tinta)
                Button("Cerrar", action: cerrar)
                    .buttonStyle(BotonPrincipal(fondo: Marca.tinta, texto: Marca.crema))
                    .padding(.horizontal, 40)
            }
        }
        .onAppear {
            brilloAntes = UIScreen.main.brightness
            UIScreen.main.brightness = 1
        }
        .onDisappear { UIScreen.main.brightness = brilloAntes }
    }
}

private struct TarjetaDeRegalo: View {
    @EnvironmentObject var estado: Estado
    @State private var abierta = false
    @State private var codigo = ""
    @State private var mensaje: String?
    @State private var trabajando = false

    var body: some View {
        Hoja {
            Button { withAnimation { abierta.toggle() } } label: {
                HStack {
                    Text("¿Tienes una tarjeta de regalo?").font(Marca.cuerpo(16, .semibold))
                    Spacer()
                    Image(systemName: abierta ? "chevron.up" : "chevron.down")
                }
                .foregroundStyle(Marca.verde)
            }
            if abierta {
                TextField("SHKG-XXXXXXXX", text: $codigo)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(Marca.mono(18))
                    .padding(12)
                    .background(.white, in: RoundedRectangle(cornerRadius: 12))
                Button(trabajando ? "Cargando…" : "Cargar a mi cuenta") {
                    trabajando = true
                    Task {
                        mensaje = await estado.canjearTarjeta(codigo)
                        trabajando = false
                        codigo = ""
                    }
                }
                .buttonStyle(BotonPrincipal())
                .disabled(trabajando || codigo.count < 6)
                if let mensaje {
                    Text(mensaje).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.verde)
                }
            }
        }
    }
}
