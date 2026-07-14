import type { ExistingMemoryForMerge, MemoryDecision } from './types';

export function buildFactExtractionPrompt(transcript: string): string {
  return [
    'Extract only durable user facts from this transcript.',
    'Ignore transient chatter, acknowledgements, requests, and assistant filler.',
    'Return JSON only, with this exact shape: {"facts":["string"]}.',
    'Transcript:',
    transcript,
  ].join('\n');
}

export function buildMemoryMergePrompt(
  newFacts: readonly string[],
  existing: readonly ExistingMemoryForMerge[],
): string {
  return [
    'Merge new durable facts with existing memories.',
    'Return JSON only as {"decisions":[...]}.',
    'For a new fact use {"action":"ADD","memory":"string"}.',
    'To replace an existing memory use {"action":"UPDATE","id":"string","memory":"string"}.',
    'To remove an invalidated memory use {"action":"DELETE","id":"string"}.',
    'When no change is needed use {"action":"NONE"}.',
    `{"new_facts":${JSON.stringify(newFacts)},"existing_memories":${JSON.stringify(existing)}}`,
  ].join('\n');
}

export function validateDecision(decision: unknown): MemoryDecision {
  if (!isRecord(decision) || typeof decision.action !== 'string') {
    throw new Error('Decision requires an action');
  }

  switch (decision.action) {
    case 'ADD':
      requireNonblankMemory(decision, 'ADD');
      return { action: 'ADD', memory: decision.memory as string };
    case 'UPDATE':
      requireId(decision, 'UPDATE');
      requireNonblankMemory(decision, 'UPDATE');
      return { action: 'UPDATE', id: decision.id as string, memory: decision.memory as string };
    case 'DELETE':
      requireId(decision, 'DELETE');
      return { action: 'DELETE', id: decision.id as string };
    case 'NONE':
      return {
        action: 'NONE',
        ...(typeof decision.id === 'string' ? { id: decision.id } : {}),
        ...(typeof decision.memory === 'string' ? { memory: decision.memory } : {}),
      };
    default:
      throw new Error(`Unsupported memory decision action: ${decision.action}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireId(decision: Record<string, unknown>, action: string): void {
  if (typeof decision.id !== 'string' || decision.id.trim() === '') {
    throw new Error(`${action} decision requires an id`);
  }
}

function requireNonblankMemory(decision: Record<string, unknown>, action: string): void {
  if (typeof decision.memory !== 'string' || decision.memory.trim() === '') {
    throw new Error(`${action} decision requires a nonblank memory`);
  }
}
