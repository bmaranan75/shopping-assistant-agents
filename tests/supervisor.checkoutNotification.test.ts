import { describe, test, expect, vi } from 'vitest';
import * as supervisor from '../src/lib/agents/supervisor';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

describe('cartAndCheckoutNode structured checkout', () => {
  test('routes to notification_agent when cart agent returns structured success', async () => {
    const annotatedUser = supervisor.annotateMessage(new HumanMessage('[userId:user123] Please checkout'), 'user');
    const state: any = {
      messages: [annotatedUser],
      userId: 'user123',
      conversationId: 'conv-test-1',
      cartData: { items: [{ productCode: 'apple', qty: 2 }], total: 5.0 },
      workflowContext: 'process_checkout'
    };

    // Mock supervisor.callLangGraphAgent to simulate structured success response
    // @ts-ignore - use test setter to override implementation
    supervisor.__setCallLangGraphAgentForTests(vi.fn().mockResolvedValue({
      messages: [new AIMessage(JSON.stringify({ checkoutStatus: 'success', orderId: 'ORD-1', summary: 'Order placed', items: [{ productCode: 'apple', qty: 2 }], total: 5.0 }))],
      content: JSON.stringify({ checkoutStatus: 'success', orderId: 'ORD-1', summary: 'Order placed', items: [{ productCode: 'apple', qty: 2 }], total: 5.0 })
    }));

    const res = await supervisor.cartAndCheckoutNode(state as any);
    expect(res.next).toBe('notification_agent');
    expect(res.notificationData).toBeDefined();
    expect(res.notificationData.orderId).toBe('ORD-1');
    // reset
    supervisor.__resetCallLangGraphAgentForTests();
  });
});
