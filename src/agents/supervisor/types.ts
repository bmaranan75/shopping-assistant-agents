/**
 * Type definitions for the Supervisor Agent
 */

import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

export type AgentRole = 'user' | 'assistant' | 'system';

export interface AnnotatedMessage {
  message: HumanMessage | AIMessage | SystemMessage;
  role: AgentRole;
  agent?: string;        // e.g. 'catalog', 'cart_and_checkout', 'deals', 'payment'
  senderId?: string;     // optional identifier of agent or external source
  timestamp: number;
  delegation?: {         // delegation information from planner
    targetAgent: string;
    task: string;
    reasoning: string;
  };
  progress?: {           // progress tracking for streaming
    isProgressUpdate: boolean;
    step: string;
    agent: string;
    ephemeral?: boolean;      // marks message as ephemeral (not saved to history)
    autoRemoveMs?: number;    // auto-dismiss timeout for UI
  };
}

export interface WorkflowDetectionResult {
  isComplex: boolean;
  workflowType?: string;
  reason?: string;
  includesCheckout?: boolean;
}

export interface ContinuationAnalysis {
  isContinuation: boolean;
  continuationType?: string;
  targetAgent?: string;
  confidence: number;
  reasoning?: string;
}

export interface ProductInfo {
  product: string;
  quantity?: number;
  [key: string]: any;
}

export interface DealData {
  applied?: boolean;
  pending?: boolean;
  type?: string;
  includesCheckout?: boolean;
  workflowType?: string;
  history?: any[];
  originalIntent?: string;
  [key: string]: any;
}

export interface NotificationData {
  userId: string;
  conversationId: string;
  summary: string;
  cartData: any;
  orderId: string | null;
  total?: number | null;
  timestamp: number;
}

export interface CheckoutResult {
  checkoutStatus?: 'success' | 'failure';
  orderId?: string | null;
  summary?: string | null;
  items?: any[] | null;
  total?: number | null;
}
