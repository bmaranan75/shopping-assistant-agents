import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

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
  func: async (input: { productCode: string; quantity: number; userId: string }) => {
    const startTime = Date.now();
    
    try {
      // 🔍 STRUCTURED TOOL DEBUG
      console.log('='.repeat(80));
      console.log('[addToCartTool] ✅ STRUCTURED TOOL CALLED SUCCESSFULLY!');
      console.log(`[addToCartTool] productCode: "${input.productCode}"`);
      console.log(`[addToCartTool] quantity: ${input.quantity}`);
      console.log(`[addToCartTool] userId: "${input.userId}"`);
      console.log('='.repeat(80));
      
      // Validate required fields
      if (!input.productCode) {
        console.error(`[addToCartTool] ERROR: Missing productCode`);
        return JSON.stringify({
          success: false,
          error: 'Missing required field: productCode',
          action_required: 'Provide valid productCode from the message'
        });
      }
      
      if (!input.userId) {
        console.error(`[addToCartTool] ERROR: Missing userId`);
        return JSON.stringify({
          success: false,
          error: 'Missing required field: userId', 
          action_required: 'Extract userId from [userId:USER_ID] format in message'
        });
      }
      
      // Use the structured input directly
      const { productCode, quantity = 1, userId } = input;
      
      // Circuit breaker to prevent infinite calls
      const sessionKey = `addToCart-${userId}`;
      const currentCount = addToCartCallCounter.get(sessionKey) || 0;
      
      if (currentCount >= MAX_ADD_TO_CART_CALLS) {
        console.error(`[addToCartTool] CIRCUIT BREAKER: Too many calls (${currentCount}) for user ${userId}.`);
        return JSON.stringify({
          success: false,
          error: 'CIRCUIT_BREAKER: Too many add-to-cart attempts. Please refresh and try again.',
          suggestion: 'Try rephrasing your request or contact support if the issue persists.'
        });
      }
      
      addToCartCallCounter.set(sessionKey, currentCount + 1);
      
      // Reset counter after 60 seconds
      setTimeout(() => {
        addToCartCallCounter.delete(sessionKey);
      }, 60000);
      
      console.log(`[addToCartTool] Processing: userId=${userId}, productCode=${productCode}, quantity=${quantity} (attempt ${currentCount + 1}/${MAX_ADD_TO_CART_CALLS})`);
      
      // Make API call to add item to cart
      const response = await fetch('http://localhost:3000/api/add-to-cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productCode,
          quantity,
          userId
        }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        console.log(`[addToCartTool] ✅ SUCCESS: Added ${quantity} x ${productCode} to cart for user ${userId}`);
        return JSON.stringify({
          success: true,
          message: `Successfully added ${quantity} x ${productCode} to cart`,
          cartItem: data.cartItem,
          total: data.cartItem?.totalPrice || 0
        });
      } else {
        console.error(`[addToCartTool] ❌ API ERROR:`, data);
        return JSON.stringify({
          success: false,
          error: data.message || 'Failed to add item to cart',
          details: data
        });
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      console.error(`[addToCartTool] EXCEPTION after ${duration}ms:`, error);
      
      return JSON.stringify({
        success: false,
        error: `Tool execution failed: ${errorMessage}`,
        duration: `${duration}ms`
      });
    }
  }
});