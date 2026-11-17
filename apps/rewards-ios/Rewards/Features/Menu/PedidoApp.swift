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
        do {
            let r: R = try await supabase.functions.invoke("clip-checkout-crear", options: FunctionInvokeOptions(body: ParamOrden(orden_id: ordenId)))
            guard r.ok, let u = r.url, let url = URL(string: u) else {
                throw NSError(domain: "pedido", code: 1, userInfo: [NSLocalizedDescriptionKey: r.error?.mensaje ?? "No se pudo abrir el pago."])
            }
            return url
        } catch let FunctionsError.httpError(_, data) {
            // El servidor contesta JSON con el motivo; sin esto solo se vería
            // «non-2xx status code», que no le dice nada a nadie.
            let r = try? JSONDecoder().decode(R.self, from: data)
            throw NSError(domain: "pedido", code: 2, userInfo: [NSLocalizedDescriptionKey: r?.error?.mensaje ?? "No se pudo abrir el pago."])
        }
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
    @State private var proteinaId: String?
    @State private var marcaVista: String?
    @State private var baseId: String?
    @State private var doble = false
    @State private var dobleCarne: Set<String> = []
    @State private var porGrupo: [String: String] = [:]      // grupo → extra_id ("" = lo vació)
    @State private var galletaId: String?
    @State private var sueltos: Set<String> = []
    @State private var nota = ""
    @State private var fase: Fase = .armando
    @State private var mensaje: String?
    @State private var creado: PedidoCreado?
    @State private var pagoURL: URL?

    enum Fase { case armando, creando, pagando, confirmando, listo }

    // ── Las secciones: mismas reglas que el kiosko (ReglasExtras) ──
    private typealias R = ReglasExtras
    private var bases: [ExtraProducto] { R.ordenarBases(extras.filter { R.esBase($0.nombre) }) }
    private var proteinas: [ExtraProducto] { extras.filter { R.esProteina($0.nombre) } }
    private var marcas: [String] { R.marcasOrdenadas(proteinas) }
    private var dobles: [ExtraProducto] { extras.filter { R.esDobleScoop($0.nombre) } }
    private var doblesCarne: [ExtraProducto] { extras.filter { R.esDobleProteina($0) } }
    private var grupos: [(grupo: String, opciones: [ExtraProducto])] { R.gruposDeExtras(extras) }

    private var base: ExtraProducto? { bases.first { $0.extra_id == baseId } ?? R.baseDeCasa(bases) }
    private var proteina: ExtraProducto? { proteinas.first { $0.extra_id == proteinaId } ?? R.proteinaDeCasa(proteinas) }
    private var marcaAbierta: String? { marcaVista ?? proteina.map { R.marcaYSabor($0.nombre).marca } ?? marcas.first }
    private var dobleDeEsta: ExtraProducto? { R.dobleScoopDe(dobles, proteina) }
    private var elegidosDeGrupo: [ExtraProducto] {
        grupos.compactMap { g -> ExtraProducto? in
            if porGrupo[g.grupo] == "" { return nil }
            return g.opciones.first { $0.extra_id == porGrupo[g.grupo] } ?? R.opcionDeGrupo(g.opciones)
        }
    }
    private var gruposElegidos: Set<String> { Set(elegidosDeGrupo.compactMap { $0.grupo }) }
    private var galletas: [ExtraProducto] { extras.filter { R.esGalletaPromo($0) && R.extraDisponible($0, gruposElegidos) } }
    private var galleta: ExtraProducto? { galletas.first { $0.extra_id == galletaId } }
    private var adicionales: [ExtraProducto] {
        let enGrupo = Set(grupos.map { $0.grupo })
        let elegidos = gruposElegidos
        return extras.filter { e in
            !R.esBase(e.nombre) && !R.esProteina(e.nombre) && !R.esDobleScoop(e.nombre) && !R.esDobleProteina(e)
                && !R.esGalletaPromo(e) && !enGrupo.contains(e.grupo ?? "") && R.extraDisponible(e, elegidos)
        }
    }

    /// Todo lo que viaja como renglón hijo (y se cobra).
    private var hijos: [ExtraProducto] {
        var h: [ExtraProducto] = []
        if let b = R.baseCobrada(base) { h.append(b) }
        if let p = proteina { h.append(p) }
        if doble, let d = dobleDeEsta { h.append(d) }
        h += doblesCarne.filter { dobleCarne.contains($0.extra_id) }
        h += elegidosDeGrupo
        if let g = galleta { h.append(g) }
        h += adicionales.filter { sueltos.contains($0.extra_id) }
        return h
    }

    /// Solo para orientar: el total lo pone el servidor.
    private var estimado: Double {
        (producto.precio + hijos.map(\.valor).reduce(0, +)) * Double(cantidad)
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
            seccionProteina
            seccionBase
            seccionAdicional
            seccionGrupos
            seccionGalletas
            seccionExtras
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

    @ViewBuilder private var seccionProteina: some View {
        if !proteinas.isEmpty {
            Hoja(titulo: "Elige tu proteína") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(marcas, id: \.self) { m in
                            Opcion(texto: m, activa: m == marcaAbierta) { marcaVista = m }
                        }
                    }
                }
                Pastillas {
                    ForEach(proteinas.filter { R.marcaYSabor($0.nombre).marca == marcaAbierta }) { p in
                        Opcion(texto: R.marcaYSabor(p.nombre).sabor + (p.valor > 0 ? " +\(mxn(p.precio))" : ""), activa: p.extra_id == proteina?.extra_id) {
                            proteinaId = p.extra_id
                        }
                    }
                }
                if let proteina {
                    Text("Llevas: \(R.marcaYSabor(proteina.nombre).marca) · \(R.marcaYSabor(proteina.nombre).sabor)")
                        .font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.6))
                }
            }
        }
    }

    @ViewBuilder private var seccionBase: some View {
        if !bases.isEmpty {
            Hoja(titulo: "Elige tu base") {
                Pastillas {
                    ForEach(bases) { b in
                        Opcion(texto: b.nombre + (b.valor > 0 ? " +\(mxn(b.precio))" : ""), activa: b.extra_id == base?.extra_id) {
                            baseId = b.extra_id
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var seccionAdicional: some View {
        if dobleDeEsta != nil || !doblesCarne.isEmpty {
            Hoja(titulo: "Proteína adicional") {
                if let d = dobleDeEsta {
                    Casilla(texto: "Doble scoop" + (proteina.map { " · " + R.marcaYSabor($0.nombre).marca } ?? ""), precio: d.valor, activa: $doble)
                }
                ForEach(doblesCarne) { e in
                    Casilla(texto: "Doble " + R.carneDeDoble(e.nombre), precio: e.valor, activa: alternador(e.extra_id, en: $dobleCarne))
                }
            }
        }
    }

    @ViewBuilder private var seccionGrupos: some View {
        ForEach(grupos, id: \.grupo) { g in
            let opcional = R.grupoEsOpcional(g.opciones)
            let actual = elegidosDeGrupo.first { $0.grupo == g.grupo }?.extra_id
            Hoja(titulo: g.grupo) {
                if opcional {
                    Text("Opcional. Toca otra vez para quitarlo.").font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.55))
                }
                Pastillas {
                    ForEach(g.opciones) { e in
                        Opcion(texto: R.sinPrefijo(e.nombre, g.grupo) + (e.valor > 0 ? " +\(mxn(e.precio))" : ""), activa: e.extra_id == actual) {
                            porGrupo[g.grupo] = (e.extra_id == actual && opcional) ? "" : e.extra_id
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var seccionGalletas: some View {
        if !galletas.isEmpty {
            Hoja(titulo: "Galletas") {
                Pastillas {
                    ForEach(galletas) { e in
                        Opcion(texto: e.nombre + (e.valor > 0 ? " +\(mxn(e.precio))" : ""), activa: e.extra_id == galletaId) {
                            galletaId = galletaId == e.extra_id ? nil : e.extra_id
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var seccionExtras: some View {
        if !adicionales.isEmpty {
            Hoja(titulo: "Extras y adicionales") {
                ForEach(adicionales) { e in
                    Casilla(texto: e.nombre, precio: e.valor, activa: alternador(e.extra_id, en: $sueltos))
                }
            }
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

    private func alternador(_ id: String, en conjunto: Binding<Set<String>>) -> Binding<Bool> {
        Binding(get: { conjunto.wrappedValue.contains(id) },
                set: { on in if on { conjunto.wrappedValue.insert(id) } else { conjunto.wrappedValue.remove(id) } })
    }

    private func lineas() -> [LineaPedido] {
        // La base sin costo va pegada al shake como nota, igual que en el kiosko.
        let notaLimpia = nota.trimmingCharacters(in: .whitespaces)
        let personalizacion = [R.notaDeBase(base), notaLimpia.isEmpty ? nil : notaLimpia].compactMap { $0 }.joined(separator: ", ")
        var l = [LineaPedido(producto_id: producto.id, cantidad: cantidad, personalizacion: personalizacion.isEmpty ? nil : personalizacion, linea: "L1", padre_linea: nil)]
        for (i, e) in hijos.enumerated() {
            l.append(LineaPedido(producto_id: e.extra_id, cantidad: cantidad, personalizacion: nil, linea: "L\(i + 2)", padre_linea: "L1"))
        }
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

/// Pastillas que bajan de renglón (ver FilaFlexible).
private struct Pastillas<Contenido: View>: View {
    @ViewBuilder var contenido: Contenido
    var body: some View {
        let fila = FilaFlexible()
        fila { contenido }
    }
}

private struct Casilla: View {
    let texto: String; let precio: Double; @Binding var activa: Bool
    var body: some View {
        Toggle(isOn: $activa) {
            HStack {
                Text(texto).font(Marca.cuerpo(14))
                Spacer()
                Text(precio > 0 ? "+\(mxn(precio))" : "incluido").font(Marca.mono(12)).foregroundStyle(Marca.verde)
            }
        }
        .tint(Marca.verde)
    }
}

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

/// «Tu pedido» arriba de la tarjeta mientras haya uno vivo. Si quedó sin
/// pagar (se cerró la página de Clip, se cayó la red), desde aquí se
/// retoma el pago del MISMO pedido: no se crea otro.
struct MisPedidosView: View {
    @EnvironmentObject var pedidos: Pedidos
    @EnvironmentObject var estado: Estado
    @State private var pagoURL: URL?
    @State private var pagando: String?
    @State private var aviso: String?

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
                        Button(pagando == p.id ? "Abriendo el pago…" : "Pagar ahora · \(mxn(p.total))") {
                            Task { await pagar(p) }
                        }
                        .buttonStyle(BotonPrincipal())
                        .disabled(pagando != nil)
                        Text("Sin pago en 20 minutos, caduca solo.").font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.55))
                        if let aviso { Text(aviso).font(Marca.cuerpo(13, .medium)).foregroundStyle(Marca.fresa) }
                    }
                }
            }
            .sheet(item: Binding(get: { pagoURL.map { PagoURL(url: $0) } }, set: { pagoURL = $0?.url })) { u in
                PaginaDePago(url: u.url).ignoresSafeArea()
                    .onDisappear { Task { await confirmar() } }
            }
        }
    }

    private func pagar(_ p: MiPedido) async {
        aviso = nil
        pagando = p.id
        do { pagoURL = try await pedidos.enlaceDePago(ordenId: p.id) } catch { aviso = Estado.amable(error); pagando = nil }
    }

    private func confirmar() async {
        guard let id = pagando else { return }
        for intento in 0..<4 {
            if await pedidos.estadoDePago(ordenId: id) == "pagado" {
                Tacto.exito()
                pagando = nil
                await pedidos.cargarMios()
                await estado.sincronizar()
                return
            }
            if intento < 3 { try? await Task.sleep(nanoseconds: 2_000_000_000) }
        }
        pagando = nil
        aviso = "Todavía no vemos el pago. Si ya pagaste, dale un momento y jala para actualizar."
        await pedidos.cargarMios()
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
