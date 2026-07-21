// Post-build step: folds the Vite output (index.html + hashed CSS/JS assets +
// favicon) into dist/sidecar-ml-console.html — one self-contained page that a
// Sidecar ML user can download and open straight from disk (file://). It is
// distributed as a GitHub release asset (`npm run release`), not committed.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const OUT_NAME = 'sidecar-ml-console.html';

const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// </script> or <!-- inside inline script text would derail the HTML parser.
// \/ and \! are identity escapes in JS strings and regexes, so the code the
// browser sees is unchanged.
const escapeScript = (js) => js.replace(/<(\/script|!--)/gi, '<\\$1');

const inlined = new Set();

function assetFile(href) {
  const relative = href.replace(/^\.?\//, '');
  inlined.add(relative);
  return readFile(path.join(DIST, relative), 'utf8');
}

let html = await readFile(path.join(DIST, 'index.html'), 'utf8');
inlined.add('index.html');

// Stylesheet links → <style> blocks.
for (const match of [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const css = await assetFile(match[1]);
  html = html.replace(match[0], () => `<style>\n${css}\n</style>`);
}

// The module entry script → inline module script. Inline module scripts are
// deferred like external ones, so #root still exists before React mounts.
for (const match of [
  ...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g),
]) {
  const js = await assetFile(match[1]);
  html = html.replace(match[0], () => `<script type="module">\n${escapeScript(js)}\n</script>`);
}

// Preload hints point at files that no longer ship; drop them.
html = html.replace(/[ \t]*<link rel="modulepreload"[^>]*>\n?/g, '');

// Favicon → data: URI so the tab icon survives without a sibling file.
for (const match of [...html.matchAll(/<link rel="icon"[^>]*href="([^"]+)"[^>]*\/?>/g)]) {
  const href = match[1];
  const mime = MIME[path.extname(href)];
  if (!mime) continue;
  const data = Buffer.from(await assetFile(href)).toString('base64');
  html = html.replace(match[0], () =>
    `<link rel="icon" type="${mime}" href="data:${mime};base64,${data}" />`,
  );
}

// Anything still fetched from a path would 404 when the page is a lone file.
const leftoverRefs = [...html.matchAll(/(?:src|href)="(\.?\/[^"]*)"/g)].map((m) => m[1]);
if (leftoverRefs.length > 0) {
  throw new Error(`${OUT_NAME} would still fetch local files: ${leftoverRefs.join(', ')}`);
}

await writeFile(path.join(DIST, OUT_NAME), html);

// Files that exist in dist but are not part of the single page (e.g. a future
// public/ asset) deserve a loud note — panels relying on them would break.
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield path.relative(DIST, full);
  }
}
for await (const file of walk(DIST)) {
  if (!inlined.has(file) && file !== OUT_NAME) {
    console.warn(`build-single: warning — dist/${file} is NOT inside ${OUT_NAME}`);
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`build-single: wrote dist/${OUT_NAME} (${kb(Buffer.byteLength(html))})`);
