import SwiftUI

struct ActividadView: View {
    @EnvironmentObject var estado: Estado

    var body: some View {
        Pantalla(titulo: "Actividad") {
            let r = estado.resumen
            let historial = r?.historial ?? []
            let movimientos = r?.movimientos ?? []
            let favoritos = r?.favoritos ?? []

            if let vida = r?.vida, (vida.visitas ?? 0) > 0 {
                Hoja {
                    HStack(spacing: 22) {
                        Cifra(valor: "\(Int(vida.visitas ?? 0))", pie: "visitas")
                        Cifra(valor: mxn(vida.gastado), pie: "gastado")
                        Cifra(valor: "\(Int(r?.ganadas_total ?? 0))", pie: "ganadas")
                    }
                }
            }

            if historial.isEmpty && movimientos.isEmpty {
                Hoja {
                    Text("Aún no hay compras ligadas a tu cuenta.").font(Marca.cuerpo(16, .semibold))
                    Text("En la barra, enseña el QR de tu tarjeta al pagar y tus mancuernas se suman solas.")
                        .font(Marca.cuerpo(14)).foregroundStyle(Marca.tinta.opacity(0.65))
                }
            }

            if !favoritos.isEmpty {
                Hoja(titulo: "Lo que más pides") {
                    ForEach(favoritos) { f in
                        HStack {
                            Text(f.nombre).font(Marca.cuerpo(15))
                            Spacer()
                            Text("\(Int(f.veces))×").font(Marca.mono(13)).foregroundStyle(Marca.verde)
                        }
                    }
                }
            }

            if !historial.isEmpty {
                Hoja(titulo: "Tus compras") {
                    ForEach(historial) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text("#\(c.folio)").font(Marca.mono(14, .medium))
                                Text(c.fecha).font(Marca.mono(12)).foregroundStyle(Marca.tinta.opacity(0.5))
                                Spacer()
                                Text(mxn(c.total)).font(Marca.mono(14))
                            }
                            if let items = c.items, !items.isEmpty {
                                Text(items).font(Marca.cuerpo(13)).foregroundStyle(Marca.tinta.opacity(0.65))
                            }
                            if let m = c.mancuernas, m > 0 {
                                Text("+\(Int(m)) mancuernas").font(Marca.mono(12)).foregroundStyle(Marca.verde)
                            }
                        }
                        .padding(.vertical, 3)
                    }
                }
            }

            if !movimientos.isEmpty {
                Hoja(titulo: "Movimientos") {
                    ForEach(movimientos) { m in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(m.descripcion).font(Marca.cuerpo(14))
                                Text(m.fecha).font(Marca.mono(11)).foregroundStyle(Marca.tinta.opacity(0.5))
                            }
                            Spacer()
                            Text("\(m.puntos >= 0 ? "+" : "")\(Int(m.puntos))")
                                .font(Marca.mono(14, .medium))
                                .foregroundStyle(m.puntos >= 0 ? Marca.verde : Marca.fresa)
                        }
                    }
                }
            }
        }
    }
}

private struct Cifra: View {
    let valor: String
    let pie: String
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(valor).font(Marca.mono(20, .medium)).foregroundStyle(Marca.verde)
            Text(pie.uppercased()).font(Marca.mono(10)).tracking(1.5).foregroundStyle(Marca.tinta.opacity(0.5))
        }
    }
}
