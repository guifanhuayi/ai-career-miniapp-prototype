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

test('M3-C01 API-002: generated path/query encode Unicode and separators without injecting extra parameters', async () => {
  const requests: string[] = [];
  const call = createApiClient(async (request) => {
    requests.push(request.path);
    return { status: 200, data: { items: [] } };
  });
  await call('listScenes', {
    query: { search: '简历&status=archived', category: '求职准备' },
  });
  const url = new URL(requests[0]!, 'http://127.0.0.1');
  assert.equal(url.searchParams.get('search'), '简历&status=archived');
  assert.equal(url.searchParams.has('status'), false);
  await call('getScene', { path: { sceneId: 'a/b?x=1' } });
  assert.equal(requests[1], '/api/v1/scenes/a%2Fb%3Fx%3D1');
});

test('M3-C02 API-002: missing resource path fails before any network or mutation', async () => {
  let requests = 0;
  const call = createApiClient(async () => {
    requests++;
    return { status: 200, data: {} };
  });
  await assert.rejects(call('getScene'), /Missing API path parameter/);
  assert.equal(requests, 0);
});
