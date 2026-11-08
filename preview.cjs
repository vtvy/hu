const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const routes = new Set([
  'index.html',
  'hu-standalone.html',
  'app.css',
  'app.js',
  'boot.js',
  'store-core.js',
  'quick-entry.css',
  'quick-entry.js',
  'recurring-core.js',
  'planner.js',
  'planner.css',
  'manifest.webmanifest',
  'icon.svg',
  'sw.js',
  'standalone-redirect.js'
]);
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};
http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!routes.has(name)) {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Not found');
    return;
  }
  res.setHeader('Content-Type', types[path.extname(name)] + '; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'"
  );
  res.end(fs.readFileSync(path.join(__dirname, name)));
}).listen(5174, '127.0.0.1', () => console.log('http://localhost:5174'));
