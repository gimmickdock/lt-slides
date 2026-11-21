import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const clients = new Set();
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript' };
const reloadScript = `<script>
new EventSource('/__reload').onmessage = () => {
  sessionStorage.setItem('preview-slide', String(Reveal.getIndices().h));
  location.reload();
};
Reveal.on('ready', () => {
  const slide = sessionStorage.getItem('preview-slide');
  if (slide !== null) {
    Reveal.slide(Number(slide));
    sessionStorage.removeItem('preview-slide');
  }
});
</script>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  try {
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root) || path.relative(root, file).split(path.sep).some(part => part.startsWith('.'))) {
      res.writeHead(403).end();
      return;
    }
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    let body = await readFile(file);
    if (path.extname(file) === '.html') body = Buffer.from(body.toString().replace('</body>', reloadScript + '</body>'));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

let debounce;
const watcher = watch(root, { recursive: true }, (_, filename) => {
  if (!filename || filename.split(path.sep).some(part => part.startsWith('.'))) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    for (const client of clients) client.write('data: reload\n\n');
  }, 100);
});
server.on('error', error => { console.error(error.message); watcher.close(); process.exitCode = 1; });
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${server.address().port}`));
