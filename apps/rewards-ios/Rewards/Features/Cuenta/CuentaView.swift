import SwiftUI

struct CuentaView: View {
    @EnvironmentObject var estado: Estado
    @EnvironmentObject var personal: Personal
    @State private var telefono = ""
    @State private var mensaje: String?
    @State private var pidiendoPin = false

    var body: some View {
        Pantalla(titulo: "Cuenta") {
            let c = estado.resumen?.cliente
            Hoja {
                HStack(spacing: 14) {
                    AsyncImage(url: c?.foto.flatMap(URL.init(string:))) { img in
                        img.resizable().scaledToFill()
                    } placeholder: {
                        Image("Milo").resizable().scaledToFit().padding(6)
                    }
                    .frame(width: 64, height: 64)
                    .background(Marca.cremaCalida)
                    .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c?.nombre ?? "—").font(Marca.cuerpo(18, .semibold))
                        if let desde = c?.desde {
                            Text("Cliente desde \(desde)").font(Marca.cuerpo(13)).foregroundStyle(Marca.tinta.opacity(0.6))
                        }
                    }
                }
                Divider()
                Fila(etiqueta: "Código", valor: c?.codigo ?? "—")
                Fila(etiqueta: "Teléfono", valor: c?.telefono ?? "sin registrar")
            }

            if c?.telefono == nil {
                Hoja(titulo: "Tu teléfono") {
                    Text("Así te encontramos en caja aunque no traigas el celular.")
                        .font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.65))
                    TextField("10 dígitos", text: $telefono)
                        .keyboardType(.numberPad)
                        .font(Marca.mono(18))
                        .padding(12)
                        .background(.white, in: RoundedRectangle(cornerRadius: 12))
                    Button("Guardar") {
                        Task {
                            mensaje = await estado.guardarTelefono(telefono) ?? "Guardado."
                        }
                    }
                    .buttonStyle(BotonPrincipal())
                    if let mensaje {
                        Text(mensaje).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.verde)
                    }
                }
            }

            Hoja(titulo: "Cómo funciona") {
                Text("Cada compra suma mancuernas: 10 mancuernas valen $1. Enseña el QR de tu tarjeta al pagar y se suman solas; para usarlas, pídelo en caja.")
                    .font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.75))
            }

            Hoja {
                if personal.activo {
                    Text("Estás en modo personal: tienes la pestaña «Personal».")
                        .font(Marca.cuerpo(14, .medium))
                } else {
                    Button("¿Eres del equipo Shakeaholic? Entra con tu PIN") { pidiendoPin = true }
                        .font(Marca.cuerpo(15, .semibold))
                        .foregroundStyle(Marca.verde)
                }
            }

            Button("Cerrar sesión") { Task { await estado.salir() } }
                .buttonStyle(BotonPrincipal(fondo: Marca.tinta, texto: Marca.crema))
        }
        .sheet(isPresented: $pidiendoPin) { EntrarPersonal() }
    }
}

private struct Fila: View {
    let etiqueta: String
    let valor: String
    var body: some View {
        HStack {
            Text(etiqueta.uppercased()).font(Marca.mono(11)).tracking(1.5).foregroundStyle(Marca.tinta.opacity(0.5))
            Spacer()
            Text(valor).font(Marca.mono(14))
        }
    }
}
