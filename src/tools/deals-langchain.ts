import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

// Mock deals data - in a real application this would come from a database or API
const CURRENT_WEEK_DEALS = {
  'bananas': {
    dealType: 'percentage_discount',
    discount: 20,
    originalPrice: 1.29,
    dealPrice: 1.03,
    description: 'Save 20% on fresh bananas this week!',
    validUntil: '2025-10-31',
    dealId: 'BANANA_OCT_2025'
  },
  'milk': {
    dealType: 'buy_one_get_discount',
    discount: 50,
    originalPrice: 3.99,
    dealPrice: 3.99,
    description: 'Buy 2 gallons of milk, get 50% off the second one!',
    validUntil: '2025-10-31',
    dealId: 'MILK_BOGO_OCT_2025',
    minQuantity: 2
  },
  'apples': {
    dealType: 'fixed_discount',
    discount: 1.00,
    originalPrice: 2.99,
    dealPrice: 1.99,
    description: '$1 off per bag of fresh apples!',
    validUntil: '2025-10-31',
    dealId: 'APPLE_DOLLAR_OFF_2025'
  },
  'bread': {
    dealType: 'percentage_discount',
    discount: 15,
    originalPrice: 2.49,
    dealPrice: 2.12,
    description: '15% off artisan bread this week!',
    validUntil: '2025-10-31',
    dealId: 'BREAD_15_OFF_2025'
  }
};

const checkProductDealsSchema = z.object({
  productName: z.string().describe('The name of the product to check for deals'),
  quantity: z.number().nullable().optional().describe('Optional quantity the user wants to purchase'),
});

export const checkProductDealsTool = new DynamicStructuredTool({
  name: 'check_product_deals',
  description: 'Check if a specific product has any active deals for the current week. Returns deal information if available.',
  schema: checkProductDealsSchema,
  func: async ({ productName, quantity }) => {
    console.log(`[checkProductDealsTool] Checking deals for product: ${productName}, quantity: ${quantity}`);
    
    try {
      // Normalize product name for matching (lowercase, remove plurals, etc.)
      const normalizedProduct = productName.toLowerCase()
        .replace(/s$/, '') // Remove trailing 's' for plurals
        .replace(/\b(organic|fresh|local)\b/gi, '') // Remove common adjectives
        .trim();
      
      // Check if product has deals
      let deal = null;
      for (const [dealProduct, dealInfo] of Object.entries(CURRENT_WEEK_DEALS)) {
        if (normalizedProduct.includes(dealProduct) || dealProduct.includes(normalizedProduct)) {
          deal = { product: dealProduct, ...dealInfo };
          break;
        }
      }
      
      if (deal) {
        // Calculate potential savings based on quantity
        let potentialSavings = 0;
        let dealApplies = true;
        
        if (deal.dealType === 'percentage_discount') {
          potentialSavings = (deal.originalPrice * (deal.discount / 100)) * (quantity || 1);
        } else if (deal.dealType === 'fixed_discount') {
          potentialSavings = deal.discount * (quantity || 1);
        } else if (deal.dealType === 'buy_one_get_discount') {
          const minQuantity = (deal as any).minQuantity || 2;
          if (quantity && quantity >= minQuantity) {
            const discountItems = Math.floor(quantity / minQuantity);
            potentialSavings = (deal.originalPrice * (deal.discount / 100)) * discountItems;
          } else {
            dealApplies = quantity ? false : true; // If no quantity specified, assume deal could apply
          }
        }
        
        return JSON.stringify({
          success: true,
          hasDeal: true,
          deal: {
            ...deal,
            potentialSavings: potentialSavings.toFixed(2),
            dealApplies,
            quantityChecked: quantity
          }
        });
      } else {
        return JSON.stringify({
          success: true,
          hasDeal: false,
          message: `No deals found for ${productName} this week.`
        });
      }
    } catch (error) {
      console.error('Error checking product deals:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
});

const confirmDealUsageSchema = z.object({
  dealId: z.string().describe('The ID of the deal to confirm usage'),
  productName: z.string().describe('The name of the product'),
  quantity: z.number().describe('The quantity the user wants to purchase'),
  userResponse: z.string().describe('User response to the deal offer (yes/no/confirm/decline etc.)'),
});

export const confirmDealUsageTool = new DynamicStructuredTool({
  name: 'confirm_deal_usage',
  description: 'Confirm whether the user wants to apply a specific deal to their purchase. Processes user response to deal offers.',
  schema: confirmDealUsageSchema,
  func: async ({ dealId, productName, quantity, userResponse }) => {
    console.log(`[confirmDealUsageTool] Processing deal confirmation for ${dealId}: ${userResponse}`);
    
    try {
      // Normalize user response
      const response = userResponse.toLowerCase().trim();
      const isConfirmed = response.includes('yes') || 
                         response.includes('confirm') || 
                         response.includes('apply') ||
                         response.includes('use') ||
                         response.includes('ok') ||
                         response.includes('sure');
      
      const isDeclined = response.includes('no') || 
                        response.includes('decline') || 
                        response.includes('skip') ||
                        response.includes('without');
      
      if (isConfirmed) {
        return JSON.stringify({
          success: true,
          dealConfirmed: true,
          dealId,
          productName,
          quantity,
          message: `Great! The deal has been applied to your ${productName}. You'll save money on this purchase!`,
          action: 'apply_deal'
        });
      } else if (isDeclined) {
        return JSON.stringify({
          success: true,
          dealConfirmed: false,
          dealId,
          productName,
          quantity,
          message: `No problem! Adding ${productName} to cart without the deal.`,
          action: 'skip_deal'
        });
      } else {
        return JSON.stringify({
          success: true,
          dealConfirmed: null,
          message: `I didn't quite understand your response. Would you like to apply the deal to your ${productName}? Please respond with 'yes' to apply the deal or 'no' to skip it.`,
          action: 'clarify_response'
        });
      }
    } catch (error) {
      console.error('Error confirming deal usage:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
});