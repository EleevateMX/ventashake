import SwiftUI

/// La pestaña «Personal»: cómo va la tienda ahora. Gerencia ve además las
/// ventas y puede recargar las pantallas; el cajero ve caja, pedidos en
/// preparación e impresoras. Cobrar sigue siendo en la barra: el efectivo
/// entra al cajón y la terminal está ahí (misma regla que Admin → En vivo).
struct PersonalView: View {
    @EnvironmentObject var personal: Personal
    @State private var aviso: String?
    private let reloj = Timer.publish(every: 15, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                encabezado
                if let error = personal.error {
                    Text(error).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.fresa)
                }
                if personal.esJefe, let p = personal.panel {
                    Ventas(panel: p)
                }
                Beneficio()
                Caja(corte: personal.panel?.corte ?? personal.turno?.corte, conFondo: personal.esJefe)
                EnPreparacion(pedidos: personal.panel?.en_cocina ?? personal.turno?.en_cocina ?? [])
                Impresoras(
                    lista: personal.panel?.impresoras ?? personal.turno?.impresoras ?? [],
                    atoradas: personal.panel?.impresion_atorada ?? personal.turno?.impresion_atorada ?? 0
                )
                if personal.esJefe {
                    Pantallas(aviso: $aviso)
                    if let pedidos = personal.panel?.pedidos_recientes, !pedidos.isEmpty {
                        Recientes(pedidos: pedidos)
                    }
                }
                Button("Salir del modo personal") { Task { await personal.salir() } }
                    .buttonStyle(BotonPrincipal(fondo: Marca.tinta, texto: Marca.crema))
                    .padding(.top, 6)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 30)
        }
        .refreshable { await personal.refrescar(); await personal.cargarMi() }
        .background(Marca.verdeProfundo.ignoresSafeArea())
        .onReceive(reloj) { _ in Task { await personal.refrescar() } }
        .alert(aviso ?? "", isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    private var encabezado: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Personal").font(Marca.display(34)).foregroundStyle(Marca.crema).padding(.top, 8)
            HStack(spacing: 8) {
                Text(personal.nombre ?? "—").font(Marca.cuerpo(16, .semibold)).foregroundStyle(Marca.crema)
                Etiqueta(texto: personal.esJefe ? "Gerencia" : (personal.turno?.yo?.rol ?? "Personal"))
            }
            if let t = personal.actualizado {
                // Un panel que dice «en vivo» tiene que poder demostrarlo.
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Text("actualizado hace \(max(0, Int(ctx.date.timeIntervalSince(t)))) s")
                        .font(Marca.mono(11)).foregroundStyle(Marca.crema.opacity(0.5))
                }
            }
        }
    }
}

private struct Ventas: View {
    let panel: PanelEnVivo
    var body: some View {
        Hoja(titulo: "Hoy") {
            HStack(spacing: 18) {
                Cifra(valor: mxn(panel.dia?.total), pie: "vendido")
                Cifra(valor: "\(panel.dia?.ordenes ?? 0)", pie: "órdenes")
                Cifra(valor: mxn(panel.dia?.ticket), pie: "ticket")
            }
            if let turno = panel.turno {
                Text("Este turno: \(mxn(turno.total)) en \(turno.ordenes ?? 0) órdenes")
                    .font(Marca.cuerpo(13)).foregroundStyle(Marca.tinta.opacity(0.65))
            }
            let metodos = (panel.por_metodo ?? [:]).sorted { $0.value > $1.value }
            if !metodos.isEmpty {
                Divider()
                ForEach(metodos, id: \.key) { m in
                    HStack {
                        Text(m.key.capitalized).font(Marca.cuerpo(14))
                        Spacer()
                        Text(mxn(m.value)).font(Marca.mono(14))
                    }
                }
            }
        }
    }
}

private struct Cifra: View {
    let valor: String
    let pie: String
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(valor).font(Marca.mono(20, .medium)).foregroundStyle(Marca.verde)
            Text(pie.uppercased()).font(Marca.mono(10)).tracking(1.5).foregroundStyle(Marca.tinta.opacity(0.5))
        }
    }
}

private struct Caja: View {
    let corte: EnTurno.Corte?
    let conFondo: Bool
    var body: some View {
        Hoja(titulo: "Caja") {
            if let c = corte {
                Text("Abierta desde las \(c.desde ?? "—")\(c.abrio.map { " por \($0)" } ?? "")")
                    .font(Marca.cuerpo(15, .medium))
                if conFondo, let f = c.fondo {
                    Text("Fondo \(mxn(f))").font(Marca.mono(13)).foregroundStyle(Marca.tinta.opacity(0.6))
                }
            } else {
                Text("Cerrada. Se abre desde el kiosko → «Caja y turno».")
                    .font(Marca.cuerpo(15, .medium)).foregroundStyle(Marca.fresa)
            }
        }
    }
}

private struct EnPreparacion: View {
    let pedidos: [EnCocina]
    var body: some View {
        Hoja(titulo: "En preparación") {
            if pedidos.isEmpty {
                Text("Nada pendiente.").font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.6))
            }
            ForEach(pedidos) { p in
                HStack {
                    Text("#\(String(p.folio))").font(Marca.mono(15, .medium))
                    Text(p.nombre ?? "").font(Marca.cuerpo(14)).lineLimit(1)
                    Spacer()
                    Text(p.estacion).font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.6))
                    Text("\(Int(p.minutos)) min")
                        .font(Marca.mono(13, .medium))
                        .foregroundStyle(p.minutos >= 10 ? Marca.fresa : Marca.verde)
                }
            }
        }
    }
}

private struct Impresoras: View {
    let lista: [Impresora]
    let atoradas: Int
    var body: some View {
        Hoja(titulo: "Impresoras") {
            ForEach(lista) { i in
                HStack {
                    Circle().fill(i.en_linea ? Marca.menta : Marca.fresa).frame(width: 10, height: 10)
                    Text(i.nombre).font(Marca.cuerpo(14))
                    Spacer()
                    Text(i.en_linea ? "en línea" : "sin señal").font(Marca.mono(12))
                        .foregroundStyle(i.en_linea ? Marca.verde : Marca.fresa)
                }
            }
            if atoradas > 0 {
                Text("\(atoradas) comanda\(atoradas == 1 ? "" : "s") esperando más de 90 s: revisa la ventana del agente en la PC.")
                    .font(Marca.cuerpo(13, .medium)).foregroundStyle(Marca.fresa)
            }
        }
    }
}

private struct Pantallas: View {
    @EnvironmentObject var personal: Personal
    @Binding var aviso: String?
    private let opciones: [(String, String)] = [
        ("kiosko", "Kiosko"), ("barra", "Barra"), ("cocina", "Cocina"), ("pantalla", "TV de folios"),
    ]

    var body: some View {
        Hoja(titulo: "Actualizar pantallas") {
            Text("Espera a que la pantalla esté libre: no corta una venta ni un corte a medias.")
                .font(Marca.cuerpo(13)).foregroundStyle(Marca.tinta.opacity(0.65))
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(opciones, id: \.0) { clave, nombre in
                    Button(nombre) {
                        Task { aviso = await personal.recargar(clave) }
                    }
                    .font(Marca.cuerpo(15, .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Marca.platano, in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(Marca.tinta)
                }
            }
        }
    }
}

private struct Recientes: View {
    let pedidos: [PanelEnVivo.Pedido]
    var body: some View {
        Hoja(titulo: "Últimos cobros") {
            ForEach(pedidos) { p in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text("#\(String(p.folio))").font(Marca.mono(14, .medium))
                        Text(p.hora ?? "").font(Marca.mono(12)).foregroundStyle(Marca.tinta.opacity(0.5))
                        Spacer()
                        Text(mxn(p.total)).font(Marca.mono(14))
                    }
                    if let items = p.items, !items.isEmpty {
                        Text(items).font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.6)).lineLimit(2)
                    }
                }
            }
        }
    }
}

/// El teclado para entrar con PIN, desde Cuenta o desde la pantalla de
/// entrada. Es el mismo PIN del kiosko.
struct EntrarPersonal: View {
    @EnvironmentObject var personal: Personal
    @Environment(\.dismiss) private var cerrar
    @State private var pin = ""
    @State private var error: String?
    @State private var trabajando = false

    var body: some View {
        VStack(spacing: 20) {
            Text("Modo personal").font(Marca.display(28)).foregroundStyle(Marca.crema).padding(.top, 30)
            Text("Tu PIN de la caja. La sesión dura mientras la app esté abierta.")
                .font(Marca.cuerpo(14)).foregroundStyle(Marca.crema.opacity(0.7)).multilineTextAlignment(.center)
            SecureField("PIN", text: $pin)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(Marca.mono(28, .medium))
                .multilineTextAlignment(.center)
                .padding(14)
                .background(Marca.cremaPapel, in: RoundedRectangle(cornerRadius: 16))
                .foregroundStyle(Marca.tinta)
                .frame(maxWidth: 220)
            if let error {
                Text(error).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.fresa)
            }
            Button(trabajando ? "Entrando…" : "Entrar") {
                trabajando = true
                Task {
                    error = await personal.entrar(pin: pin)
                    trabajando = false
                    pin = ""
                    if error == nil { cerrar() }
                }
            }
            .buttonStyle(BotonPrincipal())
            .disabled(trabajando || pin.count < 4)
            .padding(.horizontal, 30)
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Marca.verdeProfundo.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }
}
