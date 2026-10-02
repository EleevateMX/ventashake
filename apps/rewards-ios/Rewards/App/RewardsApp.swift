import SwiftUI

@main
struct RewardsApp: App {
    @UIApplicationDelegateAdaptor(Push.self) private var push
    @StateObject private var estado = Estado()
    @StateObject private var personal = Personal()

    var body: some Scene {
        WindowGroup {
            RaizView()
                .environmentObject(estado)
                .environmentObject(personal)
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
            case .sinSesion:
                // Alguien del personal puede entrar solo con su PIN, sin
                // cuenta de cliente: ve únicamente su pestaña.
                if personal.activo { PersonalView() } else { LoginView() }
            case .lista:
                Pestanas()
            }
        }
        .animation(.easeOut(duration: 0.3), value: estado.fase)
        .animation(.easeOut(duration: 0.3), value: personal.activo)
    }
}

private struct Arranque: View {
    var body: some View {
        VStack(spacing: 18) {
            Image("Milo").resizable().scaledToFit().frame(width: 140)
            ProgressView().tint(Marca.platano)
        }
    }
}

struct Pestanas: View {
    @EnvironmentObject var personal: Personal

    var body: some View {
        TabView {
            TarjetaView()
                .tabItem { Label("Tarjeta", systemImage: "creditcard") }
            MenuView()
                .tabItem { Label("Menú", systemImage: "cup.and.saucer") }
            ActividadView()
                .tabItem { Label("Actividad", systemImage: "list.bullet") }
            CuentaView()
                .tabItem { Label("Cuenta", systemImage: "person.crop.circle") }
            if personal.activo {
                PersonalView()
                    .tabItem { Label("Personal", systemImage: "storefront") }
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
