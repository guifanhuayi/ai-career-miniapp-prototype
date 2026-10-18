import Taro from '@tarojs/taro';
import {
  type ApiResult,
  createApiClient,
} from '../../../../packages/contracts/client';

declare const API_BASE_URL: string;
const credentialKey = 'career.visitor.credential.v1';
export const api = createApiClient(async (request) => {
  const response = await Taro.request<unknown>({
    url: API_BASE_URL + request.path,
    method: request.method,
    data: request.body,
    timeout: 10000,
    header: {
      'Content-Type': 'application/json',
      'X-Request-Id': `mini-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
      'X-Retry-Count': '0',
      ...(request.credential
        ? { Authorization: `Bearer ${request.credential}` }
        : {}),
    },
  });
  return { status: response.statusCode, data: response.data };
});
let pendingVisitor: Promise<ApiResult<'getCurrentVisitor'>> | undefined;
export async function ensureVisitor(): Promise<ApiResult<'getCurrentVisitor'>> {
  if (pendingVisitor) return pendingVisitor;
  pendingVisitor = (async () => {
    const stored: unknown = Taro.getStorageSync(credentialKey);
    if (typeof stored === 'string' && /^[a-f0-9]{64}$/.test(stored))
      return api('getCurrentVisitor', { credential: stored });
    const session = await api('createVisitorSession', { body: {} });
    Taro.setStorageSync(credentialKey, session.credential);
    const { credential: _secret, ...visitor } = session;
    return visitor;
  })();
  try {
    return await pendingVisitor;
  } finally {
    pendingVisitor = undefined;
  }
}
