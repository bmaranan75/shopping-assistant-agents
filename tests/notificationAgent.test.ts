import { describe, test, expect, vi } from 'vitest';
import * as supervisor from '../src/lib/agents/supervisor';
import { AIMessage } from '@langchain/core/messages';

describe('notificationAgent', () => {
  test('sends pushover and clears notificationData on success', async () => {
    const state: any = {
      userId: 'user123',
      conversationId: 'conv-123',
      notificationData: { summary: 'Order placed', orderId: 'ORD-1', cartData: { items: [] } }
    };

  // Mock sendPushoverNotification using the exported test setter
  supervisor.__setSendPushoverNotificationForTests(vi.fn().mockResolvedValue({ ok: true, result: { status: 1 } }));

    const res = await supervisor.notificationAgent(state as any);
    expect(res.next).toBe(supervisor.END);
    expect(res.notificationData).toBeNull();
    expect(res.messages && res.messages.length > 0).toBeTruthy();
    const msg = res.messages[0];
    expect(msg.message.content).toMatch(/Notification sent successfully/);
  });

  test('returns failure message when pushover send fails', async () => {
    const state: any = {
      userId: 'user123',
      conversationId: 'conv-123',
      notificationData: { summary: 'Order placed', orderId: 'ORD-1', cartData: { items: [] } }
    };

  // @ts-ignore
  supervisor.__setSendPushoverNotificationForTests(vi.fn().mockResolvedValue({ ok: false, error: 'network' }));

  // reset after test
  supervisor.__resetSendPushoverNotificationForTests();

    const res = await supervisor.notificationAgent(state as any);
    expect(res.next).toBe(supervisor.END);
    expect(res.notificationData).toBeNull();
    const msg = res.messages[0];
    expect(msg.message.content).toMatch(/Failed to send notification/);
  });
});
