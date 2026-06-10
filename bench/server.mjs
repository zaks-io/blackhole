/**
 * Bench server: serves the benchmark page and persists results posted by it.
 * Run with: bun bench/server.mjs
 */
import { mkdirSync } from 'node:fs';

const root = import.meta.dir;

Bun.serve({
  port: 8123,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'POST') {
      const label = url.searchParams.get('label') ?? 'run';
      const scenario = url.searchParams.get('scenario') ?? 'unknown';
      const dir = `${root}/results/${label}`;
      mkdirSync(dir, { recursive: true });

      if (url.pathname === '/pixels') {
        await Bun.write(`${dir}/${scenario}.rgba`, await req.arrayBuffer());
      } else if (url.pathname === '/png') {
        await Bun.write(`${dir}/${scenario}.png`, await req.arrayBuffer());
      } else if (url.pathname === '/results') {
        await Bun.write(`${dir}/results.json`, await req.text());
        console.log(`[bench] results saved for label=${label}`);
      } else {
        return new Response('not found', { status: 404 });
      }
      return new Response('ok');
    }

    if (url.pathname === '/') {
      return new Response(Bun.file(`${root}/index.html`));
    }
    if (url.pathname === '/main.js') {
      return new Response(Bun.file(`${root}/dist/main.js`), {
        headers: { 'content-type': 'text/javascript' },
      });
    }
    return new Response('not found', { status: 404 });
  },
});

console.log('[bench] listening on http://localhost:8123');
