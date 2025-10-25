/**
 * State management for the Supervisor Agent
 */

import { Annotation, END } from '@langchain/langgraph';
import { AnnotatedMessage } from './types';

/**
 * Enhanced Supervisor State
 * 
 * Robust state management with validation and intelligent merging:
 * - messages: Conversation history (limited to prevent memory bloat)
 * - next: Target agent for routing
 * - userId: User identification (with fallback validation)
 * - conversationId: Conversation instance identifier (with auto-generation)
 * - cartData: Cart state with intelligent merging
 * - workflowContext: Context validation for continuation scenarios
 * - dealData: Deal information with history preservation
 * - pendingProduct: Product info with structure validation
 */
export const SupervisorState = Annotation.Root({
  messages: Annotation<Array<AnnotatedMessage>>({
    reducer: (x, y) => {
      const combined = x.concat(y);
      // CRITICAL FIX: Keep ephemeral messages temporarily for streaming
      // They will be visible in the stream chunks sent to the client
      // But we still limit total history to prevent memory bloat
      
      // First, separate ephemeral (recent progress) from permanent messages
      const ephemeral = combined.filter(msg => 
        msg.progress?.isProgressUpdate && msg.progress?.ephemeral === true
      );
      const permanent = combined.filter(msg => 
        !msg.progress?.isProgressUpdate || 
        msg.progress?.ephemeral !== true
      );
      
      // Keep only recent ephemeral messages (last 5 for current operation feedback)
      const recentEphemeral = ephemeral.slice(-5);
      
      // Keep last 10 permanent messages for LLM context
      const recentPermanent = permanent.slice(-10);
      
      // Combine: permanent messages first, then ephemeral (so they're at the end for streaming)
      return [...recentPermanent, ...recentEphemeral];
    },
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x ?? END,
  }),
  userId: Annotation<string>({
    reducer: (x, y) => {
      if (!y && !x) {
        console.warn('[SupervisorState] Missing userId - using default');
        return 'default-user';
      }
      return y ?? x;
    },
  }),
  conversationId: Annotation<string>({
    reducer: (x, y) => {
      if (!y && !x) {
        console.warn('[SupervisorState] Missing conversationId - generating default');
        return `conv-${Date.now()}`;
      }
      return y ?? x;
    },
  }),
  cartData: Annotation<any>({
    reducer: (x, y) => {
      // Merge cart data intelligently
      if (y === null) return null; // Explicit clear
      if (!y) return x; // No new data
      if (!x) return y; // First time
      // Merge objects
      return typeof y === 'object' && typeof x === 'object' ? { ...x, ...y } : y;
    },
  }),
  workflowContext: Annotation<string>({
    reducer: (x, y) => {
      // Validate workflow context
      const validContexts = [
        'awaiting_deal_confirmation',
        'add_to_cart_with_deals', 
        'add_to_cart_with_checkout', // for automatic checkout after cart
        'check_deals',
        'prepare_checkout',
        'process_checkout',
        'send_notification' // for routing to notification agent after checkout
      ];
      if (y && !validContexts.includes(y)) {
        console.warn(`[SupervisorState] Invalid workflow context: ${y}`);
        return x; // Keep previous valid context
      }
      return y ?? x;
    },
  }),
  dealData: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      if (!x) return y;
      // Intelligent merge - preserve important fields
      return {
        ...x,
        ...y,
        // Preserve history of deal interactions
        history: [...(x.history || []), ...(y.history || [])]
      };
    },
  }),
  // Counter to prevent infinite delegation loops between planner and supervisor
  delegationDepth: Annotation<number>({
    reducer: (x, y) => {
      // Accept explicit resets
      if (y === null) return 0;
      const prev = typeof x === 'number' ? x : 0;
      const next = typeof y === 'number' ? y : prev;
      // Clamp to a sensible maximum to avoid overflow
      return Math.max(0, Math.min(next, 100));
    },
  }),
  pendingProduct: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      // Validate product structure
      if (y && typeof y === 'object' && !y.product) {
        console.warn('[SupervisorState] Invalid pendingProduct structure:', y);
        return x;
      }
      return y;
    },
  }),
  // notificationData: stores payload for post-checkout notifications (e.g., order id, summary)
  notificationData: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      if (!x) return y;
      return { ...x, ...y };
    },
  }),
  // Planner recommendation to be processed by supervisor
  plannerRecommendation: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      // Store the latest planner recommendation
      return y;
    },
  }),
});
