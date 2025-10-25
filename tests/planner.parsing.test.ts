import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { planner, __setPlannerLlmForTests, __resetPlannerLlmForTests } from '../src/lib/agents/planner';
import { clearPlannerCache } from '../src/lib/agents/planner';

// Helper to build a fake state shape similar to SupervisorState usage
function makeStateWithMessages(messages: any[]) {
  return { messages: messages.map((m: any) => ({ message: m, role: 'user', timestamp: Date.now() })) } as any;
}

describe('planner parsing and fallback behavior', () => {
  afterEach(() => {
    __resetPlannerLlmForTests();
    clearPlannerCache();
  });

  it('handles well-formed JSON plan from LLM', async () => {
    const goodPlan = { action: 'delegate', targetAgent: 'catalog', task: 'search apples', confidence: 0.9, reasoning: 'clear intent' };
    const mock = { invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(goodPlan) }) };
    __setPlannerLlmForTests(mock as any);

    const state = makeStateWithMessages([ { content: 'Find apples' } ]);
    const res = await planner(state as any);
    expect(res).toBeDefined();
    expect(res.messages).toBeDefined();
    const recommendation = (res.messages[0] as any).planningRecommendation;
    expect(recommendation.targetAgent).toBe('catalog');
    expect(recommendation.confidence).toBeGreaterThan(0.8);
  });

  it('falls back to supervisor when LLM returns malformed JSON', async () => {
    const badText = "I think you should do this: action: delegate, targetAgent: catalog";
    const mock = { invoke: vi.fn().mockResolvedValue({ content: badText }) };
    __setPlannerLlmForTests(mock as any);

    const state = makeStateWithMessages([ { content: 'Find apples' } ]);
    const res = await planner(state as any);
    expect(res).toBeDefined();
    const recommendation = (res.messages[0] as any).planningRecommendation;
    expect(recommendation.targetAgent).toBe('supervisor');
    expect(typeof recommendation.reasoning).toBe('string');
  });

  it('normalizes invalid targetAgent to supervisor', async () => {
    const planWithBadAgent = { action: 'delegate', targetAgent: 'unknown_agent', task: 'do something', confidence: 0.6, reasoning: 'unknown agent' };
    const mock = { invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(planWithBadAgent) }) };
    __setPlannerLlmForTests(mock as any);

    const state = makeStateWithMessages([ { content: 'Whatever' } ]);
    const res = await planner(state as any);
    const recommendation = (res.messages[0] as any).planningRecommendation;
    // Since planner validation forces supervisor for unknown agents, expect supervisor
    expect(recommendation.targetAgent).toBe('supervisor');
  });
});
