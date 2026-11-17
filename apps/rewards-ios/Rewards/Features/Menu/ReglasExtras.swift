import SwiftUI

/// Qué cae en cada sección de «Lo quiero», qué sale elegido solo y qué
/// viaja como nota.
///
/// **Espejo de `packages/utils/src/extras.ts`** (el kiosko, el POS y la app
/// web usan esa). Al tocar una, revisa la otra: es la lección del doble
/// scoop — dos copias de una regla de precios se separan solas.
enum ReglasExtras {
    private static func coincide(_ s: String, _ patron: String) -> Bool {
        s.trimmingCharacters(in: .whitespaces).range(of: patron, options: [.regularExpression, .caseInsensitive]) != nil
    }
    private static func limpio(_ s: String?) -> String { (s ?? "").trimmingCharacters(in: .whitespaces) }

    static func esBase(_ n: String) -> Bool { coincide(n, "^(leche\\b|agua\\b|sin leche)") }
    static func esProteina(_ n: String) -> Bool { coincide(n, "^prote[ií]na") }
    static func esGalleta(_ n: String) -> Bool { coincide(n, "galleta") }
    static func esGalletaPromo(_ e: ExtraProducto) -> Bool { esGalleta(e.nombre) && limpio(e.grupo).isEmpty }
    static func esDobleProteina(_ e: ExtraProducto) -> Bool { limpio(e.grupo).lowercased() == "doble" }
    static func esDobleScoop(_ n: String) -> Bool { coincide(n, "doble\\s+scoop") }
    static func esSinLeche(_ n: String) -> Bool { coincide(n, "^sin leche") }

    /// "Extra Roast Beef" → "Roast Beef".
    static func carneDeDoble(_ n: String) -> String {
        n.replacingOccurrences(of: "^\\s*extra\\s+", with: "", options: [.regularExpression, .caseInsensitive])
            .trimmingCharacters(in: .whitespaces)
    }

    private static let ordenBases = [
        "agua", "agua mineral", "leche entera", "leche deslactosada", "leche deslactosada light",
        "leche de almendras", "leche de avena", "leche de coco", "sin leche",
    ]

    static func ordenarBases(_ bases: [ExtraProducto]) -> [ExtraProducto] {
        func pos(_ n: String) -> Int { ordenBases.firstIndex(of: n.trimmingCharacters(in: .whitespaces).lowercased()) ?? 99 }
        return bases.sorted { a, b in
            pos(a.nombre) != pos(b.nombre) ? pos(a.nombre) < pos(b.nombre) : a.nombre.localizedCompare(b.nombre) == .orderedAscending
        }
    }

    static func baseDeCasa(_ bases: [ExtraProducto]) -> ExtraProducto? {
        bases.first { $0.por_defecto == true }
            ?? bases.first { esSinLeche($0.nombre) }
            ?? bases.first { coincide($0.nombre, "entera") }
            ?? bases.first { coincide($0.nombre, "deslactosada") && !coincide($0.nombre, "light") }
            ?? bases.first
    }

    /// Estrella de Admin; sin estrella y todo gratis, la primera; si algo
    /// cobra, NINGUNA — el precio lo pone lo que el cliente eligió.
    static func opcionDeGrupo(_ opciones: [ExtraProducto]) -> ExtraProducto? {
        if let marcada = opciones.first(where: { $0.por_defecto == true }) { return marcada }
        if opciones.contains(where: { $0.valor > 0 }) { return nil }
        return opciones.first
    }
    static func grupoEsOpcional(_ opciones: [ExtraProducto]) -> Bool { opcionDeGrupo(opciones) == nil }

    /// La base sin costo viaja como nota pegada al shake; «Sin leche» no se escribe.
    static func notaDeBase(_ base: ExtraProducto?) -> String? {
        guard let base, base.valor <= 0, !esSinLeche(base.nombre) else { return nil }
        return base.nombre
    }
    /// La base con precio va como renglón hijo cobrado.
    static func baseCobrada(_ base: ExtraProducto?) -> ExtraProducto? {
        guard let base, base.valor > 0 else { return nil }
        return base
    }

    /// El doble scoop de la marca elegida; si no empata y hay varios, ninguno.
    static func dobleScoopDe(_ dobles: [ExtraProducto], _ proteina: ExtraProducto?) -> ExtraProducto? {
        if let m = proteina?.marca, !m.isEmpty, let d = dobles.first(where: { $0.marca == m }) { return d }
        return dobles.count == 1 ? dobles[0] : nil
    }

    static func extraDisponible(_ e: ExtraProducto, _ gruposElegidos: Set<String>) -> Bool {
        let pide = limpio(e.requiere_grupo)
        return pide.isEmpty || gruposElegidos.contains(pide)
    }

    /// Los grupos de Admin que se pintan como «elige una», en el orden en que llegan.
    static func gruposDeExtras(_ extras: [ExtraProducto]) -> [(grupo: String, opciones: [ExtraProducto])] {
        var nombres: [String] = []
        for e in extras {
            guard let g = e.grupo, !g.isEmpty, g != "proteina", !esDobleProteina(e), !esBase(e.nombre), !esGalletaPromo(e) else { continue }
            if !nombres.contains(g) { nombres.append(g) }
        }
        return nombres.map { g in (grupo: g, opciones: extras.filter { $0.grupo == g }) }
    }

    static let ordenMarcas = ["OPTIMUM", "BIRDMAN FALCON", "BIRDMAN FALCON PERFORMANCE", "BIRDMAN FITMINGO", "CBUM", "ISO 100", "ISOPURE"]

    /// "Proteína CBUM - Churro" → ("CBUM", "Churro").
    static func marcaYSabor(_ nombre: String) -> (marca: String, sabor: String) {
        let n = nombre.trimmingCharacters(in: .whitespaces)
        if let rx = try? NSRegularExpression(pattern: "^prote[ií]na\\s+(.+?)\\s*[-–]\\s*(.+)$", options: [.caseInsensitive]),
           let m = rx.firstMatch(in: n, range: NSRange(n.startIndex..., in: n)),
           let r1 = Range(m.range(at: 1), in: n), let r2 = Range(m.range(at: 2), in: n) {
            return (String(n[r1]).uppercased(), String(n[r2]))
        }
        let sabor = n.replacingOccurrences(of: "^prote[ií]na\\s*", with: "", options: [.regularExpression, .caseInsensitive])
        return ("OTRAS", sabor)
    }

    static func marcasOrdenadas(_ proteinas: [ExtraProducto]) -> [String] {
        var vistas: [String] = []
        for p in proteinas { let m = marcaYSabor(p.nombre).marca; if !vistas.contains(m) { vistas.append(m) } }
        func pos(_ m: String) -> Int { ordenMarcas.firstIndex(of: m) ?? 99 }
        return vistas.sorted { a, b in pos(a) != pos(b) ? pos(a) < pos(b) : a < b }
    }

    static func proteinaDeCasa(_ proteinas: [ExtraProducto]) -> ExtraProducto? {
        proteinas.first { $0.por_defecto == true }
            ?? proteinas.first { coincide($0.nombre, "optimum") }
            ?? proteinas.first
    }

    /// «Preparado: Mazapán» dentro del grupo «Preparado» → «Mazapán».
    static func sinPrefijo(_ nombre: String, _ grupo: String) -> String {
        guard nombre.lowercased().hasPrefix(grupo.lowercased()) else { return nombre }
        let resto = String(nombre.dropFirst(grupo.count))
            .replacingOccurrences(of: "^\\s*[:\\-–]?\\s*", with: "", options: .regularExpression)
        return resto.isEmpty ? nombre : resto
    }
}

extension ExtraProducto {
    /// El precio sin opcional.
    var valor: Double { precio ?? 0 }
}

/// Pastillas que bajan de renglón cuando no caben (las bases, los sabores).
struct FilaFlexible: Layout {
    var espacio: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ancho = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, alto: CGFloat = 0, maxX: CGFloat = 0
        for s in subviews {
            let t = s.sizeThatFits(.unspecified)
            if x > 0 && x + t.width > ancho { x = 0; y += alto + espacio; alto = 0 }
            x += t.width + espacio
            maxX = max(maxX, x - espacio)
            alto = max(alto, t.height)
        }
        return CGSize(width: proposal.width ?? maxX, height: y + alto)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, alto: CGFloat = 0
        for s in subviews {
            let t = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + t.width > bounds.maxX { x = bounds.minX; y += alto + espacio; alto = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(t))
            x += t.width + espacio
            alto = max(alto, t.height)
        }
    }
}
