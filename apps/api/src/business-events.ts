import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

// Server success events are written only inside the successful business transaction.
// Serialize session selection per visitor; no client-supplied environment/session authority.
export async function recordServerEvent(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    visitorId: string;
    environment: string;
    name: string;
    flowId: string;
    taskId?: string;
    courseId?: string;
  },
) {
  await tx.$queryRaw`SELECT id FROM Visitor WHERE id = ${input.visitorId} FOR UPDATE`;
  const now = new Date();
  const previous = await tx.behaviorEvent.findFirst({
    where: { visitorId: input.visitorId },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
  });
  const sessionId =
    previous && now.getTime() - previous.receivedAt.getTime() <= 30 * 60_000
      ? previous.sessionId
      : randomUUID();
  await tx.behaviorEvent.create({
    data: {
      ...input,
      source: 'server',
      sessionId,
      occurredAt: now,
      receivedAt: now,
      effectiveAt: now,
    },
  });
}
