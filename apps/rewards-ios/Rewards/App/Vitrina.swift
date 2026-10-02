import Foundation

/// Modo vitrina: datos inventados para capturas de pantalla (App Store,
/// diseño, publicidad). Solo existe en compilaciones de desarrollo y solo
/// se prende con el argumento de arranque `-vitrina`:
///
///     xcrun simctl launch booted mx.shakeaholic.rewards -vitrina
///
/// No toca sesión ni servidor: la tarjeta, la actividad y el modo personal
/// se pintan desde aquí. El menú sí es el real (se lee sin sesión).
enum Vitrina {
    static var activa: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("-vitrina")
        #else
        return false
        #endif
    }

    #if DEBUG
    static let resumen = Resumen(
        registrado: true,
        tasa: 0.1,
        cliente: Resumen.Cliente(
            id: "vitrina", nombre: "Alejandro", codigo: "SHK-A7K2M9", telefono: "9991234567",
            foto: nil, foto_propia: false,
            mancuernas: 613, saldo: 150, total_canjeable: 763, vale_pesos: 76.3,
            desde: "marzo 2026"
        ),
        progreso: Resumen.Progreso(meta: 1000, faltan: 237, pct: 76.3),
        sorpresa: [
            Resumen.Sorpresa(tipo: "bebidas", nombre: "Tarjeta de bebidas", estado: "cerca",
                             texto: "Con un par de visitas más, quizá te llegue una sorpresa."),
        ],
        paquetes: [
            Resumen.Paquete(nombre: "Recarga $200", precio: 200, mancuernas: 2200, vale: 220, bono_pct: 10),
            Resumen.Paquete(nombre: "Recarga $500", precio: 500, mancuernas: 6000, vale: 600, bono_pct: 20),
        ],
        vida: Resumen.Vida(visitas: 47, gastado: 5890, ticket: 125.3, ultima: "1 oct"),
        ganadas_total: 1890,
        cupones: [
            Resumen.Cupon(codigo: "SHKC-4F7Q", beneficio: "Americano frío de regalo", vence: "2026-10-15", dias_restantes: 13),
        ],
        favoritos: [
            Resumen.Favorito(nombre: "Chocokiller", veces: 14),
            Resumen.Favorito(nombre: "Fresas con crema", veces: 9),
            Resumen.Favorito(nombre: "Wrap de pollo", veces: 6),
        ],
        historial: [
            Resumen.Compra(folio: 2316, orden_id: "o1", fecha: "1 oct", total: 135, items: "Chocokiller · Doble scoop", mancuernas: 13),
            Resumen.Compra(folio: 2290, orden_id: "o2", fecha: "29 sep", total: 184, items: "Wrap de pollo, Americano frío", mancuernas: 18),
            Resumen.Compra(folio: 2251, orden_id: "o3", fecha: "27 sep", total: 125, items: "Fresas con crema", mancuernas: 12),
            Resumen.Compra(folio: 2198, orden_id: "o4", fecha: "24 sep", total: 69, items: "El Clásico", mancuernas: 6),
        ],
        movimientos: [
            Resumen.Movimiento(puntos: 13, descripcion: "Compra #2316", fecha: "1 oct", ts: "1", bolsa: "ganadas"),
            Resumen.Movimiento(puntos: 50, descripcion: "Meta: tu reseña en Google", fecha: "30 sep", ts: "2", bolsa: "ganadas"),
            Resumen.Movimiento(puntos: 18, descripcion: "Compra #2290", fecha: "29 sep", ts: "3", bolsa: "ganadas"),
            Resumen.Movimiento(puntos: -300, descripcion: "Canje en caja", fecha: "27 sep", ts: "4", bolsa: "ganadas"),
            Resumen.Movimiento(puntos: 150, descripcion: "Tarjeta de regalo", fecha: "20 sep", ts: "5", bolsa: "saldo"),
        ]
    )

    static let metas = [
        Meta(clave: "app_5_dias", nombre: "Abre la app 5 días seguidos", descripcion: "Entra cada día y suma.",
             tipo: "automatica", mancuernas: 20, veces: 1, pendiente: false, disponible: true),
        Meta(clave: "resena", nombre: "Déjanos tu reseña", descripcion: "Cuéntale a Google cómo te fue y manda la captura.",
             tipo: "evidencia", mancuernas: 50, veces: 0, pendiente: true, disponible: false),
        Meta(clave: "perfil", nombre: "Completa tu perfil", descripcion: "Tu foto y tu teléfono.",
             tipo: "automatica", mancuernas: 15, veces: 0, pendiente: false, disponible: false),
    ]

    static let turno = EnTurno(
        ahora: "16:50",
        yo: EnTurno.Yo(nombre: "Alejandro", rol: "cajero", es_jefe: false),
        corte: EnTurno.Corte(desde: "07:02", abrio: "Perla", fondo: 1500),
        en_cocina: [
            EnCocina(estacion: "bebidas", estado: "preparando", folio: 2317, nombre: "Chocokiller", minutos: 2.5),
            EnCocina(estacion: "alimentos", estado: "pendiente", folio: 2318, nombre: "Wrap de pollo", minutos: 4),
        ],
        impresoras: [
            Impresora(nombre: "Barra", en_linea: true, ultima_impresion: "16:48"),
            Impresora(nombre: "Cocina", en_linea: true, ultima_impresion: "16:41"),
        ],
        impresion_atorada: 0
    )

    static let mi = MiPersonal(
        nombre: "Alejandro", beneficio: true, motivo: nil, exige_turno: true,
        tope: 280, usado_importe: 65,
        grupos: [
            MiPersonal.Grupo(slug: "shake", nombre: "Shakes", max: 1, usado: 1),
            MiPersonal.Grupo(slug: "alimento", nombre: "Alimentos", max: 1, usado: 0),
            MiPersonal.Grupo(slug: "bebida", nombre: "Bebidas", max: 1, usado: 0),
            MiPersonal.Grupo(slug: "snacks", nombre: "Snacks", max: 1, usado: 0),
        ],
        hoy: [MiPersonal.Consumo(producto: "Chocokiller", cantidad: 1, importe: 65, hora: "13:12")],
        precios: [
            MiPersonal.Precio(nombre: "Chocokiller", categoria: "Shakes", precio: 125, precio_personal: 65, grupo: "shake"),
            MiPersonal.Precio(nombre: "El Clásico", categoria: "Shakes", precio: 69, precio_personal: 49, grupo: "shake"),
            MiPersonal.Precio(nombre: "Fresas con crema", categoria: "Shakes", precio: 125, precio_personal: 65, grupo: "shake"),
            MiPersonal.Precio(nombre: "Wrap de pollo", categoria: "Alimentos", precio: 115, precio_personal: 75, grupo: "alimento"),
            MiPersonal.Precio(nombre: "Americano", categoria: "Bebidas", precio: 45, precio_personal: 25, grupo: "bebida"),
            MiPersonal.Precio(nombre: "Barra Think!", categoria: "Snacks", precio: 45, precio_personal: 30, grupo: "snacks"),
        ]
    )

    static let codigo = "SHKP-7A3F91C2"

    static let aliados = [
        Aliado(id: "a1", nombre: "ProDetail Auto Spa", descripcion: "Lavado y detallado de autos a domicilio en Mérida.",
               logo_url: nil, promo_titulo: "10% en tu primer lavado", promo_texto: "Enseña tu tarjeta de Shakeaholic Rewards al pagar.",
               web: "https://prodetail.mx", whatsapp: "9991234567", instagram: "prodetailmx", telefono: nil, direccion: "The Harbor, Mérida", orden: 1),
        Aliado(id: "a2", nombre: "Harbor Fit", descripcion: "Gimnasio y clases funcionales.",
               logo_url: nil, promo_titulo: "Primera clase gratis", promo_texto: "Con tu QR de Rewards en recepción.",
               web: nil, whatsapp: "9997654321", instagram: "harborfit", telefono: nil, direccion: nil, orden: 2),
    ]
    #endif
}
