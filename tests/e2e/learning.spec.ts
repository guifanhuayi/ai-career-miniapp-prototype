import { expect, type Page, test } from '@playwright/test';
import { evidencePath } from './evidence';

const h5 = 'http://127.0.0.1:10086';
test.use({ viewport: { width: 393, height: 852 } });
async function begin(page: Page, task = 0) {
  await page.goto(`${h5}/#/pages/scene/index?sceneId=ppt`);
  await page.reload();
  await expect(
    page.getByRole('button', { name: '确定任务，进入学习' }),
  ).toBeDisabled();
  await page.locator('.choice').nth(task).click();
  await page.getByRole('button', { name: '确定任务，进入学习' }).click();
  await expect(
    page.getByText('场景能力小测 · 1 / 4', { exact: true }),
  ).toBeVisible();
}
async function finish(page: Page) {
  for (let i = 0; i < 4; i++) {
    await expect(
      page.getByText(`场景能力小测 · ${i + 1} / 4`, { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^选项A：/ }).click();
    const button = page.getByRole('button', {
      name: i === 3 ? '提交测验' : '下一题',
      exact: true,
    });
    await expect(button).toBeEnabled();
    await button.click();
  }
  await expect(page.getByText('建议学习起点', { exact: true })).toBeVisible();
}
test('M5-E01 MT065-088: real quiz draft, previous answer, refresh, result review and persisted level', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await begin(page);
  await expect(
    page.getByRole('button', { name: '下一题', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /^选项B：/ }).click();
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('button', { name: '上一题', exact: true }).click();
  await expect(page.getByRole('button', { name: /^选项B：/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: /^选项B：/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({
    path: evidencePath('m5-quiz-393.png'),
    fullPage: true,
  });
  await finish(page);
  await expect(page.getByText(/不是专业能力认证/)).toBeVisible();
  await page.getByRole('button', { name: '查看答题回顾', exact: true }).click();
  await expect(page.getByText(/参考答案：/)).toHaveCount(4);
  await page.screenshot({
    path: evidencePath('m5-result-393.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '关闭答题回顾', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '答题回顾' })).toHaveCount(0);
  await expect(page.getByText('建议学习起点', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看分级课程', exact: true }).click();
  await expect(
    page.getByText('这一阶段，需要学什么？', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '切换高阶', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '切换高阶', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    page.getByRole('button', { name: '切换高阶', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: /1–3|约30|系统课程|短视频/ }),
  ).toHaveCount(0);
  await page.screenshot({
    path: evidencePath('m5-path-393.png'),
    fullPage: true,
  });
  const courseResponse = page.waitForResponse(
    (r) =>
      /\/learning-plans\/[^/]+\/courses\/[^/]+$/.test(r.url()) &&
      r.request().method() === 'GET',
  );
  await page
    .getByRole('button', { name: /^打开课程封面：/ })
    .first()
    .click();
  const selected = await (await courseResponse).json();
  await expect(page).toHaveURL(
    new RegExp(`courseId=${encodeURIComponent(selected.course.id)}`),
  );
});
test('M5-E02 MT071/072: failed answer never advances, lost submit response retry returns same result', async ({
  page,
}) => {
  await begin(page);
  await page.route('**/answers/*', (route) => route.abort('failed'));
  await page.getByRole('button', { name: /^选项A：/ }).click();
  await expect(page.locator('.error')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '下一题', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/answers/*');
  const results: string[] = [];
  await page.route('**/submissions', async (route) => {
    const response = await route.fetch();
    results.push((await response.json()).id);
    if (results.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /^选项A：/ }).click();
    const b = page.getByRole('button', {
      name: i === 3 ? '提交测验' : '下一题',
      exact: true,
    });
    await expect(b).toBeEnabled();
    await b.click();
  }
  await expect(page.locator('.error')).toBeVisible();
  await page.getByRole('button', { name: '提交测验', exact: true }).click();
  await expect(page.getByText('建议学习起点', { exact: true })).toBeVisible();
  expect(results.length).toBe(2);
  expect(results[1]).toBe(results[0]);
});
test('M5-E03 MT089-102/107: actual video plays, pause position persists, ended is separate from manual mark', async ({
  page,
}) => {
  await begin(page);
  await finish(page);
  await page.getByRole('button', { name: '查看分级课程', exact: true }).click();
  await page
    .getByRole('button', { name: '开始当前列表第一课', exact: true })
    .click();
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((e: HTMLVideoElement) => e.readyState))
    .toBeGreaterThanOrEqual(1);
  const duration = await video.evaluate((e: HTMLVideoElement) => e.duration);
  expect(duration).toBeGreaterThan(0);
  expect(duration).toBeLessThanOrEqual(2100);
  await page
    .getByRole('button', { name: '点击封面播放本课', exact: true })
    .click();
  await expect
    .poll(() => video.evaluate((e: HTMLVideoElement) => e.ended))
    .toBe(true);
  await expect(
    page.getByRole('button', { name: '手动标记看过', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '播放这门课程', exact: true }).click();
  await expect
    .poll(() => video.evaluate((e: HTMLVideoElement) => e.paused))
    .toBe(false);
  const save = page.waitForResponse(
    (r) =>
      r.url().endsWith('/progress') &&
      r.request().method() === 'PUT' &&
      r.request().postDataJSON()?.position === 1,
  );
  await video.evaluate((e: HTMLVideoElement) => {
    e.currentTime = 1;
    e.pause();
  });
  expect((await save).status()).toBe(200);
  await page.reload();
  await expect
    .poll(() =>
      page.locator('video').evaluate((e: HTMLVideoElement) => e.currentTime),
    )
    .toBeCloseTo(1, 1);
  await page.getByRole('button', { name: '手动标记看过', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '已标记看过 · 点击取消', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: '已标记看过 · 点击取消', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: evidencePath('m5-course-393.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: '已标记看过 · 点击取消', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '手动标记看过', exact: true }),
  ).toBeVisible();
});
test('M6-E01 MT103-114: multiple tasks, graded/draft resume, shared mark and new visitor cannot read old records', async ({
  page,
}) => {
  await begin(page);
  await finish(page);
  await page.getByRole('button', { name: '查看分级课程', exact: true }).click();
  const firstPlan = page.url();
  await begin(page, 1);
  await page.getByRole('button', { name: /^选项C：/ }).click();
  const draft = page.url();
  await page.getByRole('button', { name: '返回我的学习', exact: true }).click();
  await expect(
    page.getByText('2 个学习任务，按你的节奏来。', { exact: true }),
  ).toBeVisible();
  const cards = page.locator('.card');
  await expect(cards).toHaveCount(2);
  await expect(page.getByText('有未完成的测验', { exact: true })).toBeVisible();
  await cards
    .filter({ hasText: '有未完成的测验' })
    .getByRole('button', { name: /继续任务/ })
    .click();
  await expect(page).toHaveURL(draft);
  // Taro's page transition briefly keeps both copies mounted; wait for the active page only.
  await expect(page.getByRole('button', { name: /^选项C：/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^选项C：/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '返回我的学习', exact: true }).click();
  await page
    .locator('.card')
    .filter({ hasText: '手动看过' })
    .getByRole('button', { name: /继续任务/ })
    .click();
  await expect(page).toHaveURL(firstPlan);
  await expect(page.getByText('为你推荐的课程', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: '查看我的其他学习任务', exact: true })
    .click();
  await expect(
    page.getByText('2 个学习任务，按你的节奏来。', { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText('2 个学习任务，按你的节奏来。', { exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByText('为你推荐的课程', { exact: true }),
  ).not.toBeInViewport();
  await page.screenshot({
    path: evidencePath('m6-plans-393.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByText('你的第一条学习路径，还没开始。', { exact: true }),
  ).toBeVisible();
  await page.goto(firstPlan);
  await expect(page.locator('.error')).toBeVisible();
  await expect(page.getByText('为你推荐的课程', { exact: true })).toHaveCount(
    0,
  );
});
test('M5-E04 MT084/089/091/100/140: course empty/error, variable chapters, media failure and responsive approved home', async ({
  page,
}) => {
  await page.goto(h5);
  await expect(page.getByText('学一点 AI，', { exact: true })).toBeVisible();
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: evidencePath(`m5-home-${width}.png`),
      fullPage: true,
    });
  }
  await begin(page);
  await finish(page);
  await page.getByRole('button', { name: '查看分级课程', exact: true }).click();
  const path = page.url();
  await page.route('**/api/v1/courses?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }),
    }),
  );
  await page.reload();
  await expect(page.getByText(/当前等级暂无已发布课程/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '开始当前列表第一课', exact: true }),
  ).toHaveCount(0);
  await page.unroute('**/api/v1/courses?*');
  await page.route('**/api/v1/courses?*', (route) => route.abort('failed'));
  await page.reload();
  await expect(page.locator('.error')).toBeVisible();
  await expect(page.getByText(/当前等级暂无已发布课程/)).toHaveCount(0);
  await page.unroute('**/api/v1/courses?*');
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await page
    .getByRole('button', { name: '开始当前列表第一课', exact: true })
    .click();
  const course = page.url();
  for (const count of [2, 3, 4]) {
    await page.route('**/api/v1/learning-plans/*/courses/*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      body.course.chapters = Array.from({ length: count }, (_, i) => ({
        title: `动态章节${i + 1}`,
        durationSeconds: body.course.durationSeconds / count,
      }));
      await route.fulfill({ response, json: body });
    });
    await page.reload();
    await expect(page.locator('.chapter')).toHaveCount(count);
    await expect(page.getByRole('button', { name: /跳到章节/ })).toHaveCount(
      count,
    );
    await page.unroute('**/api/v1/learning-plans/*/courses/*');
  }
  await page.route('**/api/v1/media/*', (route) => route.abort('failed'));
  await page.goto(course);
  await page.reload();
  await expect(page.getByText(/视频暂时无法播放/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '手动标记看过', exact: true }),
  ).toBeDisabled();
  expect(path).toContain('/pages/path/');
});

test('M5-E05 MT075-078: review dialog close/backdrop/Escape and abandoned retake preserve previous result', async ({
  page,
}) => {
  await begin(page);
  await finish(page);
  const resultUrl = page.url();
  const original = await page.locator('.result-dim').textContent();
  expect(original).not.toBeNull();
  await page.getByRole('button', { name: '查看答题回顾', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '答题回顾' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '查看答题回顾', exact: true }).click();
  await page.mouse.click(4, 4);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '重新测验', exact: true }).click();
  await expect(
    page.getByText('场景能力小测 · 1 / 4', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^选项C：/ }).click();
  await page.goBack();
  await expect(page).toHaveURL(resultUrl);
  await expect(page.locator('.result-dim')).toHaveText(original ?? '');
  await page.getByRole('button', { name: '查看答题回顾', exact: true }).click();
  await expect(page.getByText(/参考答案：/)).toHaveCount(4);
  await expect(page.getByText(/undefined/)).toHaveCount(0);
  await page.getByRole('button', { name: '关闭答题回顾', exact: true }).click();
  await page.getByRole('button', { name: '查看分级课程', exact: true }).click();
  await page.getByRole('button', { name: '切换高阶', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '切换高阶', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.locator('.result-dim')).toHaveText(original ?? '');
});
test('M6-E02 MT012-015/105/111: bottom navigation uses existing icons and both empty learning entrances work', async ({
  page,
}) => {
  await page.goto(h5);
  const bar = page.locator('.weui-tabbar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('img')).toHaveCount(3);
  await expect
    .poll(() =>
      bar
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (e) =>
              (e as HTMLImageElement).complete &&
              (e as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await bar.getByText('学习场景', { exact: true }).click();
  await expect(page).toHaveURL(/pages\/catalog\/index/);
  await expect(
    page.getByText('17 个学习方向 · 每个方向包含 3 个等级', { exact: true }),
  ).toBeVisible();
  await bar.getByText('我的学习', { exact: true }).click();
  await expect(
    page.getByText('你的第一条学习路径，还没开始。', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '从目标岗位开始', exact: true })
    .click();
  await expect(page.getByLabel('岗位描述 / JD', { exact: true })).toBeVisible();
  await page.goto(`${h5}/#/pages/plans/index`);
  await page.getByRole('button', { name: '添加学习任务', exact: true }).click();
  await expect(page).toHaveURL(/pages\/catalog\/index/);
  await bar.getByText('首页', { exact: true }).click();
  await expect(page.getByText('学一点 AI，', { exact: true })).toBeVisible();
});
