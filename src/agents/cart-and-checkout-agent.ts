import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { z } from 'zod';
import { addToCartTool } from '../tools/add-to-cart-langchain-structured';
import { getCartTool } from '../tools/get-user-cart-langchain';
import { createCheckoutCartTool, authorizedTracedCheckoutCartTool } from '../tools/checkout-langchain-refactored';
import { withAsyncAuthorization } from '../ciba-provider';

const date = new Date().toISOString();

const CART_AND_CHECKOUT_SYSTEM_TEMPLATE = `You are a specialized Cart and Checkout AI agent.

## Primary Directives
1.  **Execute Tasks Immediately**: Process incoming structured messages from other agents or the supervisor without asking for confirmation. These are pre-validated requests.
2.  **Manage Shopping Carts**: Use the provided tools to add items, view the cart, and manage quantities.
3.  **Process Secure Checkouts**: Handle the final checkout process, which requires user authorization (CIBA).
4.  **Strict Adherence to Tool Schema**: Call tools with the exact parameters specified.

## User and Data Handling
- **User ID is CRITICAL**: You MUST extract the \`userId\` from messages formatted as \`[userId:USER_ID]\`. If not present, use \`default-user\`. Every tool call that requires a \`userId\` MUST include it.
- **Structured Data is Priority**: Your primary input will be structured messages. For example: \`[userId:user123] Add 2 "apple" to the cart.\` Extract all necessary parameters from such messages.

## Tool Usage Protocol

### add_to_cart
- **Use Case**: For "add item to cart" requests.
- **Parameters**: \`{"productCode": "item_name", "quantity": number, "userId": "user_id"}\`
- **Action**: Confirm the item was added. Do not ask to view cart unless requested.

### get_cart
- **Use Case**: For "view cart" requests.
- **Parameters**: \`{"userId": "user_id"}\`
- **Action**: Display cart contents, including items, quantities, and totals.

### checkout_cart
- **Use Case**: ONLY for explicit "checkout" requests. This is a secure, authorized tool.
- **Pre-computation**: This tool expects the complete cart data to be passed as a parameter. It does NOT fetch the cart itself.
- **Workflow**:
    1.  If the cart data is not in the current message, first call \`get_cart\` to retrieve it.
    2.  Once you have the cart data, call \`checkout_cart\` with it.
    3.  **NEVER** call \`get_cart\` more than once per turn.

## Checkout JSON Contract
On successful checkout, you MUST return ONLY the following JSON object:
\`\`\`json
{
  "checkoutStatus": "success",
  "orderId": "string",
  "summary": "string",
  "items": "Array<any>",
  "total": "number"
}
\`\`\`

## Error Management
- If a tool call fails, state the error clearly. Do not retry the failed tool.
- If information is missing (e.g., no \`userId\`), ask for clarification.

Today's Date: ${date}. Your focus is on precise, secure, and efficient transaction processing.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 50000,
});

export class CartAndCheckoutAgent {
  private agent: any;
  private memorySaver: MemorySaver;
  private userId: string;

  constructor(userId: string, cartData?: any) {
    console.log('[CartAndCheckoutAgent] Creating agent for userId:', userId);
    console.log('[CartAndCheckoutAgent] Cart data provided:', !!cartData);
    
    this.userId = userId;
    this.memorySaver = new MemorySaver();
    
    const tools = [
      addToCartTool(userId),
      getCartTool(userId),
      // CRITICAL FIX: Use Auth0 wrapped tool that expects cart data as parameter
      authorizedTracedCheckoutCartTool,
    ];

    this.agent = createReactAgent({
      llm,
      tools: new ToolNode(tools, { handleToolErrors: true }),
      prompt: CART_AND_CHECKOUT_SYSTEM_TEMPLATE,
      checkpointer: this.memorySaver,
    });
  }

  // Standalone usage - can be called by any system
  async chat(message: string, sessionId?: string): Promise<any> {
    const threadId = sessionId || `cart-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return await this.agent.invoke({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Stream support for real-time responses
  async stream(message: string, sessionId?: string) {
    const threadId = sessionId || `cart-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return this.agent.stream({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Get conversation history
  async getHistory(sessionId?: string) {
    const threadId = sessionId || `cart-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    return await this.memorySaver.get(config);
  }

  // Clear session memory - creates a new memory instance for this thread
  async clearSession(sessionId?: string) {
    const threadId = sessionId || `cart-${this.userId}-default`;
    // Simply create a new MemorySaver instance to clear the thread
    this.memorySaver = new MemorySaver();
    console.log(`[CartAndCheckoutAgent] Session ${threadId} cleared`);
  }

  // Supervisor-compatible method (for existing integration)
  async invoke(input: any, config?: any) {
    return await this.agent.invoke(input, config);
  }
}

// Factory function for backward compatibility
export const createCartAndCheckoutAgent = (userId: string, cartData?: any) => {
  return new CartAndCheckoutAgent(userId, cartData);
};

// The fundamental issue is that LangGraph server tools can't be dynamic per request
// We need to modify the tools to handle user context properly
// For now, let's create server tools with better error handling

// Create a standalone graph instance for LangGraph server deployment
const serverTools = [
  addToCartTool('default-user'), // TODO: Make this dynamic based on request context
  getCartTool('default-user'),   // TODO: Make this dynamic based on request context  
  // CRITICAL: Use pre-authorized tool for CIBA push notifications
  authorizedTracedCheckoutCartTool,
];

export const cartAndCheckoutGraph = createReactAgent({
  llm,
  tools: new ToolNode(serverTools, { handleToolErrors: true }),
  prompt: CART_AND_CHECKOUT_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});