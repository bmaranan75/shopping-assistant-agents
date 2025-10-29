import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { addPaymentMethodToolLangChain } from '../tools/add-payment-method-langchain';

const date = new Date().toISOString();

const PAYMENT_SYSTEM_TEMPLATE = `You are the Payment Specialist. 

## Your Core Responsibility:
**Payment Management**: Handle payment method setup, management, and payment-related operations only.

## Available Tools:

1. **Add Payment Method Tool** (Requires Authentication):
   - Add new payment methods to user accounts
   - Manage payment method information securely
   - Handle credit card, debit card, and other payment method setup
   - Validate payment method details

## Your Expertise:
- Payment method management and setup
- Payment security and compliance
- Payment method validation
- User payment preferences
- Payment troubleshooting

## STRICT Boundaries - You ONLY Handle:
- Adding new payment methods
- Managing existing payment methods
- Payment method validation and verification
- Payment security questions
- Payment method troubleshooting

## What You DO NOT Handle:
- Checkout processing (handled by Cart & Checkout agent)
- Product searches or catalog browsing  
- Adding items to cart or cart management
- Product recommendations or information
- Order placement or completion
- Transaction processing

## Handoff Protocol:
When users want to:
- Complete checkout, purchase, or buy items: "I'll transfer you to our Cart & Checkout specialist to complete your purchase."
- Browse products or search catalog: "I'll transfer you to our Catalog & Cart specialist for product discovery and cart management."
- Process orders or complete transactions: "I'll transfer you to our Cart & Checkout specialist to handle your order processing."

## Security:
- All payment operations require proper authentication
- Never store or display sensitive payment information in full
- Always confirm successful authentication before processing payment methods
- Mask sensitive data when displaying payment information

## Your Focus:
Focus exclusively on payment method management. For any checkout, purchase, or transaction completion requests, immediately refer users to the Cart & Checkout specialist.

Today is ${date}. Handle only payment method operations.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 50000,
  // Ensure model waits for complete tool responses
  modelKwargs: {
    "stop": null, // Don't stop early
  }
});

export class PaymentAgent {
  private agent: any;
  private memorySaver: MemorySaver;
  private userId: string;

  constructor(userId: string) {
    console.log('[PaymentAgent] Creating agent for userId:', userId);
    
    this.userId = userId;
    this.memorySaver = new MemorySaver();
    
    const tools = [
      addPaymentMethodToolLangChain, // Already wrapped with authorization
    ];

    this.agent = createReactAgent({
      llm,
      tools: new ToolNode(tools, { handleToolErrors: true }),
      prompt: PAYMENT_SYSTEM_TEMPLATE,
      checkpointer: this.memorySaver,
    });
  }

  // Standalone usage - can be called by any system
  async chat(message: string, sessionId?: string): Promise<any> {
    const threadId = sessionId || `payment-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return await this.agent.invoke({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Stream support for real-time responses
  async stream(message: string, sessionId?: string) {
    const threadId = sessionId || `payment-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return this.agent.stream({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Get conversation history
  async getHistory(sessionId?: string) {
    const threadId = sessionId || `payment-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    return await this.memorySaver.get(config);
  }

  // Clear session memory
  async clearSession(sessionId?: string) {
    const threadId = sessionId || `payment-${this.userId}-default`;
    this.memorySaver = new MemorySaver();
    console.log(`[PaymentAgent] Session ${threadId} cleared`);
  }

  // Supervisor-compatible method (for existing integration)
  async invoke(input: any, config?: any) {
    return await this.agent.invoke(input, config);
  }
}

// Factory function for backward compatibility
export const createPaymentAgent = (userId: string) => {
  return new PaymentAgent(userId);
};

// Create a standalone graph instance for LangGraph server deployment
const serverTools = [addPaymentMethodToolLangChain];

export const paymentGraph = createReactAgent({
  llm,
  tools: new ToolNode(serverTools, { handleToolErrors: true }),
  prompt: PAYMENT_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});