// Lightweight local dev server that mimics Vercel's serverless request
// handling, for verifying api/ routes + public/ static files without
// requiring a linked Vercel project. Not used in production (Vercel handles
// routing itself when deployed). Run with: node scripts/local-dev-server.js
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 3210;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

function mockRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  return res;
}

async function handleApi(req, res, pathname) {
  const routeName = pathname.replace('/api/', '');
  const modPath = join(ROOT, 'api', `${routeName}.js`);
  const mod = await import(`${pathToFileURL(modPath).href}?t=${Date.now()}`);

  const url = new URL(req.url, 'http://localhost');
  req.query = Object.fromEntries(url.searchParams);

  if (req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    req.body = raw ? JSON.parse(raw) : {};
  }

  await mod.default(req, mockRes(res));
}

async function handleStatic(req, res, pathname) {
  const filePath = pathname === '/' ? '/index.html' : pathname;
  try {
    const content = await readFile(join(ROOT, 'public', filePath));
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'text/plain');
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
    } else {
      await handleStatic(req, res, pathname);
    }
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => console.log(`Local dev server running at http://localhost:${PORT}`));
