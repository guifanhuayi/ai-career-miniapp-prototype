import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { originalText } from './build-prototype-theme.mjs';
import { repositoryRoot, themeApproval } from './check-prototype.mjs';

const output = resolve(
  repositoryRoot,
  'docs/design-references/white-blue-amber',
);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
const states = [
  'home',
  'jd',
  'jdimage',
  'review',
  'loading',
  'analysis',
  'catalog',
  'scene',
  'quiz',
  'result',
  'path',
  'course',
  'plans',
  'empty',
  'noresults',
];
try {
  const pages = await Promise.all(
    [true, false].map(async (before) => {
      const page = await browser.newPage({
        viewport: { width: 393, height: 852 },
        reducedMotion: 'reduce',
      });
      await page.route('http://prototype.test/**', (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: before
            ? originalText('prototype.html')
            : readFileSync(resolve(repositoryRoot, 'prototype.html'), 'utf8'),
        }),
      );
      return page;
    }),
  );
  const snapshot = (page) =>
    page.locator('.screen').evaluate((screen) => ({
      text: screen.innerText,
      controls: [...screen.querySelectorAll('button,input,textarea,a')].map(
        (element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            text: element.textContent,
            value: element.value,
            disabled: element.disabled,
            action: element.getAttribute('data-action'),
            geometry: [rect.x, rect.y, rect.width, rect.height].map(
              (n) => Math.round(n * 100) / 100,
            ),
          };
        },
      ),
    }));
  const equal = async (name) => {
    const [before, after] = await Promise.all(pages.map(snapshot));
    assert.deepEqual(after, before, name);
    results.push({ name, status: 'passed' });
  };
  for (const screen of states) {
    await Promise.all(
      pages.map((page) =>
        page.goto(`http://prototype.test/prototype.html?screen=${screen}`),
      ),
    );
    await equal(`THEME-V-${screen}: text, controls and geometry unchanged`);
    assert.equal(
      await pages[1]
        .locator('.screen')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(255, 255, 255)',
    );
    if (['home', 'quiz', 'path', 'plans'].includes(screen))
      await pages[1]
        .locator('.screen')
        .screenshot({ path: resolve(output, `${screen}.png`) });
    if (screen === 'home') {
      assert.equal(
        await pages[1]
          .locator('.hero .light-button')
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        'rgb(250, 173, 20)',
      );
      assert.equal(
        await pages[1]
          .locator('.hero')
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        'rgb(18, 59, 112)',
      );
    }
  }
  for (const [screen, actions] of [
    ['jd', ['sample-text', 'analyse', 'toggle-match', 'confirm-matches']],
    ['quiz', ['answer', 'quiz-next', 'quiz-back']],
    ['path', ['level', 'course', 'seen']],
    ['home', ['nav:catalog', 'category', 'scene', 'task', 'start-quiz']],
  ]) {
    await Promise.all(
      pages.map((page) =>
        page.goto(`http://prototype.test/prototype.html?screen=${screen}`),
      ),
    );
    for (const step of actions) {
      const [action, value] = step.split(':');
      const selector = `.screen [data-action="${action}"]${value ? `[data-value="${value}"]` : ''}`;
      await Promise.all(
        pages.map((page) => page.locator(selector).first().click()),
      );
      if (action === 'analyse')
        await Promise.all(
          pages.map((page) =>
            page.locator('[data-action="confirm-matches"]').waitFor(),
          ),
        );
      await equal(`THEME-I-${screen}-${action}: interaction unchanged`);
    }
  }
  const overview = await browser.newPage({
    viewport: { width: 1680, height: 1100 },
    reducedMotion: 'reduce',
  });
  await overview.goto(
    `${pathToFileURL(resolve(repositoryRoot, 'index.html')).href}?fit=all`,
  );
  await overview.locator('.tile').last().waitFor();
  assert.equal(await overview.locator('iframe').count(), 15);
  await Promise.all(
    overview
      .frames()
      .slice(1)
      .map((frame) => frame.locator('.screen .page,.loading-page').waitFor()),
  );
  await overview.screenshot({ path: resolve(output, 'overview.png') });
  results.push({
    name: 'THEME-V-overview: all 15 independent frames render',
    status: 'passed',
  });
} finally {
  await browser.close();
}
writeFileSync(
  resolve(output, 'verification.json'),
  `${JSON.stringify({ decision: themeApproval.decision, palette: themeApproval.palette, results, passed: results.length }, null, 2)}\n`,
);
console.log(
  `PASS: ${results.length} prototype appearance/interaction comparisons; screenshots: ${output}`,
);
