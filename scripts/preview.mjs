import { readFile, stat } from 'node:fs/promises';
import { createServer, request as proxyRequest } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mounts = [
  [10086, 'apps/miniapp/dist-h5'],
  [8000, 'apps/admin/dist'],
];
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const servers = [];
for (const [port, directory] of mounts) {
  const publicRoot = resolve(root, directory);
  const server = createServer(async (req, res) => {
    if (
      !/^((127\.0\.0\.1|localhost):\d+|\[::1\]:\d+)$/.test(
        req.headers.host ?? '',
      )
    ) {
      res.writeHead(403);
      res.end('Local preview only');
      return;
    }
    if (req.url?.startsWith('/api/')) {
      const proxy = proxyRequest(
        {
          hostname: '127.0.0.1',
          port: 3100,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: '127.0.0.1:3100' },
        },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxy.on('error', () => {
        if (!res.headersSent)
          res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '本地API未连接' }));
      });
      req.on('aborted', () => proxy.destroy());
      req.pipe(proxy);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const pathname = decodeURIComponent(
        new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname,
      );
      let target = resolve(publicRoot, `.${pathname}`);
      if (target !== publicRoot && !target.startsWith(publicRoot + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let information;
      try {
        information = await stat(target);
      } catch {
        information = undefined;
      }
      if (information?.isDirectory()) target = resolve(target, 'index.html');
      else if (!information) {
        if (!req.headers.accept?.includes('text/html')) {
          res.writeHead(404);
          res.end();
          return;
        }
        target = resolve(publicRoot, 'index.html');
      }
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type': types[extname(target)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404);
      res.end('Build the local application first');
    }
  });
  server.on('error', () => {
    process.stderr.write(`Preview port ${port} unavailable.\n`);
    process.exitCode = 1;
    for (const current of servers) current.close();
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`Local preview http://127.0.0.1:${port}`),
  );
  servers.push(server);
}
const stop = () => {
  for (const server of servers) server.close();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
