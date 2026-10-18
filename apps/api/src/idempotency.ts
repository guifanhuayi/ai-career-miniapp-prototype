import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

export function jsonSnapshot<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export async function idempotent<T>(
  db: PrismaClient,
  scope: string,
  actor: string,
  key: string,
  payload: unknown,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(canonical(payload)))
    .digest('hex');
  const where = { scope_actor_key: { scope, actor, key } };
  const recover = async () => {
    const record = await db.idempotencyRecord.findUnique({ where });
    if (!record) return undefined;
    if (record.payloadHash !== payloadHash)
      throw new ConflictException('同一幂等键不能用于不同内容');
    return record.response as T;
  };
  const previous = await recover();
  if (previous !== undefined) return previous;
  try {
    return await db.$transaction(
      async (tx) => {
        const response = await work(tx);
        await tx.idempotencyRecord.create({
          data: {
            scope,
            actor,
            key,
            payloadHash,
            response: jsonSnapshot(response),
          },
        });
        return response;
      },
      { timeout: 15000 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    ) {
      const existing = await recover();
      if (existing !== undefined) return existing;
      throw new ConflictException('内容已被其他操作更新，请刷新后重试');
    }
    throw error;
  }
}
