import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('app.js', root), 'utf8');
const declaration = source
  .split(/\r?\n/)
  .find((line) => line.startsWith('const sampleJD='));
if (!declaration) throw new Error('Original sample JD unavailable');
const text = runInNewContext(`${declaration}\nsampleJD`, Object.create(null), {
  timeout: 1000,
});
if (typeof text !== 'string') throw new Error('Invalid original sample');
const image = new URL('apps/miniapp/src/assets/jd-example.png', root);
const metadata = new URL('packages/domain/fixtures/ocr/mock-jd-v1.json', root);
mkdirSync(new URL('.', metadata), { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 640, height: 680 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    '<style>body{margin:0;padding:36px;box-sizing:border-box;background:#f7f8f4;color:#1c352e;font-family:Microsoft YaHei,sans-serif}h1{font-size:24px;color:#176b4b}pre{font:20px/1.9 Microsoft YaHei,sans-serif;white-space:pre-wrap;margin-top:28px}</style><h1>模拟岗位截图 · 示例</h1><pre></pre>',
  );
  await page.evaluate((value) => {
    document.querySelector('pre').textContent = value;
  }, text);
  await page.screenshot({ path: fileURLToPath(image), fullPage: true });
} finally {
  await browser.close();
}
const fixture = {
  id: 'mock-jd-v1',
  title: '新媒体运营实习生',
  text,
  sha256: createHash('sha256').update(readFileSync(image)).digest('hex'),
  mediaType: 'image/png',
  source: 'preserved-prototype-sampleJD',
};
writeFileSync(metadata, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  'Created explicit OCR fixture from original prototype sample; hash whitelisted, no real OCR.',
);
