// Local preview that mimics GitHub Pages: serves dist-pages/ under /puntodeventa/
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const PREFIX = '/puntodeventa'
const ROOT = path.join(__dirname, '..', 'dist-pages')
const PORT = process.env.PORT || 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (!p.startsWith(PREFIX)) {
    res.writeHead(302, { Location: PREFIX + '/' })
    return res.end()
  }
  p = p.slice(PREFIX.length) || '/'
  let file = path.join(ROOT, p)
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file)) {
    // SPA fallback: walk up to nearest app and return its index.html
    const parts = p.replace(/^\.+/, '').split('/')
    while (parts.length > 0) {
      const tryIndex = path.join(ROOT, ...parts.slice(0, 1), 'index.html')
      if (fs.existsSync(tryIndex)) { file = tryIndex; break }
      parts.pop()
    }
  }
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found') }
  const ext = path.extname(file)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, () => {
  console.log(`Pages preview: http://localhost:${PORT}${PREFIX}/`)
})
