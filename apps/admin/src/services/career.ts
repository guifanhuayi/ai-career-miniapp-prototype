import { createApiClient } from '../../../../packages/contracts/client';

export const careerApi = createApiClient(async (request) => {
  const response = await fetch(request.path, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      ...(request.admin ? { 'X-Admin-Local': '1' } : {}),
    },
    ...(request.body === undefined
      ? {}
      : { body: JSON.stringify(request.body) }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, data: await response.json() };
});
