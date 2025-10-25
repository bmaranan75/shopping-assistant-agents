import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { checkProductDealsTool } from '../tools/deals-langchain';

const date = new Date().toISOString();

const DEALS_SYSTEM_TEMPLATE = `You are the Deals Specialist for the Grocery AI system. Your job is to find and present product deals.

## Core Responsibility:
Search for active deals and present them clearly with all relevant information.

## Available Tool:
- **checkProductDeals**: Find active deals for specific products (discount type, amount, validity, requirements)

## Deal Types:
- Percentage discounts (X% off)
- Fixed amount discounts ($X off)
- Buy-one-get-discount deals
- Quantity-based deals (minimum purchase requirements)

## Presentation Guidelines:
When presenting deals, include:
- Product name and deal description
- Original vs. deal price
- Total savings (based on quantity)
- Expiration date
- Any requirements

Example: "Great news! Organic Bananas are 20% off this week. Regular: $4.99 → Deal: $3.99. You'll save $1.00! Valid until Oct 25. Would you like to apply this deal?"

## No Deals Available:
If no deals exist: "No current deals for [product]. Adding at regular price or checking other products with deals are options."

## Response Style:
- Be enthusiastic about savings
- Focus only on item-specific deals (not cart-wide or category deals)
- Present information clearly for customer decision-making

Today is ${date}. Focus on current week deals only.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 50000,
});

export class DealsAgent {
  private agent: any;
  private memorySaver: MemorySaver;
  private userId: string;

  constructor(userId: string) {
    console.log('[DealsAgent] Creating agent for userId:', userId);
    
    this.userId = userId;
    this.memorySaver = new MemorySaver();
    
    const tools = [
      checkProductDealsTool,
    ];

    this.agent = createReactAgent({
      llm,
      tools: new ToolNode(tools, { handleToolErrors: true }),
      prompt: DEALS_SYSTEM_TEMPLATE,
      checkpointer: this.memorySaver,
    });
  }

  // Standalone usage - can be called by any system
  async chat(message: string, sessionId?: string): Promise<any> {
    const threadId = sessionId || `deals-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return await this.agent.invoke({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Stream support for real-time responses
  async stream(message: string, sessionId?: string) {
    const threadId = sessionId || `deals-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return this.agent.stream({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Get conversation history
  async getHistory(sessionId?: string) {
    const threadId = sessionId || `deals-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    return await this.memorySaver.get(config);
  }

  // Clear session memory
  async clearSession(sessionId?: string) {
    const threadId = sessionId || `deals-${this.userId}-default`;
    this.memorySaver = new MemorySaver();
    console.log(`[DealsAgent] Session ${threadId} cleared`);
  }

  // Supervisor-compatible method (for existing integration)
  async invoke(input: any, config?: any) {
    return await this.agent.invoke(input, config);
  }
}

// Factory function for backward compatibility
export const createDealsAgent = (userId: string) => {
  return new DealsAgent(userId);
};

// Create a standalone graph instance for LangGraph server deployment
const serverTools = [
  checkProductDealsTool,
];

export const dealsGraph = createReactAgent({
  llm,
  tools: new ToolNode(serverTools, { handleToolErrors: true }),
  prompt: DEALS_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});