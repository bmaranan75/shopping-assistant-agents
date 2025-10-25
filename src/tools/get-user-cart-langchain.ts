import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

const getCartSchema = z.object({
  // No parameters needed - userId is provided at tool creation time
});

// Global state to prevent getCart recursion per user
const userCartToolState = new Map<string, boolean>();

// Circuit breaker to prevent infinite tool calls
const toolCallCounter = new Map<string, number>();
const MAX_TOOL_CALLS_PER_SESSION = 3;

export const getCartTool = (defaultUserId: string = 'default-user') => new DynamicStructuredTool({
  name: 'get_cart',
  description: 'Get the current cart contents for the authenticated user. CRITICAL: Do not use this tool if cart data is already provided in the conversation context. Can accept userId in input to override default.',
  schema: z.object({
    userId: z.string().optional().describe('User ID to get cart for (optional)')
  }),
  func: async (input: { userId?: string } = {}) => {
    // CRITICAL: Log the actual input received to debug tool calling issues
    console.log(`[getCartTool] Raw input received:`, input);
    
    let userId = input.userId || defaultUserId;
    
    // Circuit breaker to prevent infinite calls
    const sessionKey = `getCart-${userId}`;
    const currentCount = toolCallCounter.get(sessionKey) || 0;
    
    if (currentCount >= MAX_TOOL_CALLS_PER_SESSION) {
      console.error(`[getCartTool] CIRCUIT BREAKER: Too many calls (${currentCount}) for user ${userId}. Preventing infinite loop.`);
      return JSON.stringify({
        success: false,
        error: 'CIRCUIT_BREAKER: Too many cart retrieval attempts. Please refresh and try again.',
        retry_after: '60 seconds'
      });
    }
    
    toolCallCounter.set(sessionKey, currentCount + 1);
    
    // Reset counter after 60 seconds
    setTimeout(() => {
      toolCallCounter.delete(sessionKey);
    }, 60000);
    
    console.log(`[getCartTool] Called with userId: ${userId} (attempt ${currentCount + 1}/${MAX_TOOL_CALLS_PER_SESSION})`);
    
    // Check if this tool is already running for this user
    if (userCartToolState.get(userId)) {
      console.warn(`[getCartTool] Tool already running for user ${userId}, preventing recursion`);
      throw new Error('Cart retrieval is already in progress. Please wait for the current operation to complete.');
    }
    
    userCartToolState.set(userId, true);
    
    try {
      const baseUrl = process.env.NEXTJS_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/get-cart?userId=${encodeURIComponent(userId)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get cart');
      }
      
      console.log(`[getCartTool] Successfully retrieved cart for user ${userId}`);
      
      return JSON.stringify({
        success: true,
        cart: data.cart,
        message: data.message || 'Cart retrieved successfully',
      });
    } catch (error) {
      console.error(`[getCartTool] Error getting cart for user ${userId}:`, error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      // Always reset the state for this user
      userCartToolState.set(userId, false);
      console.log(`[getCartTool] Reset state for user ${userId}`);
    }
  },
});

// export const getUserCartTool = getCartTool('');