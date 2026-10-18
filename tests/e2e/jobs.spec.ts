import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import sample from '../../packages/domain/fixtures/ocr/mock-jd-v1.json';
import { evidencePath } from './evidence';

const h5 = 'http://127.0.0.1:10086';
const jd = `${h5}/#/pages/jd/index`;
const submit = (page: Page) =>
  page.getByRole('button', { name: '确认文字并分析', exact: true });
const example = (page: Page) =>
  page.getByRole('button', { name: '没有JD？先用示例体验', exact: true });

test('M4-E01 MT-019–025/041–048: literal text, Unicode bounds, confirmed evidence and candidate selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(jd);
  await expect(submit(page)).toBeDisabled();
  const input = page.getByLabel('岗位描述 / JD', { exact: true });
  await input.fill(' \n\t');
  await expect(submit(page)).toBeDisabled();
  await input.fill('😀'.repeat(8001));
  await expect(page.getByText('8001/8000字', { exact: true })).toBeVisible();
  await expect(input).toHaveValue('😀'.repeat(8001));
  await expect(submit(page)).toBeDisabled();
  const text =
    '<img src=x onerror="window.unwanted=true"> 使用Excel进行数据分析，完成PPT汇报。';
  await input.fill(text);
  await page
    .getByLabel('目标岗位（选填，最多100字）', { exact: true })
    .fill('😀'.repeat(101));
  await expect(submit(page)).toBeDisabled();
  await page
    .getByLabel('目标岗位（选填，最多100字）', { exact: true })
    .fill('W'.repeat(100));
  await submit(page).click();
  await expect(page.getByText('从这些方向开始', { exact: true })).toBeVisible();
  await expect(page.locator('.source-text')).toHaveText(text);
  await expect(page.locator('.job-heading')).toHaveText('W'.repeat(100));
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  expect(await page.evaluate(() => 'unwanted' in window)).toBe(false);
  await expect(
    page.getByRole('button', { name: '确认方向，选择具体任务' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '选择PPT 制作', exact: true }).click();
  await page
    .getByRole('button', { name: '选择表格制作与数据分析', exact: true })
    .click();
  await expect(page.getByText('已选 2 个方向', { exact: true })).toBeVisible();
  await expect(page.getByText(/下一步进入“PPT 制作”/)).toBeVisible();
  await page.screenshot({
    path: evidencePath('m4-analysis-393.png'),
    fullPage: true,
  });
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/selection') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '确认方向，选择具体任务' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('你想完成什么？', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/analysisJobId=/);
  await page.getByRole('button', { name: '返回本次分析', exact: true }).click();
  await expect(page.getByText('已选 2 个方向', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '选择表格制作与数据分析', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('M4-E02 MT-024/025/031/032: example waits for confirmation, lost response retry keeps one immutable input', async ({
  page,
}) => {
  await page.goto(jd);
  let creates = 0;
  const ids: string[] = [];
  await page.route('**/api/v1/job-descriptions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    creates++;
    const response = await route.fetch();
    ids.push((await response.json()).id);
    if (creates === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await example(page).click();
  await expect(page.getByLabel('岗位描述 / JD', { exact: true })).toHaveValue(
    sample.text,
  );
  expect(creates).toBe(0);
  await submit(page).click();
  await expect(page.locator('.error')).toBeVisible();
  await expect(page.getByLabel('岗位描述 / JD', { exact: true })).toHaveValue(
    sample.text,
  );
  await submit(page).click();
  await expect(page.getByText('从这些方向开始', { exact: true })).toBeVisible();
  expect(ids.length).toBe(2);
  expect(ids[0]).toBe(ids[1]);
  const url = page.url();
  await page.reload();
  await expect(page.getByText('从这些方向开始', { exact: true })).toBeVisible();
  expect(page.url()).toBe(url);
  expect(creates).toBe(2);
});

test('M4-E03 MT-025/033–037: simulated screenshot review is editable, confirmed only and survives reload', async ({
  page,
}) => {
  await page.goto(jd);
  await page.getByLabel('岗位描述 / JD', { exact: true }).fill('独立文字草稿');
  await page.getByRole('button', { name: '上传岗位截图', exact: true }).click();
  await page
    .getByRole('button', { name: '使用示例截图（模拟）', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '核对岗位文字', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '核对岗位文字', exact: true }).click();
  await expect(page.getByText(/当前是示例图片的本地模拟识别/)).toBeVisible();
  const input = page.getByLabel('核对后的岗位文字', { exact: true });
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue(sample.text);
  await input.fill('核对后只需要PPT制作，不需要原示例的其他描述。');
  await page.reload();
  await expect(input).toHaveValue(
    '核对后只需要PPT制作，不需要原示例的其他描述。',
  );
  await expect(input).toBeEnabled();
  await page.screenshot({
    path: evidencePath('m4-review-393.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: '确认核对稿并分析', exact: true })
    .click();
  await expect(page.getByText('从这些方向开始', { exact: true })).toBeVisible();
  await expect(page.locator('.source-text')).toHaveText(
    '核对后只需要PPT制作，不需要原示例的其他描述。',
  );
  await page.getByRole('button', { name: '返回岗位输入', exact: true }).click();
  await expect(page.getByLabel('岗位描述 / JD', { exact: true })).toHaveValue(
    '独立文字草稿',
  );
});

test('M4-E04 MT-026/028–030/034/035: ordinary image stays manual and bad replacement retains valid upload', async ({
  page,
}) => {
  await page.goto(`${jd}?mode=image`);
  const choose = async (
    file: string | { name: string; mimeType: string; buffer: Buffer },
  ) => {
    const dialog = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: '选择岗位截图', exact: true })
      .click();
    await (await dialog).setFiles(file);
  };
  await choose(resolve('apps/miniapp/src/assets/prototype-icons/book.png'));
  await expect(
    page.getByRole('button', { name: '核对岗位文字', exact: true }),
  ).toBeEnabled();
  const stored = await page.evaluate(() =>
    localStorage.getItem('career.jd.image.v1'),
  );
  expect(stored).not.toBeNull();
  await choose({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a real image'),
  });
  await expect(page.locator('.error')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('career.jd.image.v1')),
  ).toBe(stored);
  await expect(
    page.getByRole('button', { name: '核对岗位文字', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '核对岗位文字', exact: true }).click();
  await expect(page.getByText(/请根据截图手工补录文字/)).toBeVisible();
  await expect(
    page.getByLabel('核对后的岗位文字', { exact: true }),
  ).toHaveValue('');
  await expect(
    page.getByRole('button', { name: '确认核对稿并分析', exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel('核对后的岗位文字', { exact: true })
    .fill('只处理用户确认的Excel数据分析');
  await page
    .getByRole('button', { name: '确认核对稿并分析', exact: true })
    .click();
  await expect(page.getByText('从这些方向开始', { exact: true })).toBeVisible();
  await expect(page.locator('.source-text')).toHaveText(
    '只处理用户确认的Excel数据分析',
  );
});

test('M4-E05 MT-038–040: unavailable poll is an error and reloading restores the same analysis', async ({
  page,
}) => {
  await page.goto(jd);
  await example(page).click();
  await page.route('**/api/v1/analysis-jobs/*', (route) =>
    route.request().method() === 'GET'
      ? route.abort('failed')
      : route.continue(),
  );
  await submit(page).click();
  await expect(page.locator('.error')).toBeVisible();
  await expect(page.getByText('从这些方向开始', { exact: true })).toHaveCount(
    0,
  );
  const url = page.url();
  await page.unroute('**/api/v1/analysis-jobs/*');
  await page.getByRole('button', { name: '重新读取分析', exact: true }).click();
  await expect(page.getByText('从这些方向开始', { exact: true })).toBeVisible();
  expect(page.url()).toBe(url);
});

test('M4-E06 MT-025/036: text/image drafts stay independent and replacing with an example needs confirmation', async ({
  page,
}) => {
  await page.goto(jd);
  await expect(
    page.getByRole('button', { name: '恢复最近一次分析', exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel('岗位描述 / JD', { exact: true })
    .fill('必须保留的文字草稿');
  await page.getByRole('button', { name: '上传岗位截图', exact: true }).click();
  await page
    .getByLabel('目标岗位（选填，最多100字）', { exact: true })
    .fill('截图模式的岗位');
  await page.getByRole('button', { name: '粘贴岗位文字', exact: true }).click();
  await expect(
    page.getByLabel('目标岗位（选填，最多100字）', { exact: true }),
  ).toHaveValue('');
  await expect(page.getByLabel('岗位描述 / JD', { exact: true })).toHaveValue(
    '必须保留的文字草稿',
  );
  await example(page).click();
  await page.getByText('保留原稿', { exact: true }).click();
  await expect(page.getByLabel('岗位描述 / JD', { exact: true })).toHaveValue(
    '必须保留的文字草稿',
  );
  await example(page).click();
  await page.getByText('使用示例', { exact: true }).click();
  await expect(page.getByLabel('岗位描述 / JD', { exact: true })).toHaveValue(
    sample.text,
  );
  await page.getByRole('button', { name: '上传岗位截图', exact: true }).click();
  await expect(
    page.getByLabel('目标岗位（选填，最多100字）', { exact: true }),
  ).toHaveValue('截图模式的岗位');
});

test('M4-E07 MT-040: late OCR from a hidden page cannot replace a newer image or force old navigation', async ({
  page,
}) => {
  await page.goto(h5);
  await page.getByRole('button', { name: '解析我的岗位', exact: true }).click();
  await page.getByRole('button', { name: '上传岗位截图', exact: true }).click();
  await page
    .getByRole('button', { name: '使用示例截图（模拟）', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '核对岗位文字', exact: true }),
  ).toBeEnabled();
  let release = () => {};
  let received = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route('**/api/v1/ocr-jobs', async (route) => {
    const response = await route.fetch();
    received();
    await delayed;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole('button', { name: '核对岗位文字', exact: true })
      .click();
    await started;
    await page.goBack();
    await page
      .getByRole('button', { name: '解析我的岗位', exact: true })
      .click();
    // Re-entering the same route mounts a second page during Taro's transition.
    // Wait for the old hidden page to leave before interacting with the new one.
    await expect(
      page.getByRole('button', { name: '上传岗位截图', exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole('button', { name: '上传岗位截图', exact: true })
      .click();
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: '选择岗位截图', exact: true })
      .click();
    await (await chooser).setFiles(
      resolve('apps/miniapp/src/assets/prototype-icons/book.png'),
    );
    await expect(
      page.getByRole('button', { name: '核对岗位文字', exact: true }),
    ).toBeEnabled();
    const latest = await page.evaluate(() =>
      localStorage.getItem('career.jd.image.v1'),
    );
    expect(latest).not.toBeNull();
    const finished = page.waitForResponse((response) =>
      response.url().endsWith('/ocr-jobs'),
    );
    release();
    await finished;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(
      await page.evaluate(() => localStorage.getItem('career.jd.image.v1')),
    ).toBe(latest);
    await expect(page).toHaveURL(/pages\/jd\/index/);
  } finally {
    release();
  }
});

test('M4-E08 MT-039: injected timeout terminal offers a real new analysis, keeping its confirmed snapshot', async ({
  page,
}) => {
  await page.goto(jd);
  await example(page).click();
  let original = '';
  await page.route('**/api/v1/analysis-jobs/*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    original ||= data.id;
    await route.fulfill({
      response,
      json:
        data.id === original
          ? { ...data, status: 'failed', errorCode: 'ANALYSIS_TIMEOUT' }
          : data,
    });
  });
  await submit(page).click();
  await expect(page.getByText('本次分析未完成', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: '重新分析这段文字', exact: true })
    .click();
  await expect(page.getByText('从这些方向开始', { exact: true })).toBeVisible();
  expect(page.url()).not.toContain(original);
  await expect(page.locator('.source-text')).toHaveText(sample.text);
});
