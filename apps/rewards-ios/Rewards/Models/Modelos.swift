import Foundation

// Los modelos calcan lo que devuelven las funciones de Supabase, con los
// mismos nombres que `packages/supabase/src/queries/lealtad.ts`. Casi todo
// es opcional a propósito: si el servidor agrega o deja de mandar un campo,
// la tarjeta sigue abriendo en vez de quedarse en blanco por un dato.

/// `fn_mi_resumen_lealtad()`: todo el expediente en un viaje.
struct Resumen: Decodable {
    var registrado: Bool?
    var tasa: Double?
    var cliente: Cliente?
    var progreso: Progreso?
    var sorpresa: [Sorpresa]?
    var paquetes: [Paquete]?
    var vida: Vida?
    var ganadas_total: Double?
    var cupones: [Cupon]?
    var favoritos: [Favorito]?
    var historial: [Compra]?
    var movimientos: [Movimiento]?

    struct Cliente: Decodable {
        var id: String
        var nombre: String
        var codigo: String?
        var telefono: String?
        var foto: String?
        var foto_propia: Bool?
        /// Ganadas por comprar (pueden caducar).
        var mancuernas: Double?
        /// Compradas con dinero real (no caducan).
        var saldo: Double?
        var total_canjeable: Double?
        var vale_pesos: Double?
        var desde: String?
    }

    struct Progreso: Decodable {
        var meta: Double?
        var faltan: Double?
        var pct: Double?
    }

    /// El guiño de la tarjeta 13+1. **Sin números**: el servidor solo manda
    /// una frase cuando ya está cerca (CLAUDE.md 2.4.6). No se calcula aquí.
    struct Sorpresa: Decodable, Identifiable {
        var tipo: String
        var nombre: String
        var estado: String
        var texto: String
        var id: String { tipo }
    }

    struct Paquete: Decodable, Identifiable {
        var nombre: String
        var precio: Double
        var mancuernas: Double
        var vale: Double
        var bono_pct: Double?
        var id: String { nombre }
    }

    struct Vida: Decodable {
        var visitas: Double?
        var gastado: Double?
        var ticket: Double?
        var ultima: String?
    }

    struct Cupon: Decodable, Identifiable {
        var codigo: String
        var beneficio: String
        var vence: String?
        var dias_restantes: Double?
        var id: String { codigo }
    }

    struct Favorito: Decodable, Identifiable {
        var nombre: String
        var veces: Double
        var id: String { nombre }
    }

    struct Compra: Decodable, Identifiable {
        var folio: Int
        var orden_id: String?
        var fecha: String
        var total: Double
        var items: String?
        var mancuernas: Double?
        var id: String { orden_id ?? String(folio) }
    }

    struct Movimiento: Decodable, Identifiable {
        var puntos: Double
        var descripcion: String
        var fecha: String
        var ts: String?
        var bolsa: String?
        var id: String { (ts ?? fecha) + descripcion + String(puntos) }
    }
}

/// `fn_mis_metas()`.
struct Meta: Decodable, Identifiable {
    var clave: String
    var nombre: String
    var descripcion: String
    var tipo: String
    var mancuernas: Double
    var veces: Double?
    var pendiente: Bool?
    var disponible: Bool?
    var id: String { clave }
}

/// `fn_meta_automatica(clave)`.
struct ResultadoMeta: Decodable {
    var acreditada: Bool
    var mancuernas: Double?
    var nombre: String?
    var motivo: String?
}

/// `fn_canjear_tarjeta(codigo)`.
struct TarjetaCanjeada: Decodable {
    var cargadas: Double
    var cliente: String?
    var saldo_nuevo: Double?
    var vale_pesos: Double?
}

/// Un renglón de la carta: `productos` con su categoría.
struct Producto: Decodable, Identifiable {
    var id: String
    var nombre: String
    var descripcion: String?
    var precio: Double
    var orden: Int?
    var imagen_url: String?
    var created_at: String?
    var categorias: Categoria?

    struct Categoria: Decodable {
        var nombre: String
        var orden: Int?
    }

    /// Entró al catálogo en los últimos 15 días.
    var esNuevo: Bool {
        guard let c = created_at, let fecha = ISO8601DateFormatter.flexible.date(from: c) else { return false }
        return Date().timeIntervalSince(fecha) < 15 * 24 * 3600
    }

    /// Igual que `nombreParaOrdenar`: «Scoop X» se lee como «X».
    var nombreVisible: String {
        let limpio = nombre.replacingOccurrences(
            of: #"^\s*scoop\s+"#, with: "", options: [.regularExpression, .caseInsensitive]
        ).trimmingCharacters(in: .whitespaces)
        return limpio.isEmpty ? nombre : limpio
    }
}

// Parámetros de las funciones. Structs y no diccionarios: así el compilador
// revisa los nombres, que son los de la base (p_nombre, p_clave…).
struct ParamNombre: Encodable, Sendable { let p_nombre: String? }
struct ParamClave: Encodable, Sendable { let p_clave: String }
struct ParamTelefono: Encodable, Sendable { let p_telefono: String }
struct ParamTarjeta: Encodable, Sendable { let p_codigo: String; let p_cliente_id: String? }

/// `fn_aliados()`: las marcas con las que colaboramos.
struct Aliado: Decodable, Identifiable {
    var id: String
    var nombre: String
    var descripcion: String?
    var logo_url: String?
    var promo_titulo: String?
    var promo_texto: String?
    var web: String?
    var whatsapp: String?
    var instagram: String?
    var telefono: String?
    var direccion: String?
    var orden: Int?
}

/// `fn_soy_personal()`: ¿el correo de esta sesión es de alguien del equipo?
struct SoyPersonal: Decodable {
    var es_personal: Bool
    var nombre: String?
    var rol: String?
}

/// `fn_menu_destacados()`: el lugar (1º, 2º, 3º) de un producto dentro de
/// su categoría por lo vendido en los últimos 60 días. Solo el lugar: las
/// cifras no son públicas.
struct Destacado: Decodable {
    var producto_id: String
    var categoria_id: String?
    var lugar: Int
}

extension ISO8601DateFormatter {
    /// Postgres manda "2026-09-30T14:05:11.123456+00:00": con o sin fracción.
    static let flexible: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    func date(flexible texto: String) -> Date? { date(from: texto) }
}

/// `fn_promos_vigentes()`: las promos que Admin → Promos tiene prendidas
/// ahora mismo (día, hora y vigencia ya filtrados en el servidor).
struct Promo: Decodable, Identifiable {
    var id: String
    var nombre: String
    var descripcion: String?
    var tipo: String
    var valor: Double?
    var cantidad: Int?
    var productos: [String]?
    var vence_en: String?

    /// Cómo se lee la promo: «2 × $25», «-15%», «-$10», «te regalamos…».
    var resumen: String {
        switch tipo {
        case "n_x_precio": return "\(cantidad ?? 2) × \(mxn(valor))"
        case "descuento_pct": return "-\(Int(((valor ?? 0) * 100).rounded()))%"
        case "descuento_monto": return "-\(mxn(valor))"
        case "producto_gratis": return "Regalo"
        default: return nombre
        }
    }
}

/// `vw_producto_extras`: con qué va un producto (la misma lista del kiosko).
struct ExtraProducto: Decodable, Identifiable {
    var extra_id: String
    var nombre: String
    var precio: Double?
    var grupo: String?
    var marca: String?
    var por_defecto: Bool?
    var activo: Bool?
    var id: String { extra_id }
}
