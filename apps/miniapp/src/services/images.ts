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
  packaged = false,
): Promise<ApiResult<'createPrivateUpload'>> {
  let temporary: string | undefined;
  const fs = Taro.getFileSystemManager();
  try {
    if (packaged) {
      const userDataPath = Taro.env.USER_DATA_PATH;
      if (!userDataPath) throw new Error('当前环境无法读取本地示例图片');
      const file = await new Promise<ArrayBuffer>((resolve, reject) =>
        fs.readFile({
          filePath: path,
          success: (result) =>
            typeof result.data === 'string'
              ? reject(new Error('示例图片读取失败'))
              : resolve(result.data),
          fail: reject,
        }),
      );
      const temporaryPath = `${userDataPath}/career-example-${Date.now()}.png`;
      temporary = temporaryPath;
      await new Promise<void>((resolve, reject) =>
        fs.writeFile({
          filePath: temporaryPath,
          data: file,
          success: () => resolve(),
          fail: reject,
        }),
      );
      path = temporary;
    }
    const response = await Taro.uploadFile({
      url: apiOrigin + routes.createPrivateUpload.path,
      filePath: path,
      name: 'file',
      formData: { idempotencyKey },
      header: { Authorization: `Bearer ${await getCredential()}` },
      timeout: 15000,
    });
    const data: unknown = JSON.parse(response.data);
    if (response.statusCode !== 201)
      throw new ApiError(response.statusCode, data);
    return data as ApiResult<'createPrivateUpload'>;
  } finally {
    if (temporary) {
      const cleanupPath = temporary;
      await new Promise<void>((resolve) =>
        fs.unlink({ filePath: cleanupPath, complete: () => resolve() }),
      );
    }
  }
}
export async function imagePreview(uploadId: string) {
  const metadata = await guestApi('getPrivateUpload', { path: { uploadId } });
  const response = await Taro.downloadFile({
    url: apiOrigin + metadata.contentPath,
    header: { Authorization: `Bearer ${await getCredential()}` },
    timeout: 10000,
  });
  if (response.statusCode !== 200)
    throw new Error('图片不可用或已过期，文字草稿仍保留');
  const downloaded = response.tempFilePath;
  return {
    url: downloaded,
    dispose: () => {
      Taro.getFileSystemManager().unlink({
        filePath: downloaded,
        fail: () => undefined,
      });
    },
  };
}
