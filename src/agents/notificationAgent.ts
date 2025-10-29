/**
 * Notification Agent - Handles sending notifications and post-checkout messaging
 */

import { END } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import type { SupervisorState } from './supervisor/state';

// Mock pushover notification function (replace with actual implementation)
export let sendPushoverNotification = async (payload: any): Promise<any> => {
  console.log('[sendPushoverNotification] Sending notification:', payload);
  
  // Mock success response
  return {
    ok: true,
    result: {
      status: 1,
      request: 'mock-request-id'
    }
  };
};

/**
 * Notification agent that handles post-checkout notifications
 */
export async function notificationAgent(
  state: typeof SupervisorState.State,
  annotateMessage: (message: any, role: string, agent?: string) => any,
  createProgressMessage: (content: string, agent: string) => any
) {
  const { userId, conversationId, notificationData } = state as any;
  
  console.log('[notificationAgent] Processing notification for user:', userId);
  console.log('[notificationAgent] Notification data:', notificationData);
  
  if (!notificationData) {
    console.warn('[notificationAgent] No notification data provided');
    const errorMessage = new AIMessage('No notification data to process.');
    
    return {
      messages: [annotateMessage(errorMessage, 'assistant', 'notification_agent')],
      userId,
      conversationId,
      notificationData: null,
      next: END
    };
  }
  
  try {
    // Send pushover notification
    const pushoverPayload = {
      user: userId,
      message: notificationData.summary || 'Order completed',
      title: 'Grocery Order Update',
      url: notificationData.orderId ? `https://groceryapp.com/orders/${notificationData.orderId}` : undefined,
      url_title: notificationData.orderId ? 'View Order' : undefined,
      timestamp: notificationData.timestamp || Date.now()
    };
    
    const pushoverResult = await sendPushoverNotification(pushoverPayload);
    
    if (pushoverResult.ok && pushoverResult.result?.status === 1) {
      console.log('[notificationAgent] Notification sent successfully');
      
      const successMessage = new AIMessage('Notification sent successfully! You should receive a push notification shortly.');
      
      return {
        messages: [annotateMessage(successMessage, 'assistant', 'notification_agent')],
        userId,
        conversationId,
        notificationData: null, // Clear notification data after successful send
        next: END
      };
    } else {
      console.error('[notificationAgent] Failed to send notification:', pushoverResult);
      
      const failureMessage = new AIMessage('Failed to send notification. Your order was completed successfully though!');
      
      return {
        messages: [annotateMessage(failureMessage, 'assistant', 'notification_agent')],
        userId,
        conversationId,
        notificationData: null, // Clear notification data even on failure
        next: END
      };
    }
  } catch (error) {
    console.error('[notificationAgent] Error sending notification:', error);
    
    const errorMessage = new AIMessage('There was an issue sending the notification, but your order was completed successfully!');
    
    return {
      messages: [annotateMessage(errorMessage, 'assistant', 'notification_agent')],
      userId,
      conversationId,
      notificationData: null, // Clear notification data on error
      next: END
    };
  }
}

// Test helpers for mocking
export function __setSendPushoverNotificationForTests(mockFn: any) {
  sendPushoverNotification = mockFn;
}

export function __resetSendPushoverNotificationForTests() {
  sendPushoverNotification = async (payload: any): Promise<any> => {
    console.log('[sendPushoverNotification] Sending notification:', payload);
    return {
      ok: true,
      result: {
        status: 1,
        request: 'mock-request-id'
      }
    };
  };
}