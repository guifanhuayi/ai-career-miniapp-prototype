import { expect, test } from '@playwright/test';

test('M2-E01: H5 connects to MySQL API and restores one anonymous visitor after reload', async ({
  page,
}) => {
  let creations = 0;
  page.on('response', (response) => {
    if (
      response.url().endsWith('/visitor-sessions') &&
      response.status() === 201
    )
      creations++;
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://127.0.0.1:10086');
  await expect(page.getByText(/API已连接 · mysql/)).toBeVisible();
  await expect(page.getByText(/清除本机存储或换设备后/)).toBeVisible();
  expect(creations).toBe(1);
  await page.reload();
  await expect(page.getByText(/API已连接 · mysql/)).toBeVisible();
  expect(creations).toBe(1);
  await expect(page.getByRole('button', { name: /登录/ })).toHaveCount(0);
  await page.screenshot({
    path: 'docs/development/evidence/m2-h5-393.png',
    fullPage: true,
  });
});
test('M2-E02: H5 request failure is visible and retry recovers without resetting visitor', async ({
  page,
}) => {
  await page.route('**/api/v1/health', (route) => route.abort('failed'));
  await page.goto('http://127.0.0.1:10086');
  await expect(page.getByText(/本地服务或访客记录连接失败/)).toBeVisible();
  await page.unroute('**/api/v1/health');
  await page.getByRole('button', { name: '重新检查连接' }).click();
  await expect(page.getByText(/API已连接 · mysql/)).toBeVisible();
});
test('M2-E03: official Pro status page reads guarded API and reports backend failure truthfully', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:8000');
  await expect(page.getByText('首期本地管理环境')).toBeVisible();
  await expect(page.getByText('mysql', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/system/);
  await page.screenshot({
    path: 'docs/development/evidence/m2-admin.png',
    fullPage: true,
  });
  await page.route('**/api/v1/admin/system', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: '测试注入：服务暂不可用' }),
    }),
  );
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByText('测试注入：服务暂不可用')).toBeVisible();
  await expect(page.getByText('mysql', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/admin/system');
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByText('mysql', { exact: true })).toBeVisible();
});
test('M2-E04: approved green tokens and393reference typography survive H5 scaling with no narrow-screen overflow', async ({
  page,
}) => {
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto('http://127.0.0.1:10086');
    await expect(
      page.getByRole('button', { name: '重新检查连接' }),
    ).toBeVisible();
    await expect(page.getByText(/API已连接 · mysql/)).toBeVisible();
    const geometry = await page.locator('.page').evaluate((element) => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      background: getComputedStyle(element).backgroundColor,
      titleSize: getComputedStyle(element.querySelector('.title')!).fontSize,
      buttonColor: getComputedStyle(element.querySelector('button')!)
        .backgroundColor,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.background).toBe('rgb(247, 248, 244)');
    expect(geometry.buttonColor).toBe('rgb(23, 107, 75)');
    if (width === 393)
      expect(parseFloat(geometry.titleSize)).toBeCloseTo(28, 1);
    await page.screenshot({
      path: `docs/development/evidence/m2-h5-${width}.png`,
      fullPage: true,
    });
  }
});
