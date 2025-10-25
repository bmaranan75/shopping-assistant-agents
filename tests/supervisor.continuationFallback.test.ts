import { describe, test, expect, vi } from 'vitest';
import * as supervisor from '../src/lib/agents/supervisor';
import { MIN_CONTINUATION_CONFIDENCE } from '../src/lib/agents/constants';

describe('detectContinuationIntent fallback', () => {
  test('fallback to affirmative detection when LLM errors', async () => {
    // Force llm.invoke to throw using the test setter
    supervisor.__setLlmForTests({ invoke: vi.fn().mockRejectedValue(new Error('llm error')) } as any);

    const res = await supervisor.detectContinuationIntent('yes', [], 'awaiting_deal_confirmation', { some: 'deal' }, { product: 'bananas', quantity: 1 });
    expect(res.isContinuation).toBe(true);
    expect(res.continuationType).toBe('deal_confirmation');
    expect(res.targetAgent).toBe('cart_and_checkout');
  expect(res.confidence).toBeGreaterThan(MIN_CONTINUATION_CONFIDENCE);

    supervisor.__resetLlmForTests();
  });
});
