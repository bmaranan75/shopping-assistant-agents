import { describe, it, expect, vi, beforeEach } from 'vitest';
import extractProductInfo, { __clearProductExtractorCacheForTests } from '../src/lib/agents/productExtractor';

describe('productExtractor cache', () => {
  beforeEach(() => {
    __clearProductExtractorCacheForTests();
  });

  it('caches LLM responses to avoid duplicate invokes', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue({ content: '{"product":"bananas","quantity":3}' }) };
    const res1 = await extractProductInfo('Please add 3 bananas to my cart', mockLlm as any);
    const res2 = await extractProductInfo('Please add 3 bananas to my cart', mockLlm as any);

    expect(res1).toEqual({ product: 'bananas', quantity: 3 });
    expect(res2).toEqual({ product: 'bananas', quantity: 3 });
    // ensure invoke only called once due to cache
    expect((mockLlm.invoke as any).mock.calls.length).toBe(1);
  });
});
