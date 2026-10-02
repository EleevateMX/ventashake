import SwiftUI
import AuthenticationServices

/// Entrar. Apple y Google, y nada más: la cuenta es la misma de la web
/// (mismo Supabase), así que quien ya entró en rewards.shakeaholic.mx con
/// Google encuentra aquí su tarjeta tal cual.
///
/// Apple va primero y no es adorno: si una app ofrece Google, la App Store
/// exige también "Iniciar sesión con Apple" (guideline 4.8).
struct LoginView: View {
    @EnvironmentObject var estado: Estado
    @State private var trabajando = false
    @State private var pidiendoPin = false

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            // El pasadizo del equipo: cinco toques seguidos a Milo abren el
            // PIN, igual que en el kiosko. Sin botón a la vista: la pantalla
            // es del cliente y el personal ya conoce el gesto.
            Image("Milo").resizable().scaledToFit().frame(width: 150)
                .contentShape(Rectangle())
                .onTapGesture(count: 5) {
                    Tacto.ligero()
                    pidiendoPin = true
                }
            VStack(spacing: 8) {
                Text("Shakeaholic Rewards")
                    .font(Marca.display(32))
                    .foregroundStyle(Marca.crema)
                    .multilineTextAlignment(.center)
                Text("Junta mancuernas en cada compra y cámbialas por tus favoritos.")
                    .font(Marca.cuerpo(16))
                    .foregroundStyle(Marca.crema.opacity(0.75))
                    .multilineTextAlignment(.center)
            }
            Spacer()

            if let error = estado.error {
                Text(error)
                    .font(Marca.cuerpo(14, .medium))
                    .foregroundStyle(Marca.fresa)
                    .multilineTextAlignment(.center)
            }

            SignInWithAppleButton(.continue) { peticion in
                estado.pedirApple(peticion)
            } onCompletion: { resultado in
                Task { await estado.terminarApple(resultado) }
            }
            .signInWithAppleButtonStyle(.white)
            .frame(height: 54)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            Button {
                trabajando = true
                Task {
                    await estado.entrarConGoogle()
                    trabajando = false
                }
            } label: {
                HStack(spacing: 10) {
                    Text("G").font(Marca.cuerpo(20, .bold))
                    Text("Continuar con Google").font(Marca.cuerpo(18, .semibold))
                }
                .foregroundStyle(Marca.tinta)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(Marca.platano, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(Presionable())
            .disabled(trabajando)

            Text("Al entrar aceptas que guardemos tu nombre y tus compras para darte tus recompensas.")
                .font(Marca.cuerpo(12))
                .foregroundStyle(Marca.crema.opacity(0.5))
                .multilineTextAlignment(.center)
                .padding(.bottom, 8)
        }
        .padding(.horizontal, 24)
        .sheet(isPresented: $pidiendoPin) { EntrarPersonal() }
    }
}

