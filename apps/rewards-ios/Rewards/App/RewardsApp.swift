import SwiftUI

@main
struct RewardsApp: App {
    @UIApplicationDelegateAdaptor(Push.self) private var push
    @StateObject private var estado = Estado()
    @StateObject private var personal = Personal()
    @StateObject private var pedidos = Pedidos()

    var body: some Scene {
        WindowGroup {
            RaizView()
                .environmentObject(estado)
                .environmentObject(personal)
                .environmentObject(pedidos)
                .task { await pedidos.cargarConfig() }
                .task {
                    #if DEBUG
                    if Vitrina.activa { personal.activarVitrina() }
                    #endif
                    await estado.arrancar()
                }
                .preferredColorScheme(.light)
        }
    }
}

/// Arranque → Entrar → La app, según haya sesión.
struct RaizView: View {
    @EnvironmentObject var estado: Estado
    @EnvironmentObject var personal: Personal

    var body: some View {
        ZStack {
            Marca.verdeProfundo.ignoresSafeArea()
            switch estado.fase {
            case .arrancando, .cargando:
                Arranque()
                    .transition(.opacity)
            case .sinSesion:
                // Alguien del personal puede entrar solo con su PIN, sin
                // cuenta de cliente: ve únicamente su pestaña.
                if personal.activo { PersonalView() } else { LoginView() }
            case .lista:
                Pestanas()
                    .transition(.opacity.combined(with: .scale(scale: 0.97)))
            }
        }
        .animation(.easeOut(duration: 0.35), value: estado.fase)
        .animation(.easeOut(duration: 0.3), value: personal.activo)
    }
}

/// La pantalla de carga: Milo llega con un rebote y «camina» mientras se
/// trae la tarjeta. Mismo Milo y mismo verde que la pantalla de lanzamiento
/// del sistema, para que de ahí a aquí no se note el corte.
private struct Arranque: View {
    @State private var llego = false
    @State private var paso = false

    var body: some View {
        VStack(spacing: 26) {
            Image("Milo").resizable().scaledToFit().frame(width: 140)
                .scaleEffect(llego ? 1 : 0.7)
                .opacity(llego ? 1 : 0)
                .rotationEffect(.degrees(paso ? 3 : -3), anchor: .bottom)
                .offset(y: paso ? -5 : 0)
            PuntosCargando()
                .opacity(llego ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.6)) { llego = true }
            withAnimation(.easeInOut(duration: 0.42).repeatForever(autoreverses: true).delay(0.3)) { paso = true }
        }
    }
}

/// Tres mancuernitas que se encienden por turnos, en vez de la rueda gris
/// del sistema.
private struct PuntosCargando: View {
    @State private var activo = 0
    private let reloj = Timer.publish(every: 0.28, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 10) {
            ForEach(0..<3, id: \.self) { i in
                Capsule()
                    .fill(i == activo ? Marca.platano : Marca.crema.opacity(0.25))
                    .frame(width: i == activo ? 22 : 10, height: 10)
                    .animation(.easeInOut(duration: 0.22), value: activo)
            }
        }
        .onReceive(reloj) { _ in activo = (activo + 1) % 3 }
    }
}

struct Pestanas: View {
    @EnvironmentObject var personal: Personal
    @EnvironmentObject var estado: Estado
    @State private var pestana = Pestanas.inicial

    /// Para capturas: `-pestana menu|aliados|cuenta|personal` abre ahí.
    private static var inicial: String {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        if let i = a.firstIndex(of: "-pestana"), i + 1 < a.count { return a[i + 1] }
        #endif
        return "tarjeta"
    }

    var body: some View {
        TabView(selection: $pestana) {
            TarjetaView()
                .tabItem { Label("Tarjeta", systemImage: "creditcard") }
                .tag("tarjeta")
            MenuView()
                .tabItem { Label("Menú", systemImage: "cup.and.saucer") }
                .tag("menu")
            AliadosTab()
                .tabItem { Label("Aliados", systemImage: "tag.fill") }
                .tag("aliados")
            CuentaView()
                .tabItem { Label("Cuenta", systemImage: "person.crop.circle") }
                .tag("cuenta")
            // La pestaña existe si ya hay sesión de personal o si el correo
            // con el que entró es del equipo; abrirla pide PIN o Face ID.
            if personal.activo || estado.soyPersonal?.es_personal == true {
                PersonalTab()
                    .tabItem { Label("Personal", systemImage: "storefront") }
                    .tag("personal")
            }
        }
        .tint(Marca.platano)
        .onAppear {
            let apariencia = UITabBarAppearance()
            apariencia.configureWithOpaqueBackground()
            apariencia.backgroundColor = UIColor(Marca.tinta)
            UITabBar.appearance().standardAppearance = apariencia
            UITabBar.appearance().scrollEdgeAppearance = apariencia
            UITabBar.appearance().unselectedItemTintColor = UIColor(Marca.crema.opacity(0.55))
        }
    }
}

/// El fondo verde con scroll que usan las cuatro pestañas.
struct Pantalla<Contenido: View>: View {
    let titulo: String
    /// Qué hace «jalar para actualizar». Por omisión, vuelve a traer el
    /// expediente.
    var alRefrescar: (() async -> Void)? = nil
    @ViewBuilder var contenido: Contenido
    @EnvironmentObject var estado: Estado

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(titulo)
                    .font(Marca.display(34))
                    .foregroundStyle(Marca.crema)
                    .padding(.top, 8)
                if let error = estado.error {
                    Text(error)
                        .font(Marca.cuerpo(14, .medium))
                        .foregroundStyle(.white)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Marca.fresa.opacity(0.85), in: RoundedRectangle(cornerRadius: 14))
                        .onTapGesture { estado.error = nil }
                }
                contenido
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 30)
        }
        .refreshable {
            if let alRefrescar { await alRefrescar() } else { await estado.sincronizar() }
        }
        .background(Marca.verdeProfundo.ignoresSafeArea())
        .scrollContentBackground(.hidden)
    }
}
