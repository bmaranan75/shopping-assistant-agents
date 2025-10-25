import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { parseCatalogInput, formatToolResponse, logToolExecution } from './robust-tool-parser';

// Define schema with proper nullable() for optional fields to fix OpenAI structured outputs warning
const browseCatalogSchema = z.object({
  search: z.string().nullable().optional().describe('Search term to find products by name or category'),
  category: z.string().nullable().optional().describe('Filter by specific category (e.g., "Produce", "Dairy", "Seafood")'),
  limit: z.number().nullable().optional().describe('Number of products to return (default: 10, max: 20)'),
  offset: z.number().nullable().optional().describe('Number of products to skip for pagination (default: 0)')
});

export const browseCatalogTool = new DynamicStructuredTool({
  name: 'browse_catalog',
  description: `
    Browse and search the product catalog. This tool helps users discover products before adding them to cart.
    
    Optional parameters:
    - search: Search term to find products by name or category
    - category: Filter by specific category (e.g., "Produce", "Dairy", "Seafood")  
    - limit: Number of products to return (default: 10, max: 20)
    - offset: Number of products to skip for pagination (default: 0)

    This tool does not require authentication and can be used to help users discover products.
  `,
  schema: browseCatalogSchema,
  func: async (input) => {
    const startTime = Date.now();
    
    try {
      console.log('[browseCatalogTool] Browsing catalog with filters:', input);
      
      // Build query parameters
      const params = new URLSearchParams();
      if (input.search) params.append('search', input.search);
      if (input.category) params.append('category', input.category);
      if (input.limit) params.append('limit', String(input.limit));
      if (input.offset) params.append('offset', String(input.offset));

      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/catalog?${params.toString()}`);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Failed to browse catalog: ${result.error || response.statusText}`);
      }

      console.log(`[browseCatalogTool] Found ${result.products.length} products`);
      
      // Format the response for better readability - SIMPLIFIED VERSION
      const formattedProducts = result.products.map((product: any) => ({
        id: product.id,
        name: product.name,
        price: `$${product.price}`,
        category: product.category,
        inStock: product.inStock,
        description: product.description
      }));

      const toolResult = {
        message: `Found ${result.products.length} products${input.search ? ` matching "${input.search}"` : ''}${input.category ? ` in ${input.category} category` : ''}. Here are the products available:`,
        products: formattedProducts,
        totalProducts: result.pagination.total,
        completed: true
      };

      const duration = Date.now() - startTime;
      logToolExecution('browseCatalogTool', JSON.stringify(input), { success: true }, duration);

      return formatToolResponse(true, toolResult);

    } catch (error) {
      console.error('[browseCatalogTool] Error browsing catalog:', error);
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logToolExecution('browseCatalogTool', JSON.stringify(input), { success: false, error: errorMessage }, duration);
      
      return formatToolResponse(false, null, errorMessage);
    }
  },
});
