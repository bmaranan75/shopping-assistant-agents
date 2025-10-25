import { describe, it, expect, beforeAll } from 'vitest';

// Ensure an OPENAI_API_KEY is present before importing the supervisor module which
// initializes ChatOpenAI at module load time. Use a placeholder to allow unit tests
// that don't actually call the network to run quickly.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-for-unit-tests';

let annotateMessage: any;
let buildAgentContextMessage: any;
let HumanMessage: any;
let SystemMessage: any;
let AIMessage: any;

beforeAll(async () => {
  const mod = await import('../src/lib/agents/supervisor');
  annotateMessage = mod.annotateMessage;
  buildAgentContextMessage = mod.buildAgentContextMessage;
  const msgs = await import('@langchain/core/messages');
  HumanMessage = msgs.HumanMessage;
  SystemMessage = msgs.SystemMessage;
  AIMessage = msgs.AIMessage;
});

describe('buildAgentContextMessage deduplication and USER_LATEST behavior', () => {
  it('dedupes duplicate user messages and appends USER_LATEST only when missing', () => {
    const msgs = [] as any[];
    msgs.push(annotateMessage(new HumanMessage('show me product catalog'), 'user'));
    msgs.push(annotateMessage(new HumanMessage('show me product catalog'), 'user'));
    msgs.push(annotateMessage(new AIMessage('Here is the catalog'), 'assistant', 'catalog'));
    msgs.push(annotateMessage(new SystemMessage('system note'), 'system'));

    const ctx = buildAgentContextMessage(msgs, 'catalog', 'show me product catalog', 6);
    // Should contain only one "USER:" line and one "USER_LATEST:" line
  const userLines = ctx.split('\n\n').filter((l: string) => l.startsWith('USER:'));
  const latestLines = ctx.split('\n\n').filter((l: string) => l.startsWith('USER_LATEST:'));

    expect(userLines.length).toBe(1);
    expect(latestLines.length).toBe(0); // Because last user message already present as USER line, latest not added
  });

  it('adds USER_LATEST when current message is new', () => {
    const msgs = [] as any[];
    msgs.push(annotateMessage(new HumanMessage('i want bananas'), 'user'));
    msgs.push(annotateMessage(new AIMessage('found bananas'), 'assistant', 'catalog'));

    const ctx = buildAgentContextMessage(msgs, 'catalog', 'show me product catalog', 6);
  const latestLines = ctx.split('\n\n').filter((l: string) => l.startsWith('USER_LATEST:'));
    expect(latestLines.length).toBe(1);
    expect(latestLines[0]).toContain('show me product catalog');
  });
});
