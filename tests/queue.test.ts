import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env, MemoryJob } from '../src/env';

const service = vi.hoisted(() => {
  class TransientMemoryJobError extends Error {}
  return {
    processMemoryJob: vi.fn(),
    TransientMemoryJobError,
  };
});

vi.mock('../src/memory/service', () => service);

import { handleMemoryQueue } from '../src/queue';
import worker from '../src/index';

const env = {} as Env;
const validJob: MemoryJob = {
  type: 'extract-and-store',
  requestId: 'request-123',
  body: {
    request_id: 'request-123',
    user_id: 'user-123',
    messages: [{ role: 'user', content: 'Remember this.' }],
  },
};

function message(body: unknown) {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

function batch(...messages: ReturnType<typeof message>[]): MessageBatch<MemoryJob> {
  return { messages } as unknown as MessageBatch<MemoryJob>;
}

describe('handleMemoryQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.processMemoryJob.mockReset();
  });

  it('acknowledges a successfully processed job', async () => {
    const job = message(validJob);

    await handleMemoryQueue(batch(job), env);

    expect(service.processMemoryJob).toHaveBeenCalledWith(env, validJob);
    expect(job.ack).toHaveBeenCalledOnce();
    expect(job.retry).not.toHaveBeenCalled();
  });

  it('acknowledges malformed jobs without processing them', async () => {
    const job = message({ type: 'extract-and-store', requestId: '', body: {} });

    await handleMemoryQueue(batch(job), env);

    expect(service.processMemoryJob).not.toHaveBeenCalled();
    expect(job.ack).toHaveBeenCalledOnce();
    expect(job.retry).not.toHaveBeenCalled();
  });

  it('retries transient processing failures without acknowledging the message', async () => {
    const job = message(validJob);
    service.processMemoryJob.mockRejectedValue(new service.TransientMemoryJobError('D1 unavailable'));

    await handleMemoryQueue(batch(job), env);

    expect(job.retry).toHaveBeenCalledOnce();
    expect(job.ack).not.toHaveBeenCalled();
  });

  it('retries an inflight processing lease without acknowledging the message', async () => {
    const job = message(validJob);
    service.processMemoryJob.mockResolvedValue('inflight');

    await handleMemoryQueue(batch(job), env);

    expect(job.retry).toHaveBeenCalledOnce();
    expect(job.ack).not.toHaveBeenCalled();
  });

  it('handles each message independently', async () => {
    const successful = message(validJob);
    const transient = message({ ...validJob, requestId: 'request-456' });
    const invalid = message({ type: 'wrong-type', requestId: 'request-789', body: validJob.body });
    service.processMemoryJob
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new service.TransientMemoryJobError('embedding unavailable'));

    await handleMemoryQueue(batch(successful, transient, invalid), env);

    expect(successful.ack).toHaveBeenCalledOnce();
    expect(successful.retry).not.toHaveBeenCalled();
    expect(transient.retry).toHaveBeenCalledOnce();
    expect(transient.ack).not.toHaveBeenCalled();
    expect(invalid.ack).toHaveBeenCalledOnce();
    expect(invalid.retry).not.toHaveBeenCalled();
  });

  it('delegates the default worker queue handler to the queue processor', async () => {
    const job = message(validJob);

    await worker.queue?.(batch(job), env);

    expect(service.processMemoryJob).toHaveBeenCalledWith(env, validJob);
    expect(job.ack).toHaveBeenCalledOnce();
  });
});
