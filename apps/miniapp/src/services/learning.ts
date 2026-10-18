import Taro from '@tarojs/taro';
import type { ApiResult } from '../../../../packages/contracts/client';
import { guestApi } from './api';

export function operationKey(scope: string) {
  const name = `career.operation.v1.${scope}`;
  const stored: unknown = Taro.getStorageSync(name);
  if (typeof stored === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(stored))
    return stored;
  const key = `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  Taro.setStorageSync(name, key);
  return key;
}
export const clearOperation = (scope: string) =>
  Taro.removeStorageSync(`career.operation.v1.${scope}`);
export const learningUrl = (page: string, planId: string) =>
  `/pages/${page}/index?planId=${encodeURIComponent(planId)}`;
export async function startAttempt(planId: string) {
  const scope = `attempt-${planId}`;
  const created = await guestApi('createAssessmentAttempt', {
    body: { planId, idempotencyKey: operationKey(scope) },
  });
  const current = await guestApi('getAssessmentAttempt', {
    path: { attemptId: created.id },
  });
  clearOperation(scope);
  return current;
}
export async function openPlan(p: ApiResult<'getLearningPlan'>) {
  if (!p.available) throw new Error('任务已下架，历史记录仍保留。');
  if (p.latestAttemptId && p.latestAttemptStatus === 'draft')
    return Taro.navigateTo({
      url: `/pages/quiz/index?attemptId=${p.latestAttemptId}`,
    });
  if (p.selectedLevel)
    return Taro.navigateTo({ url: learningUrl('path', p.id) });
  const attempt = await startAttempt(p.id);
  return Taro.navigateTo({ url: `/pages/quiz/index?attemptId=${attempt.id}` });
}
export const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : '服务暂不可用，请重试；已有记录会保留。';
