import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { parseCartInput, formatToolResponse, logToolExecution } from './robust-tool-parser';

// Circuit breaker to prevent infinite tool calls
const addToCartCallCounter = new Map<string, number>();
const MAX_ADD_TO_CART_CALLS = 2;

export const addToCartTool = (defaultUserId: string = 'default-user') => new DynamicStructuredTool({
  name: 'add_to_cart',
  description: `
    Add an item to the user's shopping cart. Extract the required information from the message and call this tool.
    
    WHEN TO USE: When you see messages like "Please add [quantity] [product] to cart" or "add [product] to cart"
    
    PARAMETER EXTRACTION: Extract these from the message:
    - productCode: Product code from the message (e.g., "apple", "banana", "milk")  
    - quantity: Number of items to add (extract from message, default: 1)
    - userId: Extract from [userId:USER_ID] format in the message
    
    EXAMPLE MESSAGE: "[userId:user123] Please add 2 apples to cart using productCode 'apple'"
    EXAMPLE TOOL CALL: {productCode: "apple", quantity: 2, userId: "user123"}
  `,
  schema: z.object({
    productCode: z.string().describe('Product code to add to cart (e.g., "apple", "banana")'),
    quantity: z.number().default(1).describe('Quantity to add (default: 1)'),
    userId: z.string().describe('User ID extracted from message [userId:USER_ID] format')
  }),
  func: async (inputString: any) => {
    const startTime = Date.now();
    
    try {
      // 🔍 ENHANCED DEBUGGING - Log everything about the tool call
      console.log('='.repeat(80));
      console.log('[addToCartTool] 🔍 DETAILED TOOL CALL DEBUG');
      console.log(`[addToCartTool] Raw input:`, inputString);
      console.log(`[addToCartTool] Input type:`, typeof inputString);
      console.log(`[addToCartTool] Input length:`, inputString?.length);
      console.log(`[addToCartTool] Input JSON.stringify:`, JSON.stringify(inputString));
      console.log(`[addToCartTool] Is undefined:`, inputString === undefined);
      console.log(`[addToCartTool] Is null:`, inputString === null);
      console.log(`[addToCartTool] Is empty string:`, inputString === '');
      console.log('='.repeat(80));
      
      // CRITICAL: Prevent recursion when called with undefined/empty input
      if (inputString === undefined || inputString === null || inputString === '') {
        console.error(`[addToCartTool] 🚨 CRITICAL ERROR: Called with undefined/empty input!`);
        console.error(`[addToCartTool] This indicates the LangGraph agent is not properly calling the tool.`);
        console.error(`[addToCartTool] Expected format: {"productCode": "product_name", "quantity": 1, "userId": "user_id"}`);
        
        console.error(`[addToCartTool] DEBUGGING INFO:`);
        console.error(`  - Input received: ${JSON.stringify(inputString)}`);
        console.error(`  - Input type: ${typeof inputString}`);
        console.error(`  - Agent should parse message and extract parameters`);
        console.error(`  - Check if agent system prompt is clear about tool usage`);
        
        // Return a clear error that should stop the agent from retrying
        return JSON.stringify({
          success: false,
          error: 'TOOL_CALL_ERROR: No product information provided. Cannot add undefined product to cart. Please specify productCode, quantity, and userId.',
          action_required: 'Provide valid product information or ask user to clarify their request.',
          debug_info: `Tool called with: ${JSON.stringify(inputString)} (type: ${typeof inputString})`
        });
      }
      
      // Use robust parser for input handling
      const parseResult = parseCartInput(inputString);

      if (!parseResult.success) {
        return formatToolResponse(false, null, parseResult.error);
      }

      let input = parseResult.data;
      
      // Extract userId from input or context message (check for [userId:USER_ID] format)
      let userId = input.userId || defaultUserId;
      
      // Circuit breaker to prevent infinite calls
      const sessionKey = `addToCart-${userId}`;
      const currentCount = addToCartCallCounter.get(sessionKey) || 0;
      
      if (currentCount >= MAX_ADD_TO_CART_CALLS) {
        console.error(`[addToCartTool] CIRCUIT BREAKER: Too many calls (${currentCount}) for user ${userId}. Preventing infinite loop.`);
        return JSON.stringify({
          success: false,
          error: 'CIRCUIT_BREAKER: Too many add-to-cart attempts. This suggests a tool calling issue. Please refresh and try again.',
          suggestion: 'Try rephrasing your request or contact support if the issue persists.'
        });
      }
      
      addToCartCallCounter.set(sessionKey, currentCount + 1);
      
      // Reset counter after 60 seconds
      setTimeout(() => {
        addToCartCallCounter.delete(sessionKey);
      }, 60000);
      
      console.log(`[addToCartTool] Called with userId: ${userId}, input: ${inputString} (attempt ${currentCount + 1}/${MAX_ADD_TO_CART_CALLS})`);
      console.log(`[addToCartTool] Input type: ${typeof inputString}, Input value:`, inputString);
      
      // CRITICAL: The issue is that LangGraph agents can't easily pass userId through tool parameters
      // Since the tools are created with 'default-user', we need a different approach
      // For now, let's handle the case where we have valid product info but wrong userId
      if (userId === 'default-user' || userId === defaultUserId) {
        console.warn(`[addToCartTool] WARNING: Using default userId. This suggests the LangGraph agent couldn't pass the real userId.`);
        console.warn(`[addToCartTool] This is a known limitation with static LangGraph server tools.`);
        // Continue with default-user for now, but log the issue
      }
      
      // Handle empty input
      if (!input.productCode && !input.productName) {
        return formatToolResponse(false, null, 'No product specified to add to cart.');
      }

      // Transform id to productCode if needed (for backward compatibility with agent)
      if (input.id && !input.productCode) {
        console.log('[addToCartTool] Transforming id to productCode:', input.id);
        input.productCode = input.id;
        delete input.id;
      }

      console.log('[addToCartTool] Input after transformation:', input);

      // Additional validation after parsing
      if (!input.productCode && !input.productName) {
        return formatToolResponse(false, null, 'Either productCode or productName is required');
      }

      // Set defaults and add userId
      input.quantity = input.quantity || 1;
      input.userId = userId;

      console.log('[addToCartTool] Adding item to cart:', input);
      
      // Get the access token from environment or session
      // In a real implementation, you would get this from the current user session

      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/add-to-cart`, {
        method: 'POST',
        headers: {
          // 'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Failed to add item to cart: ${result.error || response.statusText}`);
      }

      console.log('[addToCartTool] Item added successfully:', result);
      
      const toolResult = {
        message: result.message,
        cartItem: result.cartItem,
        totalItems: result.totalItems,
      };

      const duration = Date.now() - startTime;
      logToolExecution('addToCartTool', inputString, { success: true }, duration);
      
      return formatToolResponse(true, toolResult);
      
    } catch (error) {
      console.error('[addToCartTool] Error adding item to cart:', error);
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logToolExecution('addToCartTool', inputString, { success: false, error: errorMessage }, duration);
      
      return formatToolResponse(false, null, errorMessage);
    }
  },
});
