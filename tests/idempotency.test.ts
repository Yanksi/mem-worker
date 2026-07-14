import { describe, expect, it } from 'vitest';
import { buildIdempotencyKey, sha256Hex } from '../src/memory/idempotency';

describe('sha256Hex', () => {
  it('returns a SHA-256 hexadecimal digest using Web Crypto', async () => {
    await expect(sha256Hex('hello')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

describe('buildIdempotencyKey', () => {
  const baseRequest = {
    userId: 'user-1',
    messages: [
      { role: 'user', content: 'Remember this.', metadata: { source: 'chat', tags: ['important'] } },
      { role: 'assistant', content: 'I will.' },
    ],
  };

  it('uses the explicit request ID when provided', async () => {
    await expect(buildIdempotencyKey({ ...baseRequest, requestId: 'request-123' })).resolves.toBe('request-123');
  });

  it('is deterministic despite object key ordering while preserving message array ordering', async () => {
    const first = await buildIdempotencyKey(baseRequest);
    const reorderedKeys = await buildIdempotencyKey({
      messages: [
        { metadata: { tags: ['important'], source: 'chat' }, content: 'Remember this.', role: 'user' },
        { content: 'I will.', role: 'assistant' },
      ],
      userId: 'user-1',
    });
    const reorderedMessages = await buildIdempotencyKey({
      ...baseRequest,
      messages: [...baseRequest.messages].reverse(),
    });

    expect(reorderedKeys).toBe(first);
    expect(reorderedMessages).not.toBe(first);
  });

  it.each([
    [{ userId: 'user-2' }, 'tenant'],
    [{ agentId: 'agent-2' }, 'agent'],
    [{ runId: 'run-2' }, 'run'],
    [{ actorId: 'actor-2' }, 'actor'],
  ])('changes when the %s identity field changes', async (changes, _field) => {
    const original = await buildIdempotencyKey({ ...baseRequest, agentId: 'agent-1', runId: 'run-1' });
    const changed = await buildIdempotencyKey({
      ...baseRequest,
      agentId: 'agent-1',
      runId: 'run-1',
      ...changes,
    });

    expect(changed).not.toBe(original);
  });
});
