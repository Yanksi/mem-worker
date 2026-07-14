import type { Env, MemoryJob } from './env';
import { processMemoryJob, TransientMemoryJobError } from './memory/service';
import { AddMemoryRequestSchema } from './memory/types';

function isMemoryJob(value: unknown): value is MemoryJob {
  if (typeof value !== 'object' || value === null) return false;
  const job = value as Partial<MemoryJob>;
  return job.type === 'extract-and-store'
    && typeof job.requestId === 'string'
    && job.requestId.trim().length > 0
    && AddMemoryRequestSchema.safeParse(job.body).success;
}

export async function handleMemoryQueue(batch: MessageBatch<MemoryJob>, env: Env): Promise<void> {
  await Promise.all(batch.messages.map(async (message) => {
    if (!isMemoryJob(message.body)) {
      message.ack();
      return;
    }

    try {
      const result = await processMemoryJob(env, message.body);
      if (result === 'inflight') {
        message.retry();
        return;
      }
      message.ack();
    } catch (error) {
      if (error instanceof TransientMemoryJobError) {
        message.retry();
        return;
      }
      message.ack();
    }
  }));
}
