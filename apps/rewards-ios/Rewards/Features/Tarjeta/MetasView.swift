import SwiftUI

/// Las metas (`fn_mis_metas`). Las automáticas se cobran aquí y el servidor
/// comprueba el hecho; si dependiera de lo que dice el teléfono, la meta
/// sería un botón de regalarse mancuernas. Las que piden captura se mandan
/// desde la web por ahora.
struct MetasView: View {
    @EnvironmentObject var estado: Estado
    @State private var mensaje: String?
    @State private var cobrando: String?

    var body: some View {
        Hoja(titulo: "Metas") {
            ForEach(estado.metas) { m in
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(m.nombre).font(Marca.cuerpo(16, .semibold))
                        Text(m.descripcion).font(Marca.cuerpo(13)).foregroundStyle(Marca.tinta.opacity(0.65))
                        Text("+\(Int(m.mancuernas)) mancuernas").font(Marca.mono(12)).foregroundStyle(Marca.verde)
                    }
                    Spacer()
                    accion(m)
                }
                .padding(.vertical, 4)
            }
            if let mensaje {
                Text(mensaje).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.verde)
            }
        }
    }

    @ViewBuilder
    private func accion(_ m: Meta) -> some View {
        if m.pendiente == true {
            Text("En revisión").font(Marca.mono(11)).foregroundStyle(Marca.tinta.opacity(0.5))
        } else if m.tipo == "automatica" {
            if m.disponible == true {
                Button(cobrando == m.clave ? "…" : "Cobrar") {
                    cobrando = m.clave
                    Task {
                        mensaje = await estado.cobrarMeta(m)
                        cobrando = nil
                    }
                }
                .font(Marca.cuerpo(14, .bold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Marca.platano, in: Capsule())
                .foregroundStyle(Marca.tinta)
                .disabled(cobrando != nil)
            } else {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Marca.menta).font(.title3)
            }
        } else {
            Link("En la web", destination: Config.web)
                .font(Marca.cuerpo(13, .semibold))
                .foregroundStyle(Marca.verde)
        }
    }
}
