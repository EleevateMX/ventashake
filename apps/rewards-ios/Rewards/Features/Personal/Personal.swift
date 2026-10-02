import Foundation
import Supabase

/// El modo personal: la MISMA puerta que el kiosko (PIN → `staff-login` →
/// sesión de Supabase de ese empleado), en una conexión aparte.
///
/// Dos decisiones:
///  - **Conexión aparte.** La sesión del cliente (su tarjeta) y la del
///    empleado son cuentas distintas. Con una sola conexión, entrar como
///    personal sacaría al cliente de su tarjeta.
///  - **Solo en memoria.** Esta sesión no se guarda en el teléfono: al
///    cerrar la app se pide el PIN otra vez. Un celular se presta y se
///    pierde; una sesión de gerencia que sobrevive en él es una llave suelta.
///
/// Los permisos no se deciden aquí. Lo que se ve sale de funciones que ya
/// revisan el rol en el servidor (`fn_panel_en_vivo` exige gerencia,
/// `fn_personal_en_turno` exige personal).
@MainActor
final class Personal: ObservableObject {
    @Published var activo = false
    @Published var nombre: String?
    @Published var esJefe = false
    @Published var panel: PanelEnVivo?
    @Published var turno: EnTurno?
    @Published var actualizado: Date?
    @Published var error: String?
    /// Mi beneficio: lo que llevo hoy, lo que me queda y los precios.
    @Published var mi: MiPersonal?
    @Published var miError: String?
    /// El código vivo para la caja y cuándo vence (reloj del teléfono).
    @Published var codigo: String?
    @Published var codigoVence: Date?
    /// Hay una sesión guardada bajo Face ID en este teléfono.
    @Published var puedeFaceID = Llavero.tieneSesion && Llavero.biometriaDisponible
    private var ultimoRefresh: String?

    private let cliente = SupabaseClient(
        supabaseURL: Config.supabaseURL,
        supabaseKey: Config.llavePublicable,
        options: SupabaseClientOptions(auth: .init(storage: SoloEnMemoria()))
    )

    func entrar(pin: String) async -> String? {
        let limpio = pin.filter(\.isNumber)
        guard (4...6).contains(limpio.count) else { return "El PIN es de 4 a 6 dígitos." }
        do {
            let r: RespuestaPin = try await cliente.functions.invoke(
                "staff-login",
                options: FunctionInvokeOptions(body: ["pin": limpio])
            )
            guard r.ok, let token = r.token_hash else {
                return r.error?.mensaje ?? "PIN incorrecto"
            }
            _ = try await cliente.auth.verifyOTP(tokenHash: token, type: .magiclink)
            nombre = r.empleado?.nombre
            activo = true
            await guardarEnLlavero()
            await refrescar()
            await cargarMi()
            Tacto.exito()
            return nil
        } catch let FunctionsError.httpError(_, data) {
            Tacto.error()
            let r = try? JSONDecoder().decode(RespuestaPin.self, from: data)
            return r?.error?.mensaje ?? "PIN incorrecto"
        } catch {
            Tacto.error()
            return Estado.amable(error)
        }
    }

    #if DEBUG
    /// Modo vitrina (capturas): un cajero inventado, sin servidor.
    func activarVitrina() {
        activo = true
        nombre = "Alejandro"
        esJefe = false
        turno = Vitrina.turno
        mi = Vitrina.mi
        codigo = Vitrina.codigo
        codigoVence = Date().addingTimeInterval(118)
        actualizado = Date()
    }
    #endif

    // MARK: Face ID

    /// Guarda la sesión del PIN bajo biometría para abrir con Face ID la
    /// próxima vez. Si el teléfono no tiene Face ID, no guarda nada.
    private func guardarEnLlavero() async {
        guard Llavero.biometriaDisponible, let s = try? await cliente.auth.session else { return }
        guard s.refreshToken != ultimoRefresh else { return }
        let datos = try? JSONEncoder().encode(SesionGuardada(access: s.accessToken, refresh: s.refreshToken))
        if let datos, (try? Llavero.guardar(datos)) != nil {
            ultimoRefresh = s.refreshToken
            puedeFaceID = true
        }
    }

    /// Abre la sesión de personal con Face ID. `nil` = abierta, o cancelada
    /// por la persona (no es error); texto = qué pasó.
    func restaurarConFaceID() async -> String? {
        do {
            guard let datos = try Llavero.leer(motivo: "Abrir tu modo personal") else {
                puedeFaceID = false
                return "No hay sesión guardada: entra con tu PIN."
            }
            let g = try JSONDecoder().decode(SesionGuardada.self, from: datos)
            let s = try await cliente.auth.setSession(accessToken: g.access, refreshToken: g.refresh)
            ultimoRefresh = g.refresh
            if case let .string(n)? = s.user.userMetadata["nombre"] { nombre = n }
            activo = true
            await guardarEnLlavero()
            await refrescar()
            await cargarMi()
            Tacto.exito()
            return nil
        } catch Llavero.Falla.cancelado {
            return nil
        } catch {
            // La sesión guardada ya no sirve (caducó o la revocaron): se tira
            // y se pide el PIN. Un error aquí nunca deja una sesión a medias.
            Llavero.borrar()
            puedeFaceID = false
            return "Tu sesión de personal venció: entra con tu PIN."
        }
    }

    func salir() async {
        try? await cliente.auth.signOut()
        Llavero.borrar()
        puedeFaceID = false
        ultimoRefresh = nil
        activo = false
        nombre = nil
        esJefe = false
        panel = nil
        turno = nil
        mi = nil
        codigo = nil
        codigoVence = nil
    }

    // MARK: Mi beneficio

    /// Se pide al entrar y al jalar para actualizar, no cada 15 s: trae la
    /// lista de precios completa y no cambia a cada rato.
    func cargarMi() async {
        guard activo else { return }
        #if DEBUG
        if Vitrina.activa { return }
        #endif
        do {
            let m: MiPersonal = try await cliente.rpc("fn_mi_personal").execute().value
            mi = m
            miError = nil
        } catch {
            miError = Estado.amable(error)
        }
    }

    /// Un código SHKP-… de un solo uso que vive 2 minutos. La caja lo
    /// escanea en «Es para personal» en vez de teclear la clave.
    func pedirCodigo() async -> String? {
        #if DEBUG
        if Vitrina.activa { codigoVence = Date().addingTimeInterval(118); return nil }
        #endif
        do {
            let filas: [CodigoPersonal] = try await cliente.rpc("fn_personal_codigo_emitir").execute().value
            guard let c = filas.first else { return "No llegó el código. Intenta otra vez." }
            codigo = c.codigo
            codigoVence = Date().addingTimeInterval(TimeInterval(c.segundos))
            Tacto.ligero()
            return nil
        } catch {
            Tacto.error()
            return Estado.amable(error)
        }
    }

    /// Lo de cajero siempre; el panel con dinero solo si es gerencia. Que el
    /// servidor rechace el panel a un cajero es lo esperado, no un error.
    func refrescar() async {
        guard activo else { return }
        #if DEBUG
        if Vitrina.activa { actualizado = Date(); return }
        #endif
        do {
            let t: EnTurno = try await cliente.rpc("fn_personal_en_turno").execute().value
            turno = t
            esJefe = t.yo?.es_jefe ?? false
            nombre = t.yo?.nombre ?? nombre
            if esJefe {
                let p: PanelEnVivo = try await cliente
                    .rpc("fn_panel_en_vivo", params: ParamTodos(p_todos_los_pedidos: false))
                    .execute().value
                panel = p
            }
            actualizado = Date()
            error = nil
            await guardarEnLlavero()
        } catch {
            // La sesión del PIN caducó: se sale limpio en vez de mostrar
            // datos viejos como si fueran de ahora.
            if (try? await cliente.auth.session) == nil {
                await salir()
            } else {
                self.error = Estado.amable(error)
            }
        }
    }

    /// Manda la señal de recarga, la misma de Admin → «Actualizar el
    /// kiosko». La pantalla espera a estar libre (sin carrito ni ventana
    /// abierta) antes de recargarse: no corta una venta.
    func recargar(_ pantalla: String) async -> String {
        do {
            _ = try await cliente.rpc("fn_pantallas_recargar", params: ParamPantalla(p_pantalla: pantalla)).execute()
            Tacto.exito()
            return "Listo: se recarga en cuanto esté libre."
        } catch {
            Tacto.error()
            return Estado.amable(error)
        }
    }
}

/// Guarda la sesión del PIN solo mientras la app está abierta.
final class SoloEnMemoria: AuthLocalStorage, @unchecked Sendable {
    private var datos: [String: Data] = [:]
    private let candado = NSLock()

    func store(key: String, value: Data) throws {
        candado.lock(); defer { candado.unlock() }
        datos[key] = value
    }

    func retrieve(key: String) throws -> Data? {
        candado.lock(); defer { candado.unlock() }
        return datos[key]
    }

    func remove(key: String) throws {
        candado.lock(); defer { candado.unlock() }
        datos[key] = nil
    }
}

struct RespuestaPin: Decodable {
    var ok: Bool
    var token_hash: String?
    var empleado: Empleado?
    var error: Falla?

    struct Empleado: Decodable { var nombre: String?; var rol: String? }
    struct Falla: Decodable { var mensaje: String? }
}

struct ParamTodos: Encodable, Sendable { let p_todos_los_pedidos: Bool }
struct ParamPantalla: Encodable, Sendable { let p_pantalla: String }

/// `fn_personal_en_turno()`: lo del cajero, sin dinero.
struct EnTurno: Decodable {
    var ahora: String?
    var yo: Yo?
    var corte: Corte?
    var en_cocina: [EnCocina]?
    var impresoras: [Impresora]?
    var impresion_atorada: Int?

    struct Yo: Decodable { var nombre: String?; var rol: String?; var es_jefe: Bool? }
    struct Corte: Decodable { var desde: String?; var abrio: String?; var fondo: Double? }
}

struct EnCocina: Decodable, Identifiable {
    var estacion: String
    var estado: String
    var folio: Int
    var nombre: String?
    var minutos: Double
    var id: String { "\(folio)-\(estacion)" }
}

struct Impresora: Decodable, Identifiable {
    var nombre: String
    var en_linea: Bool
    var ultima_impresion: String?
    var id: String { nombre }
}

/// `fn_panel_en_vivo()`: lo de gerencia (el mismo de Admin → En vivo).
struct PanelEnVivo: Decodable {
    var ahora: String?
    var dia: Totales?
    var turno: Totales?
    var por_metodo: [String: Double]?
    var corte: EnTurno.Corte?
    var en_cocina: [EnCocina]?
    var pedidos_recientes: [Pedido]?
    var impresoras: [Impresora]?
    var impresion_atorada: Int?

    struct Totales: Decodable { var ordenes: Int?; var total: Double?; var ticket: Double? }

    struct Pedido: Decodable, Identifiable {
        var folio: Int
        var nombre: String?
        var hora: String?
        var total: Double
        var items: String?
        var id: Int { folio }
    }
}

/// `fn_mi_personal()`: solo contesta al propio empleado.
struct MiPersonal: Decodable {
    var nombre: String?
    var beneficio: Bool
    var motivo: String?
    var exige_turno: Bool?
    var tope: Double?
    var usado_importe: Double?
    var grupos: [Grupo]
    var hoy: [Consumo]
    var precios: [Precio]

    struct Grupo: Decodable, Identifiable {
        var slug: String; var nombre: String; var max: Int; var usado: Int
        var id: String { slug }
    }
    struct Consumo: Decodable, Identifiable {
        var producto: String; var cantidad: Int; var importe: Double; var hora: String?
        var id: String { "\(hora ?? "")-\(producto)" }
    }
    struct Precio: Decodable, Identifiable {
        var nombre: String; var categoria: String?; var precio: Double; var precio_personal: Double; var grupo: String?
        var id: String { "\(categoria ?? "")/\(nombre)" }
    }
}

struct CodigoPersonal: Decodable {
    var codigo: String
    var expira_en: String?
    var segundos: Int
}

private struct SesionGuardada: Codable { let access: String; let refresh: String }
