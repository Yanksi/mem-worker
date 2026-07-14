import { describe, expect, it } from 'vitest';
import {
  buildFactExtractionPrompt,
  buildMemoryMergePrompt,
  validateDecision,
} from '../src/memory/extraction';
import { AddMemoryRequestSchema, type ExistingMemoryForMerge } from '../src/memory/types';

describe('AddMemoryRequestSchema', () => {
  it('rejects a whitespace-only request_id', () => {
    expect(() => AddMemoryRequestSchema.parse({
      request_id: '   ',
      user_id: 'user-1',
      messages: [{ role: 'user', content: 'Remember this.' }],
    })).toThrow();
  });
});

describe('buildFactExtractionPrompt', () => {
  it('instructs the model to return JSON-only durable facts and includes the transcript', () => {
    const transcript = 'user: I live in Zurich.\nassistant: Nice!';

    const prompt = buildFactExtractionPrompt(transcript);

    expect(prompt).toContain('durable');
    expect(prompt).toContain('transient');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain(transcript);
  });
});

describe('buildMemoryMergePrompt', () => {
  it('defines ADD, UPDATE, DELETE, and NONE decisions with serialized inputs', () => {
    const newFacts = ['User lives in Zurich.'];
    const existing: ExistingMemoryForMerge[] = [{ id: 'mem-1', memory: 'User lives in Bern.' }];

    const prompt = buildMemoryMergePrompt(newFacts, existing);

    expect(prompt).toContain('ADD');
    expect(prompt).toContain('UPDATE');
    expect(prompt).toContain('DELETE');
    expect(prompt).toContain('NONE');
    expect(prompt).toContain('"new_facts":["User lives in Zurich."]');
    expect(prompt).toContain('"existing_memories":[{"id":"mem-1","memory":"User lives in Bern."}]');
  });
});

describe('validateDecision', () => {
  it.each([
    [{ action: 'ADD', memory: '   ' }, 'ADD decision requires a nonblank memory'],
    [{ action: 'UPDATE', id: 'mem-1', memory: '' }, 'UPDATE decision requires a nonblank memory'],
    [{ action: 'UPDATE', memory: 'Updated memory' }, 'UPDATE decision requires an id'],
    [{ action: 'DELETE' }, 'DELETE decision requires an id'],
  ] as const)('rejects invalid decisions: %#', (decision, message) => {
    expect(() => validateDecision(decision)).toThrow(message);
  });

  it('returns valid ADD, UPDATE, DELETE, and NONE decisions unchanged', () => {
    expect(validateDecision({ action: 'ADD', memory: 'User likes tea.' })).toEqual({
      action: 'ADD',
      memory: 'User likes tea.',
    });
    expect(validateDecision({ action: 'UPDATE', id: 'mem-1', memory: 'User prefers tea.' })).toEqual({
      action: 'UPDATE',
      id: 'mem-1',
      memory: 'User prefers tea.',
    });
    expect(validateDecision({ action: 'DELETE', id: 'mem-1' })).toEqual({ action: 'DELETE', id: 'mem-1' });
    expect(validateDecision({ action: 'NONE' })).toEqual({ action: 'NONE' });
  });
});
