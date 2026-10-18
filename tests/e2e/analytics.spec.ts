import { expect, test } from '@playwright/test';
import { evidencePath } from './evidence';

const h5 = 'http://127.0.0.1:10086';
test.use({ viewport: { width: 393, height: 852 } });
test('M7-E01 MT130/131/133: analytics network failure never blocks task/quiz, queued retry keeps event IDs', async ({
  page,
  request,
}) => {
  const attempts: { eventId: string; name: string }[][] = [];
  let fail = true;
  await page.route('**/api/v1/events', async (route) => {
    attempts.push(route.request().postDataJSON().events);
    if (fail) await route.abort('failed');
    else await route.continue();
  });
  await page.goto(`${h5}/#/pages/scene/index?sceneId=ppt`);
  await page.locator('.choice').first().click();
  await page.getByRole('button', { name: '确定任务，进入学习' }).click();
  for (let i = 0; i < 4; i++) {
    await expect(
      page.getByText(`场景能力小测 · ${i + 1} / 4`, { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^选项A：/ }).click();
    await page
      .getByRole('button', {
        name: i === 3 ? '提交测验' : '下一题',
        exact: true,
      })
      .click();
  }
  await expect(page.getByText('建议学习起点', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看分级课程', exact: true }).click();
  await expect(page.getByText('为你推荐的课程', { exact: true })).toBeVisible();
  expect(attempts.length).toBeGreaterThan(0);
  fail = false;
  await expect
    .poll(
      () => attempts.flat().some((e) => e.name === 'recommendation_viewed'),
      { timeout: 15000 },
    )
    .toBe(true);
  const credential = await page.evaluate(() =>
    localStorage.getItem('career.visitor.credential.v1'),
  );
  expect(credential).toBeTruthy();
  await page
    .getByRole('button', { name: '开始当前列表第一课', exact: true })
    .click();
  await expect(page.locator('video')).toBeVisible();
  await page.getByRole('button', { name: '播放这门课程', exact: true }).click();
  await expect
    .poll(() => attempts.flat().some((e) => e.name === 'video_started'))
    .toBe(true);
  const response = await request.get(
    'http://127.0.0.1:3100/api/v1/admin/analytics?environment=test',
    { headers: { 'X-Admin-Local': '1' } },
  );
  expect(response.ok()).toBe(true);
  const report = await response.json();
  expect(
    report.taskFunnel.find(
      (s: { name: string }) => s.name === 'course_open_attempted',
    ).chains,
  ).toBeGreaterThan(0);
  expect(attempts.flat().some((e) => e.name === 'assessment_submitted')).toBe(
    false,
  );
  const first = attempts[0]![0]!.eventId;
  expect(
    attempts.filter((batch) => batch.some((e) => e.eventId === first)).length,
  ).toBeGreaterThan(1);
});

test('M7-E02 MT115/123/124: Pro reporting filters actual data, rejects bad range, failure recovers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('http://127.0.0.1:8000/analytics');
  await expect(page.getByText(/区间学习访客 0/)).toBeVisible();
  await page.getByRole('combobox', { name: '数据环境' }).click();
  await page.getByText('测试环境', { exact: true }).last().click();
  await expect(page.getByText(/· test ·/)).toBeVisible();
  await expect(
    page.getByText('直接任务入口漏斗 · 24小时有序任务链', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: evidencePath('m7-admin-analytics.png'),
    fullPage: true,
  });
  await page.getByLabel('开始日期').fill('2026-10-18');
  await page.getByLabel('结束日期').fill('2026-10-01');
  await page.getByRole('button', { name: '查询报表' }).click();
  await expect(page.getByText(/日期范围须位于/)).toBeVisible();
  await page.getByLabel('开始日期').fill('');
  await page.getByLabel('结束日期').fill('');
  await page.route('**/api/v1/admin/analytics?*', (route) =>
    route.abort('failed'),
  );
  await page.getByRole('button', { name: '查询报表' }).click();
  await expect(
    page.getByText('请检查日期范围或连接后重新查询。'),
  ).toBeVisible();
  await page.unroute('**/api/v1/admin/analytics?*');
  await page.getByRole('button', { name: '查询报表' }).click();
  await expect(page.getByText(/· test ·/)).toBeVisible();
});
