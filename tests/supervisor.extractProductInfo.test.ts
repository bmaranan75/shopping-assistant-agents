import { describe, test, expect, vi } from 'vitest';
import * as supervisor from '../src/lib/agents/supervisor';

describe('extractProductInfo', () => {
  test('returns parsed product when LLM returns valid JSON', async () => {
    // Mock llm.invoke to return a message-like object using test setter
    const fakeResponse = { content: JSON.stringify({ product: 'bananas', quantity: 2 }) };
    supervisor.__setLlmForTests({ invoke: vi.fn().mockResolvedValue(fakeResponse) } as any);

    const res = await supervisor.extractProductInfo('I want 2 bananas');
    expect(res).not.toBeNull();
    expect(res!.product).toBe('bananas');
    expect(res!.quantity).toBe(2);

    supervisor.__resetLlmForTests();
  });

  test('returns null when LLM returns non-json', async () => {
    const fakeResponse = { content: 'Sorry I cannot help' };
    supervisor.__setLlmForTests({ invoke: vi.fn().mockResolvedValue(fakeResponse) } as any);

    const res = await supervisor.extractProductInfo('I want something');
    expect(res).toBeNull();

    supervisor.__resetLlmForTests();
  });
});
