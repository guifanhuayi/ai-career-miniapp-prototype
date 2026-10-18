import Taro from '@tarojs/taro';
import {
  ApiError,
  type ApiResult,
  routes,
} from '../../../../packages/contracts/client';
import { apiOrigin, getCredential, guestApi } from './api';

export async function chooseImage() {
  try {
    const result = await Taro.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album'],
    });
    const file = result.tempFiles[0];
    const path = result.tempFilePaths[0];
    if (!file || !path)
      throw new Error('没有可读取的有效图片，原有效图片仍保留');
    return { path, size: file.size };
  } catch (error) {
    if (/cancel/i.test(String((error as { errMsg?: string })?.errMsg ?? error)))
      return undefined;
    throw error;
  }
}
export async function uploadImage(
  path: string,
  idempotencyKey: string,
  _packaged = false,
): Promise<ApiResult<'createPrivateUpload'>> {
  const local = new URL(path, location.href);
  if (
    local.origin !== location.origin ||
    !['http:', 'https:', 'blob:'].includes(local.protocol)
  )
    throw new Error('图片来源无效，请重新选择');
  const file = await (await fetch(local)).blob();
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error('请选择不超过10MiB的非空图片');
  const form = new FormData();
  form.set('file', file, 'screenshot');
  form.set('idempotencyKey', idempotencyKey);
  const response = await fetch(apiOrigin + routes.createPrivateUpload.path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getCredential()}` },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (response.status !== 201) throw new ApiError(response.status, data);
  return data;
}
export async function imagePreview(uploadId: string) {
  const metadata = await guestApi('getPrivateUpload', { path: { uploadId } });
  const response = await fetch(apiOrigin + metadata.contentPath, {
    headers: { Authorization: `Bearer ${await getCredential()}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new ApiError(response.status, await response.json());
  const url = URL.createObjectURL(await response.blob());
  return { url, dispose: () => URL.revokeObjectURL(url) };
}
