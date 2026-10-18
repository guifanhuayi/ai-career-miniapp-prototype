import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { chromium } from '@playwright/test';

// Read only the original SVG path declaration. Never execute prototype event handlers.
const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('app.js', root), 'utf8');
const declaration = source.slice(
  source.indexOf('const paths='),
  source.indexOf('\nfunction icon('),
);
const paths = runInNewContext(`${declaration}\npaths`, Object.create(null), {
  timeout: 1000,
});
const folder = new URL('apps/miniapp/src/assets/prototype-icons/', root);
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 72, height: 72 },
    deviceScaleFactor: 1,
  });
  for (const [name, path] of Object.entries(paths)) {
    if (!/^[a-z]+$/.test(name) || !/^[a-zA-Z0-9 .,-]+$/.test(path))
      throw new Error('Invalid prototype icon');
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#176b4b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`,
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}.png`, folder)),
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
}
const names = Object.keys(paths);
writeFileSync(
  new URL('index.ts', folder),
  '// Generated from preserved app.js SVG paths by scripts/generate-icons.mjs.\n' +
    names.map((name) => `import ${name} from './${name}.png';`).join('\n') +
    `\nexport const prototypeIcons: Record<string, string> = { ${names.join(', ')} };\n`,
);
console.log(
  'Rendered original prototype SVG paths into native-compatible PNG assets.',
);
