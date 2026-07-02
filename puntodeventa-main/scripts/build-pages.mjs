#!/usr/bin/env node
// Builds the 5 apps for GitHub Pages and assembles a dist-pages/ folder
// with a landing index. Each app builds with BASE_PATH=/<repo>/<app>/.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const repo = process.env.REPO_NAME || 'puntodeventa'
const root = process.cwd()
const out = join(root, 'dist-pages')

const apps = [
  { name: 'kiosko',           emoji: '🧍', title: 'Kiosko',           lede: 'Cliente final · autoservicio', tint: 'sa-mint' },
  { name: 'pos',              emoji: '💳', title: 'POS · Caja',       lede: 'Cajero · PIN 1234',           tint: 'sa-strawberry' },
  { name: 'admin',            emoji: '👑', title: 'Admin',            lede: 'CEO · Dashboard, menú, inventario, reportes', tint: 'sa-banana' },
  { name: 'cocina-alimentos', emoji: '🍳', title: 'Cocina Alimentos', lede: 'KDS · cocina caliente',        tint: 'sa-mango' },
  { name: 'cocina-bebidas',   emoji: '🥤', title: 'Cocina Bebidas',   lede: 'KDS · barra',                  tint: 'sa-blueberry' },
  { name: 'cliente-display',  emoji: '📺', title: 'Cliente Display',  lede: 'Pantalla para el cliente · BroadcastChannel', tint: 'sa-mint' },
]

if (existsSync(out)) rmSync(out, { recursive: true })
mkdirSync(out, { recursive: true })

for (const app of apps) {
  const basePath = `/${repo}/${app.name}/`
  console.log(`\n▶ Building ${app.name} (base=${basePath})`)
  execSync(`npm run build --workspace=apps/${app.name}`, {
    stdio: 'inherit',
    env: { ...process.env, BASE_PATH: basePath },
  })
  const src = join(root, 'apps', app.name, 'dist')
  const dst = join(out, app.name)
  cpSync(src, dst, { recursive: true })
  // SPA fallback for client-side routing on GitHub Pages
  copyFileSync(join(dst, 'index.html'), join(dst, '404.html'))
}

// Landing page
const tintMap = {
  'sa-mint':       { bg: '#88C0A0', fg: '#14241D' },
  'sa-strawberry': { bg: '#E04E5C', fg: '#FFFFFF' },
  'sa-banana':     { bg: '#F0C649', fg: '#3F2A1F' },
  'sa-mango':      { bg: '#E58037', fg: '#FFFFFF' },
  'sa-blueberry':  { bg: '#6C4A9E', fg: '#FFFFFF' },
}

const cards = apps.map(a => {
  const t = tintMap[a.tint]
  return `
    <a class="card" href="./${a.name}/" style="--tint:${t.bg};--tint-fg:${t.fg}">
      <span class="emoji">${a.emoji}</span>
      <h2>${a.title}</h2>
      <p>${a.lede}</p>
      <span class="cta">Abrir →</span>
    </a>`
}).join('')

const landing = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Shake Aholic · POS Suite</title>
<link rel="icon" href="./kiosko/logo.png" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --green: #2C4A3E;
    --green-deep: #1A2E26;
    --green-ink: #14241D;
    --cream: #E8E6CC;
    --cream-soft: #F2EFD9;
    --cream-paper: #EDE9D0;
    --ff-display: "Bagel Fat One", system-ui, sans-serif;
    --ff-body: "DM Sans", system-ui, sans-serif;
    --ff-mono: "DM Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--ff-body);
    background: var(--cream-paper);
    color: var(--green-ink);
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  .hero {
    background: var(--green-deep);
    color: var(--cream);
    padding: 64px 32px 96px;
    position: relative;
    overflow: hidden;
  }
  .hero .mono {
    font-family: var(--ff-mono);
    font-size: 12px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    opacity: 0.7;
    margin-bottom: 16px;
  }
  .hero h1 {
    font-family: var(--ff-display);
    font-size: clamp(48px, 8vw, 96px);
    line-height: 0.95;
    color: var(--cream);
  }
  .hero p {
    margin-top: 16px;
    max-width: 560px;
    opacity: 0.85;
    font-size: 18px;
  }
  .hero img.milo {
    position: absolute;
    right: -20px;
    bottom: -20px;
    width: 280px;
    opacity: 0.95;
    pointer-events: none;
    user-select: none;
  }
  main {
    max-width: 1100px;
    margin: -60px auto 80px;
    padding: 0 32px;
    position: relative;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 20px;
  }
  .card {
    --tint: var(--green);
    --tint-fg: var(--cream);
    background: white;
    border-radius: 20px;
    padding: 28px 24px 24px;
    text-decoration: none;
    color: var(--green-ink);
    box-shadow: 0 12px 32px -16px rgba(20,36,29,0.25);
    border: 1px solid rgba(20,36,29,0.06);
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: transform 180ms ease, box-shadow 180ms ease;
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 6px;
    background: var(--tint);
  }
  .card:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 48px -20px rgba(20,36,29,0.35);
  }
  .card .emoji { font-size: 32px; }
  .card h2 {
    font-family: var(--ff-display);
    font-size: 26px;
    color: var(--green-ink);
    line-height: 1;
    margin-top: 4px;
  }
  .card p {
    font-size: 14px;
    color: rgba(20,36,29,0.7);
    line-height: 1.5;
  }
  .card .cta {
    font-family: var(--ff-mono);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--tint);
    margin-top: 12px;
    font-weight: 600;
  }
  footer {
    text-align: center;
    padding: 32px;
    font-family: var(--ff-mono);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(20,36,29,0.5);
  }
</style>
</head>
<body>
  <section class="hero">
    <p class="mono">#SHAKEAHOLIC · POS SUITE</p>
    <h1>Cuatro pantallas.<br/>Una marca.</h1>
    <p>Catálogo para el cliente, caja para el staff, cocina en tiempo real, dashboard para el dueño. Cero polvo raro.</p>
    <img class="milo" src="./kiosko/milo-transparent.png" alt="Milo" />
  </section>
  <main>
    <div class="grid">${cards}
    </div>
  </main>
  <footer>Shake Aholic · POS Suite · Fase 1</footer>
</body>
</html>`

writeFileSync(join(out, 'index.html'), landing)
console.log('\n✓ Landing written to', join(out, 'index.html'))
console.log('✓ Done')
