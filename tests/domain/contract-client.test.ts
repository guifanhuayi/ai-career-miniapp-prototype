import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, createApiClient } from '../../packages/contracts/client';

test('M2-011 API-002: generated client calls documented route and returns typed success', async () => {
  const requests: unknown[] = [];
  const call = createApiClient(async (request) => {
    requests.push(request);
    return {
      status: 201,
      data: { visitorId: 'fixture', credential: 'test-only' },
    };
  });
  const session = await call('createVisitorSession', { body: {} });
  assert.equal(session.visitorId, 'fixture');
  assert.deepEqual(requests, [
    {
      path: '/api/v1/visitor-sessions',
      method: 'POST',
      successStatus: 201,
      body: {},
    },
  ]);
});
test('M2-012 API-002: generated client never treats an error response as a success', async () => {
  const call = createApiClient(async () => ({
    status: 401,
    data: { code: 'VISITOR_CREDENTIAL_REQUIRED', message: '凭据无效' },
  }));
  await assert.rejects(
    call('getCurrentVisitor', { credential: 'fixture' }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.message === '凭据无效',
  );
});
