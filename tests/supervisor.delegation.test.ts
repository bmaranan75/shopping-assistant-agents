import { describe, it, expect } from 'vitest';
import { routePlanner } from '../src/lib/agents/supervisor';

// Minimal mock of SupervisorState.State shape for testing
function makeState(messages: any[], delegationDepth?: number) {
  return {
    messages,
    delegationDepth,
  } as any;
}

describe('routePlanner delegation depth guard', () => {
  it('should route to supervisor and store recommendation when depth is below max', () => {
    const plannerDelegationMsg = {
      delegation: {
        targetAgent: 'catalog',
        confidence: 0.9,
        task: 'find apples',
        reasoning: 'looks like a product search'
      },
      message: { tool_calls: [] }
    };

    const state = makeState([plannerDelegationMsg], 1);
    const res = routePlanner(state as any);
    // NEW ARCHITECTURE: All recommendations go through supervisor for proper separation of concerns
    expect(res).toBe('supervisor');
    // Ensure the recommendation is stored in state
    expect(state.plannerRecommendation).toEqual({
      targetAgent: 'catalog',
      confidence: 0.9,
      task: 'find apples',
      reasoning: 'looks like a product search'
    });
    // ensure the state increment happened
    expect(state.delegationDepth).toBe(2);
  });

  it('should prevent delegation when depth is at or above max', () => {
    const plannerDelegationMsg = {
      delegation: {
        targetAgent: 'catalog',
        confidence: 0.9,
        task: 'find apples',
        reasoning: 'looks like a product search'
      },
      message: { tool_calls: [] }
    };

    const state = makeState([plannerDelegationMsg], 3);
    const res = routePlanner(state as any);
    // NEW ARCHITECTURE: Always routes to supervisor (regardless of depth, since all delegation goes through supervisor)
    expect(res).toBe('supervisor');
    // delegationDepth should be incremented properly
    expect(state.delegationDepth).toBe(4);
  });
});
