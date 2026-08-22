import React, { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { listarProductosParaVenta, type ProductoVenta } from '@shake/supabase'
import { mxn } from '@shake/utils'
import { sb } from './lib/sb'

/** A dónde manda el QR y el botón de lealtad. */
const URL_REWARDS =
  ((import.meta.env.VITE_URL_REWARDS as string | undefined) ?? 'https://rewards.shakeaholic.mx')
    // Si la variable en Cloudflare aún trae la URL vieja, se traduce sola.
    .replace('shake-cliente-pwa.pages.dev', 'rewards.shakeaholic.mx')

const WHATSAPP = 'https://wa.me/529995044797'

/**
 * Categorías del sistema que no pintan en la carta pública: los scoops y
 * suplementos son surtido de mostrador/venta interna, y "Extras" vive
 * dentro de cada producto, no como tarjeta propia.
 */
const CATEGORIAS_INTERNAS = /^(extras|scoops|suplementos)/i

/** Paleta de sabores del manual, para los puntos de la carta. */
const SABORES = ['--c-mint', '--c-banana', '--c-strawberry', '--c-mango', '--c-blueberry', '--c-chocolate']

/** $70 en vez de $70.00 cuando el precio es cerrado, como en la maqueta. */
function precioCorto(n: number): string {
  if (n <= 0) return 'Gratis'
  return Number.isInteger(n) ? `$${n}` : mxn(n)
}

interface CategoriaCarta {
  nombre: string
  orden: number
  cocina: string
  items: ProductoVenta[]
}

export default function App() {
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [qr, setQr] = useState('')

  useEffect(() => {
    // La carta se lee de la misma base que usa la caja: lo que el negocio
    // captura en costeo aparece aquí solo, sin publicar nada a mano. Si la
    // consulta falla, la página sigue viéndose — la carta es un plus, no el
    // motivo por el que alguien entra.
    listarProductosParaVenta(sb).then(setProductos).catch(() => setProductos([]))
    QRCode.toDataURL(URL_REWARDS, {
      width: 320, margin: 2, color: { dark: '#14241D', light: '#FFFFFF' },
    }).then(setQr).catch(() => setQr(''))
  }, [])

  const carta = useMemo<CategoriaCarta[]>(() => {
    const m = new Map<string, CategoriaCarta>()
    for (const p of productos) {
      const c = p.categorias
      if (!c || CATEGORIAS_INTERNAS.test(c.nombre)) continue
      let cat = m.get(c.nombre)
      if (!cat) {
        cat = { nombre: c.nombre, orden: c.orden, cocina: c.cocinas?.slug ?? '', items: [] }
        m.set(c.nombre, cat)
      }
      cat.items.push(p)
    }
    return [...m.values()].sort(
      (a, b) => a.cocina.localeCompare(b.cocina) || a.orden - b.orden || a.nombre.localeCompare(b.nombre),
    )
  }, [productos])

  function suscribirse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Sin backend de boletín todavía: el interés llega directo al WhatsApp
    // del negocio, que es donde de todas formas atienden.
    const correo = new FormData(e.currentTarget).get('correo')
    const texto = encodeURIComponent(
      `¡Hola! Quiero mi 10% de descuento en mi primera compra. Mi correo: ${correo ?? ''}`,
    )
    window.open(`${WHATSAPP}?text=${texto}`, '_blank', 'noopener')
  }

  return (
    <>
      {/* ============ NAV ============ */}
      <header className="nav">
        <a className="wordmark" href="#top">
          <img src="/logo.png" alt="" />
          Shakeaholic
        </a>
        <nav className="links">
          <a href="#menu">Menú</a>
          <a href="#rewards">Rewards</a>
          <a href="#nosotros">Nosotros</a>
          <a href="#b2b">Negocios</a>
          <a href="#contacto">Contacto</a>
          <a className="cta" href={WHATSAPP}>Pedir por WhatsApp</a>
        </nav>
      </header>

      {/* ============ HERO ============ */}
      <section className="hero" id="top">
        <div>
          <p className="eyebrow" style={{ opacity: 0.7 }}>Protein Bar · Mérida, Yucatán</p>
          <h1>Alimenta tu energía con <em>sabor</em>.</h1>
          <p className="sub">
            Shakes de proteína, bebidas funcionales, sándwiches, wraps y snacks
            saludables para empezar tu día con todo.
          </p>
          <div className="actions">
            <a className="btn light" href="#menu">Ver el menú</a>
            <a
              className="btn ghost"
              style={{ borderColor: 'var(--cream)', color: 'var(--cream)' }}
              href={WHATSAPP}
            >
              WhatsApp
            </a>
          </div>
          <div className="ticker">
            <span>★ 100% Mexicana</span>
            <span>★ Proteína real</span>
            <span>★ Rico · Rápido · Saludable</span>
          </div>
        </div>
        <div className="hero-img">
          <div className="badge">Desde<br />$70</div>
          <div className="frame">
            <img className="milo" src="/milo-transparent.png" alt="Milo, la mascota de Shakeaholic" />
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="track">
          <span>Shakes ★ Proteínas ★ Wraps ★ Snacks ★ Kombucha ★ Matcha ★</span>
          <span>Shakes ★ Proteínas ★ Wraps ★ Snacks ★ Kombucha ★ Matcha ★</span>
        </div>
      </div>

      {/* ============ MENÚ (vivo, desde la misma base que la caja) ============ */}
      <section className="menu" id="menu">
        <p className="eyebrow">Menú · Price List</p>
        <h2 className="title">Escoge tu shake.</h2>
        <p className="menu-note">Leche vegetal +$10 · Precios en MXN</p>

        {carta.length > 0 ? (
          <div className="menu-grid">
            {carta.map((cat) => {
              const desde = Math.min(...cat.items.map((p) => p.precio).filter((n) => n > 0))
              return (
                <div key={cat.nombre} className={cat.nombre === 'Shakes' ? 'menu-cat feature' : 'menu-cat'}>
                  <div className="cat-head">
                    <h3>{cat.nombre}</h3>
                    <span className="cat-price">
                      {Number.isFinite(desde) ? `Desde ${precioCorto(desde)}` : 'Pregunta en barra'}
                    </span>
                  </div>
                  {cat.items.map((p, i) => (
                    <div key={p.id} className="mi">
                      <span
                        className="dot"
                        style={{ '--flav': `var(${SABORES[i % SABORES.length]})` } as React.CSSProperties}
                      />
                      <span className="mn">{p.nombre}</span>
                      <span className="mp">{precioCorto(p.precio)}</span>
                      {p.descripcion && <span className="md">{p.descripcion}</span>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="menu-grid">
            <div className="menu-cat">
              <div className="cat-head">
                <h3>Carta del día</h3>
                <span className="cat-price">En barra</span>
              </div>
              <div className="mi">
                <span className="dot" style={{ '--flav': 'var(--c-banana)' } as React.CSSProperties} />
                <span className="mn">Pregunta por el menú de hoy</span>
                <span className="mp">→</span>
                <span className="md">
                  Escríbenos por WhatsApp o visítanos en The Harbor: shakes, bebidas
                  funcionales y snacks recién hechos.
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ============ REWARDS ============ */}
      <section className="rewards" id="rewards">
        <div>
          <p className="eyebrow">Programa de lealtad</p>
          <h2 className="title">Acumula mancuernas.</h2>
          <p className="lede">
            Escanea el código con la cámara de tu celular, entra con tu cuenta de
            Google y listo. Tu tarjeta vive en el navegador — no hay que instalar
            nada ni cargar un plástico más.
          </p>
          <div className="stats">
            <div className="stat"><b>$10</b><span>1 mancuerna</span></div>
            <div className="stat"><b>100</b><span>Un cupón</span></div>
            <div className="stat"><b>1 año</b><span>Vigencia</span></div>
          </div>
          <p className="fino">¿Sin celular a la mano? En caja te damos de alta con tu teléfono</p>
        </div>
        <div className="qr-card">
          {qr && <img src={qr} alt="Código QR para entrar a Shakeaholic Rewards" />}
          <a className="btn" href={URL_REWARDS}>Únete a Rewards</a>
        </div>
      </section>

      {/* ============ NOSOTROS ============ */}
      <section className="about" id="nosotros">
        <div>
          <p className="eyebrow" style={{ opacity: 0.65 }}>Acerca de Shakeaholic</p>
          <h2 className="title">Rico, rápido y saludable.</h2>
          <p className="lede">
            Somos una marca orgullosamente mexicana en crecimiento, enfocada en
            bebidas funcionales, nutrición deportiva y bienestar. Te ayudamos a
            comer rico, rápido y saludable con productos de alta calidad.
          </p>
          <div className="vals">
            <div className="val"><span className="starmark" /><span>Sistemas innovadores para la preparación de bebidas proteicas.</span></div>
            <div className="val"><span className="starmark" /><span>Tecnología especializada y proveedores nacionales e internacionales.</span></div>
            <div className="val"><span className="starmark" /><span>Productos innovadores y de alta calidad para el mercado en México.</span></div>
          </div>
        </div>
        <div className="about-img">
          <img className="logo" src="/logo.png" alt="Logotipo de Shakeaholic" />
          <img className="milo" src="/milo-transparent.png" alt="" />
        </div>
      </section>

      {/* ============ GALERÍA ============ */}
      <section className="gallery">
        <p className="eyebrow">Galería</p>
        <h2 className="title">Momentos Shakeaholic.</h2>
        <div className="gal-grid">
          {([
            ['Shakes', '--green', false],
            ['Matcha', '--c-mint', true],
            ['Kombucha', '--c-blueberry', false],
            ['Snacks', '--c-mango', true],
            ['Proteína', '--c-chocolate', false],
            ['Wraps', '--c-banana', true],
            ['Café', '--green-deep', false],
            ['Wellness', '--c-strawberry', false],
          ] as const).map(([nombre, color, oscuro]) => (
            <div key={nombre}>
              <div
                className={oscuro ? 'gal-tile oscuro' : 'gal-tile'}
                style={{ '--tile': `var(${color})` } as React.CSSProperties}
              >
                <span className="starmark" />
                {nombre}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ NEGOCIOS ============ */}
      <section className="b2b" id="b2b">
        <p className="eyebrow" style={{ opacity: 0.6 }}>Para negocios</p>
        <h2 className="title">¿Tienes cafetería o negocio de proteínas?</h2>
        <p className="lede">
          Te ofrecemos proteína, insumos y equipo para tu cafetería a los mejores
          precios. Soluciones profesionales de almacenamiento y dispensación para
          proteína en polvo, suplementos, cereales, café y productos alimenticios.
        </p>

        <div className="b2b-grid">
          <div className="b2b-card">
            <span className="tag">Dispensador IDM</span>
            <h3>HLP1 · 4.5 L</h3>
            <p>
              Dispensador individual e independiente de proteína y polvo. Mecanismo
              patentado "Pro-Portion" con 5 niveles de dosificación (10–35 cc) para
              la porción exacta en cada uso. Base metálica, libre de BPA, normativas
              FDA y UE.
            </p>
            <div className="specs">
              <span>15 × 15 × 47 cm · 1.3 kg</span>
              <span>Recipiente 4.5 L</span>
            </div>
          </div>
          <div className="b2b-card">
            <span className="tag">Dispensador IDM</span>
            <h3>HLP3 · 4.5 L</h3>
            <p>
              Dispensador triple de proteínas y polvos con recipientes de 4.5 litros.
              Dosificación ajustable "Pro-Portion", soporte para montaje en pared.
              Libre de BPA, cumple normativas FDA y UE para contacto con alimentos.
            </p>
            <div className="specs">
              <span>Triple recipiente · 4.5 L c/u</span>
              <span>Montaje en pared</span>
            </div>
          </div>
          <div className="b2b-card">
            <span className="tag">Dispensador IDM</span>
            <h3>HLP1 · 1.5 L</h3>
            <p>
              Dispensador individual para montaje en pared con recipiente compacto de
              1.5 litros. Mismo mecanismo "Pro-Portion" de 5 niveles. Ideal para
              espacios reducidos detrás de barra.
            </p>
            <div className="specs">
              <span>15 × 15 × 25 cm · 1.7 kg</span>
              <span>Recipiente 1.5 L</span>
            </div>
          </div>
        </div>

        <div className="b2b-cta">
          <a className="btn light" href={WHATSAPP}>Cotizar por WhatsApp</a>
          <a
            className="btn ghost"
            style={{ borderColor: 'var(--cream)', color: 'var(--cream)' }}
            href="mailto:hola@shakeaholic.mx?subject=COTIZACIÓN DISPENSADORES IDM"
          >
            Cotizar por correo
          </a>
        </div>

        <div className="partners">
          <div className="partner">
            <p className="eyebrow" style={{ opacity: 0.55 }}>Socio comercial</p>
            <h3>Birdman</h3>
            <p>
              Marca mexicana líder en nutrición basada en plantas. Su compromiso con
              la calidad, la innovación y el bienestar la convierte en un aliado
              estratégico en productos saludables para nuestros clientes.
            </p>
          </div>
          <div className="partner">
            <p className="eyebrow" style={{ opacity: 0.55 }}>Socio comercial</p>
            <h3>IDM</h3>
            <p>
              Colaboramos con IDM para acercar al mercado mexicano soluciones
              innovadoras de almacenamiento y dispensación que optimizan operaciones,
              mejoran la higiene y hacen más eficiente la experiencia en negocios de
              nutrición y alimentos.
            </p>
          </div>
        </div>
      </section>

      {/* ============ BOLETÍN ============ */}
      <section className="subscribe">
        <p className="eyebrow" style={{ opacity: 0.7 }}>Boletín</p>
        <h2>10% de descuento en tu primera compra.</h2>
        <p>Suscríbete a nuestro boletín y recibe promociones, nuevos sabores y noticias Shakeaholic.</p>
        <form className="sub-form" onSubmit={suscribirse}>
          <input type="email" name="correo" placeholder="tu@correo.com" required />
          <button type="submit">Inscribirse</button>
        </form>
      </section>

      {/* ============ CONTACTO ============ */}
      <section className="contact" id="contacto">
        <p className="eyebrow">Contacto</p>
        <h2 className="title">Mejor aún: visítanos.</h2>
        <p className="lede">Amamos a nuestros clientes — no dudes en visitarnos en nuestro horario habitual.</p>

        <div className="contact-grid">
          <div className="c-card">
            <h3>Shakeaholic Mérida</h3>
            <div className="c-list">
              <div className="c-row"><b>Dirección</b><span>The Harbor Lifestyle Mall, Prol. Paseo Montejo, Zona Industrial, Mérida, Yuc., México</span></div>
              <div className="c-row"><b>Teléfono</b><span><a href="tel:+529995044797">+52 999 504 4797</a></span></div>
              <div className="c-row"><b>WhatsApp</b><span><a href={WHATSAPP}>wa.me/529995044797</a></span></div>
              <div className="c-row"><b>Correo</b><span><a href="mailto:hola@shakeaholic.mx">hola@shakeaholic.mx</a></span></div>
              <div className="c-row"><b>Horario</b><span>Abierto hoy · 6:00 – 10:30 a.m.</span></div>
            </div>
          </div>
          <div className="c-map">
            <iframe
              title="Mapa — Shakeaholic en The Harbor, Mérida"
              src="https://maps.google.com/maps?q=The%20Harbor%20Lifestyle%20Mall%2C%20M%C3%A9rida%2C%20Yucat%C3%A1n&z=16&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <span className="wordmark">Shakeaholic</span>
        <div className="social">
          <a href="https://www.facebook.com/1037156399485268">Facebook</a>
          <a href="https://www.instagram.com/shakeaholicmx">Instagram</a>
          <a href="https://www.tiktok.com/@shakeaholicmx">TikTok</a>
          <a href={URL_REWARDS}>Rewards</a>
        </div>
        <span className="legal">© 2026 Shakeaholic · Mérida, Yucatán</span>
      </footer>
    </>
  )
}
