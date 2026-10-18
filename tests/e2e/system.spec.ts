import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { evidencePath } from './evidence';

const h5 = 'http://127.0.0.1:10086';
test('M8-E04 L34/35/41/42 MT130: job-to-course funnel, two-course switching, archive fallback and nonempty-plan return', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`${h5}/#/pages/jd/index`);
  await page
    .getByLabel('岗位描述 / JD', { exact: true })
    .fill('需要制作PPT汇报');
  await page
    .getByRole('button', { name: '确认文字并分析', exact: true })
    .click();
  await page.getByRole('button', { name: '选择PPT 制作', exact: true }).click();
  await page
    .getByRole('button', { name: '确认方向，选择具体任务', exact: true })
    .click();
  await page.locator('.task-radio').first().click();
  const planResponse = page.waitForResponse(
    (r) =>
      /\/learning-plans\/[^/]+$/.test(r.url()) &&
      r.request().method() === 'GET',
  );
  await page
    .getByRole('button', { name: '确定任务，进入学习', exact: true })
    .click();
  const plan = await (await planResponse).json();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /^选项A：/ }).click();
    await page
      .getByRole('button', {
        name: i === 3 ? '提交测验' : '下一题',
        exact: true,
      })
      .click();
  }
  await page.getByRole('button', { name: '查看分级课程', exact: true }).click();
  const firstResponse = page.waitForResponse(
    (r) =>
      /\/learning-plans\/[^/]+\/courses\/[^/]+$/.test(r.url()) &&
      r.request().method() === 'GET',
  );
  await page
    .getByRole('button', { name: /^查看课程：/ })
    .first()
    .click();
  const first = (await (await firstResponse).json()).course;
  const admin = { 'X-Admin-Local': '1' },
    api = 'http://127.0.0.1:3100/api/v1';
  const created = await request.post(`${api}/admin/courses`, {
    headers: admin,
    data: {
      idempotencyKey: randomUUID(),
      title: 'M8第二门自制测试课程',
      author: first.author,
      mediaAssetId: first.mediaAssetId,
      durationSeconds: first.durationSeconds,
      authorization: first.authorization,
      isTest: true,
      chapters: first.chapters,
      mappings: [
        {
          taskId: plan.taskId,
          level: first.mappings.find(
            (m: { taskId: string }) => m.taskId === plan.taskId,
          ).level,
        },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const second = await created.json();
  const release = async (status: 'published' | 'archived', version: number) => {
    const r = await request.post(`${api}/admin/content-releases`, {
      headers: admin,
      data: {
        resource: 'course',
        resourceId: second.id,
        version,
        status,
        idempotencyKey: randomUUID(),
      },
    });
    expect(r.status()).toBe(201);
  };
  await release('published', 1);
  try {
    await page
      .getByRole('button', { name: '返回分级课程', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: '查看课程：M8第二门自制测试课程',
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`courseId=${second.id}`));
    await expect(page.locator('video')).toBeVisible();
    await page
      .getByRole('button', { name: '播放这门课程', exact: true })
      .click();
    await expect
      .poll(() =>
        page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime),
      )
      .toBeGreaterThan(0);
    await page
      .getByRole('button', { name: '返回分级课程', exact: true })
      .click();
    await release('archived', 2);
    await page.reload();
    await expect(
      page.getByRole('button', {
        name: '查看课程：M8第二门自制测试课程',
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: '开始当前列表第一课', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`courseId=${first.id}`));
    await page
      .getByRole('button', { name: '播放这门课程', exact: true })
      .click();
    await page
      .getByRole('button', { name: '返回分级课程', exact: true })
      .click();
    await page
      .getByRole('button', { name: '查看我的其他学习任务', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: `继续任务：${plan.taskName}`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '添加学习任务', exact: true })
      .click();
    await expect(page.getByText('从一个任务，', { exact: true })).toBeVisible();
    await page
      .locator('.weui-tabbar')
      .getByText('我的学习', { exact: true })
      .last()
      .click();
    await expect(
      page.getByRole('button', {
        name: `继续任务：${plan.taskName}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const r = await request.get(`${api}/admin/analytics?environment=test`, {
          headers: admin,
        });
        const data = await r.json();
        return data.jobFunnel.find(
          (s: { name: string }) => s.name === 'course_open_attempted',
        ).chains;
      })
      .toBeGreaterThan(0);
  } finally {
    const current = await (
      await request.get(`${api}/admin/courses/${second.id}`, { headers: admin })
    ).json();
    if (current.status === 'published')
      await release('archived', current.version);
  }
});
test('M8-E01 L04: each featured homepage card resolves to its own scene', async ({
  page,
}) => {
  for (const [id] of [
    ['prompt', '提示词撰写'],
    ['ppt', 'PPT制作'],
    ['data', '表格制作与数据分析'],
    ['resume', '简历制作与排版'],
  ]) {
    await page.goto(`${h5}/#/pages/index/index`);
    await page.reload();
    const choices = page.locator('.scene-tile');
    await expect(choices).toHaveCount(4);
    const index = ['prompt', 'ppt', 'data', 'resume'].indexOf(id!);
    await choices.nth(index).click();
    await expect(page).toHaveURL(new RegExp(`sceneId=${id}`));
    await expect(
      page.getByText('你想完成什么？', { exact: true }),
    ).toBeVisible();
  }
});
test('M8-E02 L15/L18: sample text replacement confirms/cancels, normal analysis returns preserved JD', async ({
  page,
}) => {
  await page.goto(`${h5}/#/pages/jd/index?mode=image`);
  await page
    .getByRole('button', { name: '使用示例截图（模拟）', exact: true })
    .click();
  await page.getByRole('button', { name: '核对岗位文字', exact: true }).click();
  const text = page.getByRole('textbox', { name: '核对后的岗位文字' });
  await text.fill('我修改过的核对稿：需要制作PPT汇报');
  await page.getByRole('button', { name: '使用示例文字', exact: true }).click();
  await page.getByText('取消', { exact: true }).last().click();
  await expect(text).toHaveValue('我修改过的核对稿：需要制作PPT汇报');
  await page.getByRole('button', { name: '使用示例文字', exact: true }).click();
  await page.getByText('确定', { exact: true }).last().click();
  await expect(text).not.toHaveValue('我修改过的核对稿：需要制作PPT汇报');
  await page
    .getByRole('button', { name: '确认核对稿并分析', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '确认方向，选择具体任务', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '返回岗位输入', exact: true }).click();
  await page.getByRole('button', { name: '上传岗位截图', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '核对岗位文字', exact: true }),
  ).toBeEnabled();
});
test('M8-E03 MT139/140/142: long Chinese task heading and controls stay within 320/393/430 short screens', async ({
  page,
}) => {
  await page.route('**/api/v1/scenes/ppt', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        name: '超长中文方向与任务名称'.repeat(8),
        description: '长内容适配说明'.repeat(25),
      },
    });
  });
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 568 });
    await page.goto(`${h5}/#/pages/scene/index?sceneId=ppt`);
    await page.reload();
    await expect(page.locator('.task-radio').first()).toBeVisible();
    await page.locator('.title').first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: evidencePath(`m8-long-task-${width}-top.png`),
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    const button = page.getByRole('button', {
      name: '确定任务，进入学习',
      exact: true,
    });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    await page.screenshot({
      path: evidencePath(`m8-long-task-${width}.png`),
      fullPage: true,
    });
  }
});
