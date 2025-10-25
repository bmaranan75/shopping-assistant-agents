import { vi, describe, test, expect } from 'vitest';

// Mock ChatOpenAI to prevent real API usage during import
vi.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: class ChatOpenAI {
      constructor(_opts: any) {}
      async invoke(_msgs: any) {
        return { content: JSON.stringify({ isContinuation: false, continuationType: 'general', targetAgent: 'catalog', confidence: 0.1 }) };
      }
    }
  };
});

import { annotateMessage, buildAgentContextMessage } from '../src/lib/agents/supervisor';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

describe('Supervisor annotated messages and context builder', () => {
  test('annotateMessage wraps messages with role and timestamp', () => {
    const hm = new HumanMessage('Hello');
    const annotated = annotateMessage(hm, 'user', undefined, 'test-sender');

    expect(annotated).toHaveProperty('message');
    expect(annotated).toHaveProperty('role', 'user');
    expect(annotated).toHaveProperty('senderId', 'test-sender');
    expect(typeof annotated.timestamp).toBe('number');
    expect(annotated.message).toBe(hm);
  });

  test('buildAgentContextMessage includes only user/system and same-agent assistant messages', () => {
    const msgs = [
      annotateMessage(new SystemMessage('system note'), 'system'),
      annotateMessage(new HumanMessage('I want bananas'), 'user'),
      annotateMessage(new AIMessage('catalog reply 1'), 'assistant', 'catalog'),
      annotateMessage(new AIMessage('deals reply'), 'assistant', 'deals'),
      annotateMessage(new AIMessage('catalog reply 2'), 'assistant', 'catalog'),
      annotateMessage(new HumanMessage('Latest user message'), 'user')
    ];

    const ctxForCatalog = buildAgentContextMessage(msgs, 'catalog', 'Latest user message');
    // Should include system, both user messages, and only catalog assistant replies (2 entries)
    expect(ctxForCatalog).toMatch(/SYSTEM: system note/);
    expect(ctxForCatalog).toMatch(/USER: I want bananas/);
    expect(ctxForCatalog).toMatch(/CATALOG: catalog reply 1/);
    expect(ctxForCatalog).toMatch(/CATALOG: catalog reply 2/);
    expect(ctxForCatalog).not.toMatch(/DEALS: deals reply/);

    const ctxForDeals = buildAgentContextMessage(msgs, 'deals', 'Latest user message');
    expect(ctxForDeals).toMatch(/DEALS: deals reply/);
    expect(ctxForDeals).not.toMatch(/CATALOG: catalog reply 1/);
  });
});
