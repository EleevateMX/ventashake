import SwiftUI
import PhotosUI
import Supabase

/// Las metas (`fn_mis_metas`). Las automáticas se cobran aquí y el servidor
/// comprueba el hecho; si dependiera de lo que dice el teléfono, la meta
/// sería un botón de regalarse mancuernas. Las que piden captura (reseña,
/// historia) se mandan desde aquí mismo (17/11/26): antes mandaban a la web,
/// y entrar ahí con Google creaba una cuenta aparte si se usó Apple.
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
        } else if m.disponible == true {
            BotonCaptura(meta: m) { mensaje = $0 }
        } else {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Marca.menta).font(.title3)
        }
    }
}

/// Elegir la captura de la galería, subirla al bucket `evidencias` (carpeta
/// del propio usuario, como la PWA) y mandarla a revisión.
private struct BotonCaptura: View {
    let meta: Meta
    let alTerminar: (String) -> Void
    @EnvironmentObject var estado: Estado
    @State private var seleccion: PhotosPickerItem?
    @State private var subiendo = false

    var body: some View {
        PhotosPicker(selection: $seleccion, matching: .images) {
            Text(subiendo ? "Subiendo…" : "Subir captura")
                .font(Marca.cuerpo(13, .bold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Marca.platano, in: Capsule())
                .foregroundStyle(Marca.tinta)
        }
        .disabled(subiendo)
        .onChange(of: seleccion) { _, item in
            guard let item else { return }
            Task { await subir(item) }
        }
    }

    private func subir(_ item: PhotosPickerItem) async {
        subiendo = true
        defer { subiendo = false; seleccion = nil }
        do {
            guard let datos = try await item.loadTransferable(type: Data.self), let ui = UIImage(data: datos) else {
                alTerminar("No pudimos leer esa imagen."); return
            }
            // 1600 px: se lee bien la reseña y no tarda en subir.
            let lado: CGFloat = 1600
            let escala = min(1, lado / max(ui.size.width, ui.size.height))
            let tam = CGSize(width: ui.size.width * escala, height: ui.size.height * escala)
            let chica = UIGraphicsImageRenderer(size: tam).image { _ in ui.draw(in: CGRect(origin: .zero, size: tam)) }
            guard let jpeg = chica.jpegData(compressionQuality: 0.85) else { alTerminar("No pudimos preparar la imagen."); return }
            let uid = try await supabase.auth.session.user.id.uuidString.lowercased()
            let ruta = "\(uid)/\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
            try await supabase.storage.from("evidencias").upload(ruta, data: jpeg, options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: false))
            let url = try supabase.storage.from("evidencias").getPublicURL(path: ruta)
            struct P: Encodable, Sendable { let p_clave: String; let p_url: String; let p_nota: String? }
            _ = try await supabase.rpc("fn_meta_enviar_evidencia", params: P(p_clave: meta.clave, p_url: url.absoluteString, p_nota: nil)).execute()
            Tacto.exito()
            alTerminar("Captura enviada. En cuanto la revisemos se te abonan \(Int(meta.mancuernas)) mancuernas.")
            await estado.sincronizar()
        } catch {
            Tacto.error()
            alTerminar(Estado.amable(error))
        }
    }
}
