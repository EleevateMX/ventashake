import SwiftUI
import PhotosUI
import Supabase

/// «Editar mi perfil»: foto, nombre, teléfono y cumpleaños. La foto va al
/// bucket `avatares` en la carpeta del propio usuario (las políticas del
/// bucket no dejan otra) y se registra con `fn_guardar_mi_foto`, igual que
/// en la PWA. Nombre y cumpleaños van por `fn_mi_perfil_guardar`.
struct PerfilView: View {
    @EnvironmentObject var estado: Estado
    @Environment(\.dismiss) private var cerrar
    @State private var nombre = ""
    @State private var telefono = ""
    @State private var cumple: Date = Calendar.current.date(byAdding: .year, value: -25, to: .now) ?? .now
    @State private var tieneCumple = false
    @State private var foto: String?
    @State private var seleccion: PhotosPickerItem?
    @State private var subiendoFoto = false
    @State private var guardando = false
    @State private var mensaje: String?
    @State private var error: String?

    struct Perfil: Decodable {
        var nombre: String?; var telefono: String?; var email: String?
        var fecha_nacimiento: String?; var foto: String?; var foto_propia: Bool?
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Editar mi perfil").font(Marca.display(28)).foregroundStyle(Marca.crema).padding(.top, 18)

                HStack(spacing: 16) {
                    ZStack {
                        AsyncImage(url: foto.flatMap(URL.init(string:))) { img in
                            img.resizable().scaledToFill()
                        } placeholder: {
                            Image("Milo").resizable().scaledToFit().padding(10)
                        }
                        .frame(width: 92, height: 92)
                        .background(Marca.cremaCalida)
                        .clipShape(Circle())
                        if subiendoFoto { ProgressView().tint(Marca.verde) }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        PhotosPicker(selection: $seleccion, matching: .images) {
                            Label("Cambiar foto", systemImage: "camera.fill")
                                .font(Marca.cuerpo(14, .semibold))
                                .foregroundStyle(Marca.tinta)
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .background(Marca.platano, in: Capsule())
                        }
                        .disabled(subiendoFoto)
                        Text("Se ve en tu tarjeta y en la caja.").font(Marca.cuerpo(12)).foregroundStyle(Marca.crema.opacity(0.55))
                    }
                }

                Hoja {
                    Campo(titulo: "Nombre") {
                        TextField("Tu nombre", text: $nombre).textInputAutocapitalization(.words)
                    }
                    Campo(titulo: "Teléfono (10 dígitos)") {
                        TextField("9991234567", text: $telefono).keyboardType(.numberPad)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Toggle(isOn: $tieneCumple) {
                            Text("Cumpleaños").font(Marca.mono(10)).tracking(1.5).foregroundStyle(Marca.tinta.opacity(0.5))
                        }
                        .tint(Marca.verde)
                        if tieneCumple {
                            DatePicker("", selection: $cumple, in: ...Date(), displayedComponents: .date)
                                .datePickerStyle(.compact).labelsHidden().tint(Marca.verde)
                            Text("Para tu cupón de cumpleaños.").font(Marca.cuerpo(12)).foregroundStyle(Marca.tinta.opacity(0.5))
                        }
                    }
                }

                if let error { Text(error).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.fresa) }
                if let mensaje { Text(mensaje).font(Marca.cuerpo(14, .medium)).foregroundStyle(Marca.menta) }

                Button(guardando ? "Guardando…" : "Guardar") { Task { await guardar() } }
                    .buttonStyle(BotonPrincipal())
                    .disabled(guardando)
                Button("Cerrar") { cerrar() }
                    .buttonStyle(BotonPrincipal(fondo: Marca.tinta, texto: Marca.crema))
            }
            .padding(.horizontal, 22).padding(.bottom, 30)
        }
        .background(Marca.verdeProfundo.ignoresSafeArea())
        .task { await cargar() }
        .onChange(of: seleccion) { _, item in
            guard let item else { return }
            Task { await subir(item) }
        }
    }

    private func cargar() async {
        let c = estado.resumen?.cliente
        nombre = c?.nombre ?? ""
        telefono = c?.telefono ?? ""
        foto = c?.foto
        #if DEBUG
        if Vitrina.activa { return }
        #endif
        if let p: Perfil = try? await supabase.rpc("fn_mi_perfil").execute().value {
            nombre = p.nombre ?? nombre
            telefono = p.telefono ?? telefono
            foto = p.foto ?? foto
            if let f = p.fecha_nacimiento, let d = Self.fecha.date(from: f) { cumple = d; tieneCumple = true }
        }
    }

    private static let fecha: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()

    private func subir(_ item: PhotosPickerItem) async {
        subiendoFoto = true; error = nil
        defer { subiendoFoto = false }
        do {
            guard let datos = try await item.loadTransferable(type: Data.self), let ui = UIImage(data: datos) else {
                error = "No pudimos leer esa foto."; return
            }
            // 512 px bastan para un círculo: una foto de 12 MP tarda y no se ve.
            let lado: CGFloat = 512
            let escala = min(1, lado / max(ui.size.width, ui.size.height))
            let tam = CGSize(width: ui.size.width * escala, height: ui.size.height * escala)
            let chica = UIGraphicsImageRenderer(size: tam).image { _ in ui.draw(in: CGRect(origin: .zero, size: tam)) }
            guard let jpeg = chica.jpegData(compressionQuality: 0.85) else { error = "No pudimos preparar la foto."; return }
            let uid = try await supabase.auth.session.user.id.uuidString.lowercased()
            let ruta = "\(uid)/\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
            try await supabase.storage.from("avatares").upload(ruta, data: jpeg, options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: false))
            let url = try supabase.storage.from("avatares").getPublicURL(path: ruta)
            struct P: Encodable, Sendable { let p_url: String }
            _ = try await supabase.rpc("fn_guardar_mi_foto", params: P(p_url: url.absoluteString)).execute()
            foto = url.absoluteString
            Tacto.exito()
            await estado.sincronizar()
        } catch {
            self.error = Estado.amable(error)
        }
    }

    private func guardar() async {
        guardando = true; error = nil; mensaje = nil
        defer { guardando = false }
        let limpio = telefono.filter(\.isNumber)
        if !limpio.isEmpty, limpio != (estado.resumen?.cliente?.telefono ?? "") {
            if let e = await estado.guardarTelefono(limpio) { error = e; return }
        }
        struct P: Encodable, Sendable { let p_nombre: String?; let p_fecha_nacimiento: String?; let p_borrar_cumple: Bool }
        do {
            _ = try await supabase.rpc("fn_mi_perfil_guardar", params: P(
                p_nombre: nombre.trimmingCharacters(in: .whitespaces),
                p_fecha_nacimiento: tieneCumple ? Self.fecha.string(from: cumple) : nil,
                p_borrar_cumple: !tieneCumple
            )).execute()
            await estado.sincronizar()
            Tacto.exito()
            mensaje = "Guardado."
        } catch {
            self.error = Estado.amable(error)
        }
    }
}

private struct Campo<Contenido: View>: View {
    let titulo: String
    @ViewBuilder var contenido: Contenido
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(titulo.uppercased()).font(Marca.mono(10)).tracking(1.5).foregroundStyle(Marca.tinta.opacity(0.5))
            contenido
                .font(Marca.cuerpo(16))
                .padding(12)
                .background(.white, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}
