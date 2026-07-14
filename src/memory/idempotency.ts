export interface IdempotencyKeyInput {
  requestId?: string;
  userId: string;
  agentId?: string;
  runId?: string;
  actorId?: string;
  messages: readonly Record<string, unknown>[];
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildIdempotencyKey(input: IdempotencyKeyInput): Promise<string> {
  if (input.requestId !== undefined) {
    return input.requestId;
  }

  return sha256Hex(stableSerialize({
    user_id: input.userId,
    agent_id: input.agentId ?? null,
    run_id: input.runId ?? null,
    actor_id: input.actorId ?? null,
    messages: input.messages,
  }));
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item === undefined ? null : item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(',')}}`;
  }

  throw new TypeError(`Cannot serialize ${typeof value} in an idempotency key`);
}
