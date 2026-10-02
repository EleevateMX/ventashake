import AppKit
import CoreText

// Genera las imágenes del pase de Apple Wallet con la marca:
// icon (29pt), logo (160x50pt), strip (375x123pt), a 1x/2x/3x.
let fuentes = CommandLine.arguments[1]
let milo = CommandLine.arguments[2]
let salida = CommandLine.arguments[3]

for f in ["BagelFatOne-Regular.ttf", "DMSans-Variable.ttf"] {
    let url = URL(fileURLWithPath: "\(fuentes)/\(f)")
    CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
}
let verdeProfundo = NSColor(red: 0x1A/255, green: 0x2E/255, blue: 0x26/255, alpha: 1)
let verde = NSColor(red: 0x2C/255, green: 0x4A/255, blue: 0x3E/255, alpha: 1)
let crema = NSColor(red: 0xE8/255, green: 0xE6/255, blue: 0xCC/255, alpha: 1)
let platano = NSColor(red: 0xF0/255, green: 0xC6/255, blue: 0x49/255, alpha: 1)
let miloImg = NSImage(contentsOfFile: milo)!

func dibujar(_ nombre: String, ancho: CGFloat, alto: CGFloat, escala: CGFloat, _ cuerpo: (CGContext, CGFloat, CGFloat) -> Void) {
    let w = Int(ancho * escala), h = Int(alto * escala)
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.scaleBy(x: escala, y: escala)
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    cuerpo(ctx, ancho, alto)
    let img = ctx.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    let png = rep.representation(using: .png, properties: [:])!
    let sufijo = escala == 1 ? "" : "@\(Int(escala))x"
    try! png.write(to: URL(fileURLWithPath: "\(salida)/\(nombre)\(sufijo).png"))
}

func texto(_ s: String, fuente: String, tam: CGFloat, color: NSColor, en p: CGPoint, tracking: CGFloat = 0) {
    let f = NSFont(name: fuente, size: tam) ?? NSFont.systemFont(ofSize: tam)
    let a: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: color, .kern: tracking]
    NSAttributedString(string: s, attributes: a).draw(at: p)
}

func fondo(_ ctx: CGContext, _ w: CGFloat, _ h: CGFloat) {
    let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                       colors: [verde.cgColor, verdeProfundo.cgColor] as CFArray, locations: [0, 1])!
    _ = g
    ctx.setFillColor(verdeProfundo.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
}

/// Mancuernas chiquitas de fondo, como textura.
func mancuernas(_ ctx: CGContext, _ w: CGFloat, _ h: CGFloat) {
    ctx.saveGState()
    ctx.setStrokeColor(crema.withAlphaComponent(0.07).cgColor)
    ctx.setLineWidth(2)
    ctx.setLineCap(.round)
    var y: CGFloat = 12
    var fila = 0
    while y < h {
        var x: CGFloat = fila % 2 == 0 ? 14 : 36
        while x < w {
            ctx.move(to: CGPoint(x: x, y: y)); ctx.addLine(to: CGPoint(x: x + 14, y: y))
            ctx.move(to: CGPoint(x: x, y: y - 4)); ctx.addLine(to: CGPoint(x: x, y: y + 4))
            ctx.move(to: CGPoint(x: x + 14, y: y - 4)); ctx.addLine(to: CGPoint(x: x + 14, y: y + 4))
            ctx.strokePath()
            x += 44
        }
        y += 26; fila += 1
    }
    ctx.restoreGState()
}

for escala: CGFloat in [1, 2, 3] {
    // icon: Milo sobre verde, redondeado lo pone iOS.
    dibujar("icon", ancho: 29, alto: 29, escala: escala) { ctx, w, h in
        ctx.setFillColor(verdeProfundo.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        miloImg.draw(in: CGRect(x: 3, y: 2, width: w - 6, height: h - 4), from: .zero, operation: .sourceOver, fraction: 1)
    }
    // logo: la palabra en la display de la casa, crema. Arriba a la izquierda del pase.
    dibujar("logo", ancho: 160, alto: 50, escala: escala) { ctx, w, h in
        texto("Shakeaholic", fuente: "BagelFatOne-Regular", tam: 27, color: crema, en: CGPoint(x: 0, y: 9))
    }
    // strip: Milo caminando con sus mancuernas, y "Rewards" en plátano.
    dibujar("strip", ancho: 375, alto: 123, escala: escala) { ctx, w, h in
        fondo(ctx, w, h)
        mancuernas(ctx, w, h)
        // Un círculo crema suave detrás de Milo, como un sol.
        ctx.setFillColor(crema.withAlphaComponent(0.10).cgColor)
        ctx.fillEllipse(in: CGRect(x: w - 175, y: -40, width: 170, height: 170))
        // Wallet recorta las orillas de la franja en los iPhone grandes (Pro
        // Max): nada importante a menos de 40 pt de cada lado.
        let margen: CGFloat = 40
        let mh: CGFloat = 100
        let mw = mh * (300.0 / 278.0)
        miloImg.draw(in: CGRect(x: w - mw - margen, y: 8, width: mw, height: mh), from: .zero, operation: .sourceOver, fraction: 1)
        texto("Rewards", fuente: "BagelFatOne-Regular", tam: 36, color: platano, en: CGPoint(x: margen, y: 54))
        // En dos renglones cortos: en uno solo se mete debajo de Milo.
        texto("Junta mancuernas", fuente: "DMSans-Variable", tam: 13, color: crema.withAlphaComponent(0.85), en: CGPoint(x: margen + 2, y: 36))
        texto("en cada compra", fuente: "DMSans-Variable", tam: 13, color: crema.withAlphaComponent(0.85), en: CGPoint(x: margen + 2, y: 19))
    }
}
print("ok")
