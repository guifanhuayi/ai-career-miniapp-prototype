import { expect, test } from '@playwright/test';
import { evidencePath } from './evidence';

const h5 = 'http://127.0.0.1:10086';
const admin = 'http://127.0.0.1:8000';
test('M3-E01 CAT-001/002: real directory search/category intersection/empty reset/task selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(h5);
  await page.getByRole('button', { name: '查看学习方向目录' }).click();
  await expect(
    page.getByText('17 个学习方向 · 每个方向包含 3 个等级'),
  ).toBeVisible();
  const input = page.locator('input');
  await input.fill('PPT');
  await expect(
    page.getByText('1 个学习方向 · 每个方向包含 3 个等级'),
  ).toBeVisible();
  await page.getByRole('button', { name: '求职准备', exact: true }).click();
  await expect(page.getByText('暂时没有匹配的方向')).toBeVisible();
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(
    page.getByText('17 个学习方向 · 每个方向包含 3 个等级'),
  ).toBeVisible();
  await input.fill('提示词');
  await expect(
    page.getByText('1 个学习方向 · 每个方向包含 3 个等级'),
  ).toBeVisible();
  await page.getByRole('button', { name: '查看提示词撰写' }).click();
  await expect(page.getByText('你想完成什么？')).toBeVisible();
  const first = page.getByRole('button', { name: '选择写出一条高质量提示词' });
  const second = page.getByRole('button', {
    name: '选择建立岗位专属提示词模板',
  });
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await second.click();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    path: evidencePath('m3-scene-393.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '返回学习目录' }).click();
  await expect(page.locator('input')).toHaveValue('提示词');
});
test('M3-E02 CAT-002: loading failure is not an empty result; retry recovers and slow stale search cannot replace latest', async ({
  page,
}) => {
  await page.route('**/api/v1/scenes?**', (route) => route.abort());
  await page.goto(`${h5}/#/pages/catalog/index`);
  await expect(page.getByText('学习方向暂时加载失败，请重试。')).toBeVisible();
  await expect(page.getByText('暂时没有匹配的方向')).toHaveCount(0);
  await page.unroute('**/api/v1/scenes?**');
  await page.getByRole('button', { name: '重新加载方向' }).click();
  await expect(
    page.getByText('17 个学习方向 · 每个方向包含 3 个等级'),
  ).toBeVisible();
  await page.route('**/api/v1/scenes?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('search') === 'PPT') {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.locator('input').fill('PPT');
  await page.waitForTimeout(250);
  await page.locator('input').fill('API');
  await expect(
    page.getByRole('button', { name: '查看API 调用原理' }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  await expect(
    page.getByRole('button', { name: '查看API 调用原理' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '查看PPT 制作' })).toHaveCount(
    0,
  );
});
test('M3-E03 VIS-001: original green catalog/icons and readable narrow layouts at320/393/430', async ({
  page,
}) => {
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto(`${h5}/#/pages/catalog/index`);
    await expect(
      page.getByText('17 个学习方向 · 每个方向包含 3 个等级'),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(page.locator('.catalog-row .line-icon')).toHaveCount(17);
    await page.getByRole('button', { name: '内容设计', exact: true }).click();
    await expect(
      page.getByText('2 个学习方向 · 每个方向包含 3 个等级'),
    ).toBeVisible();
    await page.getByRole('button', { name: '全部', exact: true }).click();
    await expect(
      page.getByText('17 个学习方向 · 每个方向包含 3 个等级'),
    ).toBeVisible();
    await page.screenshot({
      path: evidencePath(`m3-catalog-${width}.png`),
      fullPage: true,
    });
  }
});
test('M3-E04 ADM-003 MT-120/124: Pro edit cancel preserves content; real save updates H5; stale version shows409 inside form', async ({
  page,
  context,
}) => {
  await page.goto(`${admin}/content/scenes`);
  const row = page.getByRole('row').filter({ hasText: '提示词撰写' });
  await row.getByRole('button', { name: '编辑场景' }).click();
  let dialog = page.getByRole('dialog', { name: /编辑场景/ });
  await dialog.getByLabel('场景名称').fill('取消后不应保存');
  await dialog.getByRole('button', { name: /^取\s*消$/ }).click();
  await expect(row).toContainText('提示词撰写');
  await row.getByRole('button', { name: '编辑场景' }).click();
  dialog = page.getByRole('dialog', { name: /编辑场景/ });
  const description = dialog.getByLabel('场景说明');
  const original = await description.inputValue();
  const updated = `${original}（E2E验证）`;
  await description.fill(updated);
  await dialog.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(dialog).not.toBeVisible();
  const mobile = await context.newPage();
  try {
    await mobile.goto(`${h5}/#/pages/catalog/index`);
    await expect(mobile.getByText(updated, { exact: true })).toBeVisible();
    await row.getByRole('button', { name: '编辑场景' }).click();
    dialog = page.getByRole('dialog', { name: /编辑场景/ });
    // Two actual browser editors submit the same server version.
    const other = await context.newPage();
    await other.goto(`${admin}/content/scenes`);
    await other
      .getByRole('row')
      .filter({ hasText: '提示词撰写' })
      .getByRole('button', { name: '编辑场景' })
      .click();
    const otherDialog = other.getByRole('dialog', { name: /编辑场景/ });
    await otherDialog.getByLabel('场景说明').fill(original);
    await otherDialog.getByRole('button', { name: /^保\s*存$/ }).click();
    await expect(otherDialog).not.toBeVisible();
    await other.close();
    await description.fill('旧版本不能覆盖');
    await dialog.getByRole('button', { name: /^保\s*存$/ }).click();
    await expect(
      dialog.getByText('场景版本已变化，请刷新后重试'),
    ).toBeVisible();
    await mobile.reload();
    await expect(mobile.getByText(original, { exact: true })).toBeVisible();
    await page.screenshot({
      path: evidencePath('m3-admin-conflict.png'),
      fullPage: true,
    });
  } finally {
    // Restore through the same guarded API even if a UI assertion fails.
    const response = await page.request.get(
      `${admin}/api/v1/admin/scenes?pageSize=100`,
      { headers: { 'X-Admin-Local': '1' } },
    );
    const scene = (await response.json()).items.find(
      (item: { id: string }) => item.id === 'prompt',
    );
    await page.request.patch(`${admin}/api/v1/admin/scenes/prompt`, {
      headers: { 'X-Admin-Local': '1' },
      data: {
        version: scene.version,
        name: scene.name,
        category: scene.category,
        description: original,
        output: scene.output,
        position: scene.position,
        syllabus: scene.syllabus,
      },
    });
    await mobile.close();
  }
});
test('M3-E05 ADM-002/003: course/question forms retain template style and required validation; release audit real', async ({
  page,
}) => {
  await page.goto(`${admin}/content/courses`);
  await expect(
    page.getByText('发布规则：实际总时长大于0且不超过35分钟'),
  ).toBeVisible();
  await page.getByRole('button', { name: '新建课程草稿' }).click();
  const dialog = page.getByRole('dialog', { name: '新建课程草稿' });
  await dialog.getByRole('button', { name: '保存草稿/编辑' }).click();
  await expect(dialog.locator('.ant-form-item-explain-error')).toHaveCount(2);
  await dialog.getByRole('button', { name: /^取\s*消$/ }).click();
  await page.goto(`${admin}/content/questions`);
  await expect(
    page.getByText('mock-question-set-v1', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: '复制为新版本' }).first().click();
  const questionDialog = page.getByRole('dialog', {
    name: '创建模拟题库新版本',
  });
  await expect(questionDialog.getByText('第4题 · 通用题')).toBeVisible();
  await questionDialog.getByRole('button', { name: /^取\s*消$/ }).click();
  await page.goto(`${admin}/content/releases`);
  await expect(page.getByText('内容创建、编辑、发布与下架记录')).toBeVisible();
  await page.screenshot({
    path: evidencePath('m3-admin-releases.png'),
    fullPage: true,
  });
});

test('M3-E06 ADM-002 MT-116/121: Pro creates a real draft, publishes to catalog and archives with audit', async ({
  page,
}) => {
  const title = `E2E自制测试课-${Date.now()}`;
  await page.goto(`${admin}/content/courses`);
  await page
    .getByLabel('搜索课程', { exact: true })
    .fill('不匹配新课程的旧条件');
  const filtered = page.waitForResponse(
    (r) => r.url().includes('/admin/courses?') && r.url().includes('search='),
  );
  await page.getByLabel('搜索课程', { exact: true }).press('Enter');
  await filtered;
  await page.getByRole('button', { name: '新建课程草稿' }).click();
  const dialog = page.getByRole('dialog', { name: '新建课程草稿' });
  await dialog.getByLabel('课程标题', { exact: true }).fill(title);
  await dialog.getByLabel('作者', { exact: true }).fill('本项目E2E测试');
  await dialog.getByLabel(/受控媒体/).click();
  await page
    .getByTitle('local-test-video-v1 · 3秒 · 测试', { exact: true })
    .click();
  await dialog.getByRole('button', { name: '添加章节' }).click();
  await dialog.getByLabel('章节1', { exact: true }).fill('纯色测试片段');
  await dialog.getByLabel('时长（秒）', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: '添加关联' }).click();
  await dialog.getByLabel('任务', { exact: true }).click();
  await page
    .getByTitle('提示词撰写 / 写出一条高质量提示词', { exact: true })
    .click();
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/admin/courses'),
  );
  await dialog.getByRole('button', { name: '保存草稿/编辑' }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const course = await response.json();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('草稿');
  await row.getByRole('button', { name: /^发\s*布$/ }).click();
  await page.getByRole('button', { name: /^确\s*认$/ }).click();
  await expect(row).toContainText('已发布');
  const visible = await page.request.get(
    `${admin}/api/v1/courses/${course.id}`,
  );
  expect(visible.status()).toBe(200);
  expect((await visible.json()).isTest).toBe(true);
  await row.getByRole('button', { name: /^下\s*架$/ }).click();
  await page.getByRole('button', { name: /^确\s*认$/ }).click();
  await expect(row).toContainText('已下架');
  expect(
    (await page.request.get(`${admin}/api/v1/courses/${course.id}`)).status(),
  ).toBe(404);
  await page.goto(`${admin}/content/releases`);
  await expect(
    page.getByRole('cell', { name: course.id, exact: true }),
  ).toHaveCount(3);
});
