import { describe, it, expect, vi, beforeEach } from 'vitest';
import detectContinuationIntent, { __clearContinuationDetectorCacheForTests } from '../src/lib/agents/continuationDetector';

describe('continuationDetector cache', () => {
  beforeEach(() => {
    __clearContinuationDetectorCacheForTests();
  });

  it('caches analysis results to avoid duplicate invokes', async () => {
    const fakeResponse = { content: '{"isContinuation":true,"continuationType":"deal_confirmation","targetAgent":"cart_and_checkout","confidence":0.95,"reasoning":"ok"}' };
    const mockLlm = { invoke: vi.fn().mockResolvedValue(fakeResponse) };

    const messages: any[] = [{ role: 'user', message: { content: 'Do it' } }];
    const r1 = await detectContinuationIntent('Yes', messages, 'awaiting_deal_confirmation', { pending: true }, { product: 'bananas', quantity: 1 }, mockLlm as any);
    const r2 = await detectContinuationIntent('Yes', messages, 'awaiting_deal_confirmation', { pending: true }, { product: 'bananas', quantity: 1 }, mockLlm as any);

    expect(r1.isContinuation).toBe(true);
    expect(r2.isContinuation).toBe(true);
    expect((mockLlm.invoke as any).mock.calls.length).toBe(1);
  });
});
