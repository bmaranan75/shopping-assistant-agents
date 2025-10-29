/**
 * Product information extractor using LLM
 * Extracts structured product data from natural language text
 */

import { ProductInfo } from '../../agents/supervisor/types';

// Cache for LLM responses to avoid duplicate calls
const cache = new Map<string, ProductInfo | null>();

/**
 * Clear cache for testing purposes
 */
export function __clearProductExtractorCacheForTests(): void {
  cache.clear();
}

/**
 * Extract product information from natural language text using LLM
 * Returns structured product data or null if extraction fails
 */
export default async function extractProductInfo(
  content: string,
  llm: any
): Promise<ProductInfo | null> {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Check cache first
  const cacheKey = content.trim().toLowerCase();
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  try {
    const prompt = `Extract product information from the following text and return a JSON object with "product" (string) and "quantity" (number) fields. If you cannot extract valid product information, return "null".

Text: ${content}

Return only valid JSON:`;

    const response = await llm.invoke(prompt);
    const responseContent = response.content || response;
    
    // Try to parse the response as JSON
    let result: ProductInfo | null = null;
    
    try {
      // First try direct JSON parse
      result = JSON.parse(responseContent);
    } catch {
      // If that fails, try to extract JSON from the response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch {
          result = null;
        }
      }
    }

    // Validate the result structure
    if (result && typeof result === 'object' && 
        typeof result.product === 'string' && 
        typeof result.quantity === 'number') {
      cache.set(cacheKey, result);
      return result;
    } else {
      cache.set(cacheKey, null);
      return null;
    }

  } catch (error) {
    console.error('Error extracting product info:', error);
    cache.set(cacheKey, null);
    return null;
  }
}