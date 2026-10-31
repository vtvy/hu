const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const routes = new Set(['index.html', 'quick-entry.css', 'quick-entry.js', 'recurring-core.js', 'planner.js', 'planner.css', 'hu-standalone.html']);
const types = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript'};
http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!routes.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  res.setHeader('Content-Type', types[path.extname(name)] + '; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(fs.readFileSync(path.join(__dirname, name)));
}).listen(5174, '127.0.0.1', () => console.log('http://localhost:5174'));
