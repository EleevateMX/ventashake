import SwiftUI
import SafariServices
import Supabase

/// Pedir y pagar desde la app: se arma el pedido, el servidor crea la orden
/// (el precio lo pone él), Clip cobra en su página y, en cuanto Clip dice
/// que se cobró, cocina lo prepara y llega el push de «listo».
/// Todo esto solo existe si gerencia lo prendió (`fn_pedidos_app_config`).

struct ConfigPedidos: Decodable {
    var activo: Bool
    var whatsapp: Bool
    var hora_inicio: String?
    var hora_fin: String?
    var minutos_preparacion: Int?
    var mensaje_cerrado: String?
    var abierto_ahora: Bool
}

struct PedidoCreado: Decodable {
    var id: String
    var folio: Int
    var total: Double
    var preparar_a: String?
}

struct MiPedido: Decodable, Identifiable {
    var id: String
    var folio: Int
    var total: Double
    var pagado: Bool
    var estado: String
    var hora: String?
    var preparar_a: String?
    var items: String?
    var nota: String?
    var nombre: String?
    var telefono: String?

    var titulo: String {
        switch estado {
        case "por_pagar": return "Sin pagar"
        case "recibido": return "Pagado · por preparar"
        case "preparando": return "Preparando"
        case "listo": return "Listo · pasa por él"
        case "entregado": return "Entregado"
        case "caducado": return "Caducó sin pagar"
        case "cancelado": return "Cancelado"
        default: return estado
        }
    }
    var vivo: Bool { !["entregado", "caducado", "cancelado"].contains(estado) }
}

struct LineaPedido: Encodable {
    var producto_id: String
    var cantidad: Int
    var personalizacion: String?
    var linea: String?
    var padre_linea: String?
}
struct ParamPedido: Encodable, Sendable { let p_items: [LineaPedido]; let p_nota: String? }
struct ParamOrden: Encodable, Sendable { let orden_id: String }

/// El flujo completo, sin pantalla: crear, cobrar, preguntar.
@MainActor
final class Pedidos: ObservableObject {
    @Published var config: ConfigPedidos?
    @Published var mios: [MiPedido] = []

    init() {
        NotificationCenter.default.addObserver(forName: .sesionSincronizada, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.cargarMios() }
        }
    }

    func cargarConfig() async {
        #if DEBUG
        if Vitrina.activa {
            config = ConfigPedidos(activo: true, whatsapp: true, hora_inicio: "07:00", hora_fin: "20:30", minutos_preparacion: 20, mensaje_cerrado: nil, abierto_ahora: true)
            mios = [MiPedido(id: "p1", folio: 2320, total: 125, pagado: true, estado: "preparando", hora: "13:02", preparar_a: "13:22", items: "1 × Choco Killer", nota: nil, nombre: "Alejandro", telefono: nil)]
            return
        }
        #endif
        let c: ConfigPedidos? = try? await supabase.rpc("fn_pedidos_app_config").execute().value
        config = c
    }

    func cargarMios() async {
        #if DEBUG
        if Vitrina.activa { return }
        #endif
        guard (try? await supabase.auth.session) != nil else { mios = []; return }
        let lista: [MiPedido]? = try? await supabase.rpc("fn_mis_pedidos_app").execute().value
        mios = lista ?? []
    }

    func crear(lineas: [LineaPedido], nota: String?) async throws -> PedidoCreado {
        try await supabase.rpc("fn_pedido_app_crear", params: ParamPedido(p_items: lineas, p_nota: nota)).execute().value
    }

    func enlaceDePago(ordenId: String) async throws -> URL {
        struct R: Decodable { var ok: Bool; var url: String?; var pagado: Bool?; var error: E?; struct E: Decodable { var mensaje: String? } }
        let r: R = try await supabase.functions.invoke("clip-checkout-crear", options: FunctionInvokeOptions(body: ParamOrden(orden_id: ordenId)))
        guard r.ok, let u = r.url, let url = URL(string: u) else {
            throw NSError(domain: "pedido", code: 1, userInfo: [NSLocalizedDescriptionKey: r.error?.mensaje ?? "No se pudo abrir el pago."])
        }
        return url
    }

    /// 'pagado' | 'pendiente' | 'fallido'
    func estadoDePago(ordenId: String) async -> String {
        struct R: Decodable { var ok: Bool; var estado: String? }
        let r: R? = try? await supabase.functions.invoke("clip-checkout-estado", options: FunctionInvokeOptions(body: ParamOrden(orden_id: ordenId)))
        return r?.estado ?? "pendiente"
    }
}

/// La página de pago de Clip, dentro de la app.
struct PaginaDePago: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.preferredControlTintColor = UIColor(Marca.verde)
        vc.dismissButtonStyle = .close
        return vc
    }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

/// La hoja «Lo quiero»: cantidad, con qué va, nota, y pedir y pagar.
struct PedidoSheet: View {
    let producto: Producto
    let extras: [ExtraProducto]
    @EnvironmentObject var estado: Estado
    @EnvironmentObject var pedidos: Pedidos
    @Environment(\.dismiss) private var cerrar

    @State private var cantidad = 1
    @State private var elegidos: [String: String] = [:]      // grupo → extra_id
    @State private var sueltos: Set<String> = []
    @State private var nota = ""
    @State private var fase: Fase = .armando
    @State private var mensaje: String?
    @State private var creado: PedidoCreado?
    @State private var pagoURL: URL?

    enum Fase { case armando, creando, pagando, confirmando, listo }

    private var grupos: [(String, [ExtraProducto])] {
        let d = Dictionary(grouping: extras.filter { !($0.grupo ?? "").isEmpty }) { $0.grupo ?? "" }
        return d.keys.sorted().map { ($0, d[$0] ?? []) }
    }
    private var extrasSueltos: [ExtraProducto] { extras.filter { ($0.grupo ?? "").isEmpty } }

    /// Solo para orientar: el total lo pone el servidor.
    private var estimado: Double {
        let porGrupo = grupos.compactMap { g in elegidos[g.0].flatMap { id in g.1.first { $0.extra_id == id }?.precio } }.reduce(0, +)
        let porSueltos = extrasSueltos.filter { sueltos.contains($0.extra_id) }.map { $0.precio ?? 0 }.reduce(0, +)
        return (producto.precio + porGrupo + porSueltos) * Double(cantidad)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Lo quiero").font(Marca.display(28)).foregroundStyle(Marca.crema).padding(.top, 18)
                Text(producto.nombreVisible).font(Marca.cuerpo(17, .semibold)).foregroundStyle(Marca.crema)

                switch fase {
                case .listo:
                    confirmacion
                case .armando:
                    formulario
                default:
                    VStack(spacing: 12) {
                        ProgressView().tint(Marca.platano)
                        Text(fase == .creando ? "Armando tu pedido…" : fase == .pagando ? "Esperando el pago…" : "Confirmando con Clip…")
                            .font(Marca.cuerpo(14)).foregroundStyle(Marca.crema.opacity(0.7))
                        if fase == .pagando, let pagoURL {
                            Button("Volver a abrir el pago") { self.pagoURL = pagoURL }
                                .font(Marca.cuerpo(14, .semibold)).foregroundStyle(Marca.platano)
                        }
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 30)
                }

                if let mensaje {
                    Text(mensaje).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.fresa).multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                Button(fase == .listo ? "Listo" : "Cancelar") { cerrar() }
                    .buttonStyle(BotonPrincipal(fondo: Marca.tinta, texto: Marca.crema))
            }
            .padding(.horizontal, 22).padding(.bottom, 30)
        }
        .background(Marca.verdeProfundo.ignoresSafeArea())
        .onAppear {
            for (g, lista) in grupos where elegidos[g] == nil {
                elegidos[g] = lista.first { $0.por_defecto == true }?.extra_id ?? lista.first?.extra_id
            }
        }
        .sheet(item: Binding(get: { pagoURL.map { PagoURL(url: $0) } }, set: { pagoURL = $0?.url })) { p in
            PaginaDePago(url: p.url).ignoresSafeArea()
                .onDisappear { Task { await confirmar() } }
        }
    }

    private var formulario: some View {
        VStack(alignment: .leading, spacing: 14) {
            Hoja(titulo: "Cuántos") {
                HStack(spacing: 18) {
                    Button { cantidad = max(1, cantidad - 1) } label: { Image(systemName: "minus.circle.fill").font(.system(size: 32)) }
                    Text("\(cantidad)").font(Marca.display(30)).foregroundStyle(Marca.tinta).frame(minWidth: 40)
                    Button { cantidad = min(10, cantidad + 1) } label: { Image(systemName: "plus.circle.fill").font(.system(size: 32)) }
                }
                .foregroundStyle(Marca.verde)
            }
            if !grupos.isEmpty || !extrasSueltos.isEmpty {
                Hoja(titulo: "Con qué va") {
                    ForEach(grupos, id: \.0) { grupo, lista in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(grupo.uppercased()).font(Marca.mono(10)).tracking(1.5).foregroundStyle(Marca.tinta.opacity(0.5))
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(lista) { e in
                                        Opcion(texto: e.nombre + ((e.precio ?? 0) > 0 ? " +\(mxn(e.precio))" : ""), activa: elegidos[grupo] == e.extra_id) {
                                            elegidos[grupo] = e.extra_id
                                        }
                                    }
                                }
                            }
                        }
                    }
                    ForEach(extrasSueltos) { e in
                        Toggle(isOn: Binding(get: { sueltos.contains(e.extra_id) }, set: { on in if on { sueltos.insert(e.extra_id) } else { sueltos.remove(e.extra_id) } })) {
                            HStack {
                                Text(e.nombre).font(Marca.cuerpo(14))
                                Spacer()
                                Text((e.precio ?? 0) > 0 ? "+\(mxn(e.precio))" : "incluido").font(Marca.mono(12)).foregroundStyle(Marca.verde)
                            }
                        }
                        .tint(Marca.verde)
                    }
                }
            }
            Hoja(titulo: "Algo que debamos saber") {
                TextField("Sin hielo, poco plátano…", text: $nota)
                    .font(Marca.cuerpo(15)).padding(12)
                    .background(.white, in: RoundedRectangle(cornerRadius: 12))
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Aproximado").font(Marca.cuerpo(14)).foregroundStyle(Marca.crema.opacity(0.7))
                    Spacer()
                    Text(mxn(estimado)).font(Marca.mono(20, .medium)).foregroundStyle(Marca.platano)
                }
                Text("El total exacto lo confirma la barra antes de cobrar. Pagas con tarjeta en la app y pasas por tu pedido en \(pedidos.config?.minutos_preparacion ?? 20) minutos.")
                    .font(Marca.cuerpo(12)).foregroundStyle(Marca.crema.opacity(0.5))
            }
            Button("Pedir y pagar") { Task { await pedir() } }
                .buttonStyle(BotonPrincipal())
        }
    }

    private var confirmacion: some View {
        VStack(spacing: 10) {
            Image("Milo").resizable().scaledToFit().frame(width: 110)
            Text("¡Pedido #\(creado?.folio ?? 0) pagado!").font(Marca.display(26)).foregroundStyle(Marca.crema)
            if let h = creado?.preparar_a {
                Text("Lo preparamos para las \(h). Te avisamos cuando esté listo.")
                    .font(Marca.cuerpo(15)).foregroundStyle(Marca.crema.opacity(0.8)).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 20)
    }

    private func lineas() -> [LineaPedido] {
        var l = [LineaPedido(producto_id: producto.id, cantidad: cantidad, personalizacion: nota.isEmpty ? nil : nota, linea: "L1", padre_linea: nil)]
        var n = 1
        for (g, _) in grupos { if let id = elegidos[g] { n += 1; l.append(LineaPedido(producto_id: id, cantidad: cantidad, personalizacion: nil, linea: "L\(n)", padre_linea: "L1")) } }
        for id in sueltos { n += 1; l.append(LineaPedido(producto_id: id, cantidad: cantidad, personalizacion: nil, linea: "L\(n)", padre_linea: "L1")) }
        return l
    }

    private func pedir() async {
        mensaje = nil
        fase = .creando
        do {
            let c = try await pedidos.crear(lineas: lineas(), nota: nota.isEmpty ? nil : nota)
            creado = c
            let url = try await pedidos.enlaceDePago(ordenId: c.id)
            fase = .pagando
            pagoURL = url
        } catch {
            mensaje = Estado.amable(error)
            fase = .armando
        }
    }

    /// Al cerrar la página de Clip: se pregunta hasta tres veces, con pausa.
    private func confirmar() async {
        guard let c = creado, fase != .listo else { return }
        fase = .confirmando
        for intento in 0..<4 {
            let e = await pedidos.estadoDePago(ordenId: c.id)
            if e == "pagado" {
                fase = .listo
                Tacto.exito()
                await pedidos.cargarMios()
                await estado.sincronizar()
                return
            }
            if e == "fallido" { break }
            if intento < 3 { try? await Task.sleep(nanoseconds: 2_000_000_000) }
        }
        fase = .pagando
        mensaje = "Todavía no vemos el pago. Si ya pagaste, espera un momento; si no, vuelve a abrir el pago."
    }
}

private struct PagoURL: Identifiable { let url: URL; var id: String { url.absoluteString } }

private struct Opcion: View {
    let texto: String; let activa: Bool; let accion: () -> Void
    var body: some View {
        Button(action: accion) {
            Text(texto).font(Marca.cuerpo(13, .semibold))
                .foregroundStyle(activa ? Marca.crema : Marca.tinta)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(activa ? Marca.verde : Marca.cremaCalida, in: Capsule())
        }
        .buttonStyle(Presionable())
    }
}

/// «Tu pedido» arriba de la tarjeta mientras haya uno vivo.
struct MisPedidosView: View {
    @EnvironmentObject var pedidos: Pedidos
    var body: some View {
        let vivos = pedidos.mios.filter(\.vivo)
        if !vivos.isEmpty {
            ForEach(vivos) { p in
                Hoja {
                    HStack {
                        Etiqueta(texto: "Tu pedido #\(String(p.folio))", color: Marca.verde)
                        Spacer()
                        if let h = p.preparar_a { Text("para las \(h)").font(Marca.mono(12)).foregroundStyle(Marca.tinta.opacity(0.6)) }
                    }
                    Text(p.titulo).font(Marca.display(22)).foregroundStyle(p.estado == "listo" ? Marca.verde : Marca.tinta)
                    if let items = p.items { Text(items).font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.7)) }
                    if p.estado == "por_pagar" {
                        Text("Sin pago en 20 minutos, caduca solo.").font(Marca.cuerpo(12)).foregroundStyle(Marca.fresa)
                    }
                }
            }
        }
    }
}

/// Lo de hoy para el personal: qué pedidos de la app hay y en qué van.
struct PedidosAppPersonal: View {
    @EnvironmentObject var personal: Personal
    var body: some View {
        if !personal.pedidosApp.isEmpty {
            Hoja(titulo: "Pedidos por la app") {
                ForEach(personal.pedidosApp) { p in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text("#\(String(p.folio)) · \(p.nombre ?? "cliente")").font(Marca.cuerpo(15, .semibold))
                            Spacer()
                            if let h = p.preparar_a { Text(h).font(Marca.mono(12)).foregroundStyle(Marca.tinta.opacity(0.5)) }
                        }
                        if let items = p.items { Text(items).font(Marca.cuerpo(13)).foregroundStyle(Marca.tinta.opacity(0.7)) }
                        if let n = p.nota, !n.isEmpty { Text("«\(n)»").font(Marca.cuerpo(13)).foregroundStyle(Marca.tinta.opacity(0.7)) }
                        HStack {
                            Etiqueta(texto: p.titulo, color: p.estado == "listo" ? Marca.verde : Marca.tinta.opacity(0.55))
                            Spacer()
                            if p.estado == "listo" {
                                Button("Entregado") { Task { await personal.entregar(p.id) } }
                                    .font(Marca.cuerpo(13, .semibold)).foregroundStyle(Marca.verde)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }
}
