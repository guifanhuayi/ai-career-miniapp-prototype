import Taro from '@tarojs/taro';
import type { ApiBody } from '../../../../packages/contracts/client';
import { track } from './analytics';
import { guestApi } from './api';

export type InputFields = Omit<
  ApiBody<'createJobDescription'>,
  'idempotencyKey'
>;
export interface JdDraft {
  title: string;
  text: string;
  source: InputFields['source'];
  uploadId?: string;
  ocrId?: string;
}
export const activeAnalysisKey = 'career.jd.activeAnalysis.v1';
const submissionKey = 'career.jd.submission.v1';
const latestKey = 'career.jd.latestRequest.v1';
export const clientId = () =>
  `jd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
export function readDraft(mode: 'text' | 'image'): JdDraft {
  return parseDraft(Taro.getStorageSync(`career.jd.${mode}.v1`), mode);
}
function parseDraft(item: unknown, mode: 'text' | 'image'): JdDraft {
  if (!item || typeof item !== 'object')
    return {
      title: '',
      text: '',
      source: mode === 'text' ? 'text' : 'image-manual',
    };
  const draft = item as Record<string, unknown>;
  return {
    title: typeof draft.title === 'string' ? draft.title : '',
    text: typeof draft.text === 'string' ? draft.text : '',
    source:
      mode === 'text'
        ? draft.source === 'example'
          ? 'example'
          : 'text'
        : draft.source === 'fixture-confirmed'
          ? 'fixture-confirmed'
          : 'image-manual',
    ...(typeof draft.uploadId === 'string' ? { uploadId: draft.uploadId } : {}),
    ...(typeof draft.ocrId === 'string' ? { ocrId: draft.ocrId } : {}),
  };
}
export function saveDraft(mode: 'text' | 'image', draft: JdDraft) {
  Taro.setStorageSync(`career.jd.${mode}.v1`, draft);
  Taro.removeStorageSync(latestKey);
}
export function readReviewDraft(ocrId: string): JdDraft | undefined {
  const item: unknown = Taro.getStorageSync(`career.jd.review.${ocrId}`);
  return item && typeof item === 'object'
    ? parseDraft(item, 'image')
    : undefined;
}
export function saveReviewDraft(ocrId: string, draft: JdDraft) {
  Taro.setStorageSync(`career.jd.review.${ocrId}`, draft);
  if (readDraft('image').ocrId === ocrId) saveDraft('image', draft);
}
export async function submitConfirmed(input: InputFields) {
  const signature = JSON.stringify(input);
  const prior: unknown = Taro.getStorageSync(submissionKey);
  const saved =
    prior && typeof prior === 'object'
      ? (prior as Record<string, unknown>)
      : {};
  const request =
    saved.signature === signature &&
    typeof saved.inputKey === 'string' &&
    typeof saved.analysisKey === 'string' &&
    typeof saved.flowId === 'string'
      ? {
          signature,
          inputKey: saved.inputKey,
          analysisKey: saved.analysisKey,
          flowId: saved.flowId,
          occurredAt:
            typeof saved.occurredAt === 'string'
              ? saved.occurredAt
              : new Date().toISOString(),
        }
      : {
          signature,
          inputKey: clientId(),
          analysisKey: clientId(),
          flowId: clientId(),
          occurredAt: new Date().toISOString(),
        };
  Taro.setStorageSync(submissionKey, request);
  Taro.setStorageSync(latestKey, signature);
  const confirmed = await guestApi('createJobDescription', {
    body: { ...input, idempotencyKey: request.inputKey },
  });
  const analysis = await guestApi('createAnalysisJob', {
    body: {
      jobDescriptionId: confirmed.id,
      flowId: request.flowId,
      idempotencyKey: request.analysisKey,
    },
  });
  const current = Taro.getStorageSync(latestKey) === signature;
  track('jd_submit', {
    analysisJobId: analysis.id,
    eventId: `submit-${analysis.id}`,
    occurredAt: request.occurredAt,
  });
  if (input.uploadId)
    track('ocr_result_confirmed', {
      analysisJobId: analysis.id,
      eventId: `ocr-${analysis.id}`,
      occurredAt: request.occurredAt,
    });
  if (current) Taro.setStorageSync(activeAnalysisKey, analysis.id);
  return { analysis, current };
}
export const failureText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : '操作失败，已有文字和图片不会被自动清空';
