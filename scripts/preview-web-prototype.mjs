import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'] };
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = Object.hasOwn(files, pathname) ? files[pathname] : null;
  if (!file) { res.writeHead(404).end('Not found'); return; }
  res.setHeader('Content-Type', file[1]);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(readFileSync(new URL(`../web-prototype/public/${file[0]}`, import.meta.url)));
});
server.listen(0, '127.0.0.1', () => console.log(`JobShot web prototype: http://127.0.0.1:${server.address().port}`));
