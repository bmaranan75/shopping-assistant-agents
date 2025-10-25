import { describe, test, expect } from 'vitest';
import { safeParseJson } from '../src/lib/agents/supervisor';

describe('safeParseJson', () => {
  test('parses valid JSON string', () => {
    const input = '{"a":1}';
    const res = safeParseJson<{ a: number }>(input);
    expect(res).not.toBeNull();
    expect(res!.a).toBe(1);
  });

  test('extracts first JSON object from extra text', () => {
    const input = 'Note: here is the data: {"product":"bananas","quantity":3} Thanks!';
    const res = safeParseJson<{ product: string; quantity: number }>(input);
    expect(res).not.toBeNull();
    expect(res!.product).toBe('bananas');
    expect(res!.quantity).toBe(3);
  });

  test('returns null for non-JSON text', () => {
    const input = 'no json here';
    const res = safeParseJson(input);
    expect(res).toBeNull();
  });
});
