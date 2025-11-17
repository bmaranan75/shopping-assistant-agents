/**
 * Product utilities for the Supervisor Agent
 */

import extractProductInfoImpl from '../../lib/agents/productExtractor';
import { ProductInfo } from './types';

/**
 * Normalize product names from plural/conversational form to product code format
 * This helps bridge the gap between how users speak and how products are stored
 */
export function normalizeProductName(productName: string): string {
  let normalized = productName.toLowerCase().trim();
  
  // Step 1: Remove common descriptors and quantifiers
  const descriptorsToRemove = [
    'bag of', 'bags of',
    'bunch of', 'bunches of',
    'carton of', 'cartons of',
    'box of', 'boxes of',
    'pack of', 'packs of',
    'package of', 'packages of',
    'bottle of', 'bottles of',
    'can of', 'cans of',
    'jar of', 'jars of',
    'container of', 'containers of',
    'pound of', 'pounds of', 'lb of', 'lbs of',
    'gallon of', 'gallons of',
    'quart of', 'quarts of',
    'pint of', 'pints of',
    'dozen', 'a dozen',
    'piece of', 'pieces of',
    'head of', 'heads of',
    'loaf of', 'loaves of'
  ];
  
  for (const descriptor of descriptorsToRemove) {
    if (normalized.startsWith(descriptor + ' ')) {
      normalized = normalized.substring(descriptor.length + 1).trim();
      console.log(`[normalizeProductName] Removed descriptor "${descriptor}" from "${productName}"`);
      break;
    }
  }
  
  // Step 2: Remove articles (a, an, the) from the beginning
  normalized = normalized.replace(/^(a|an|the)\s+/, '');
  
  // Step 3: Common plural to singular mappings for grocery items
  const pluralToSingular: { [key: string]: string } = {
    'apples': 'apple',
    'bananas': 'banana', 
    'oranges': 'orange',
    'carrots': 'carrots', // already singular form in catalog
    'potatoes': 'potato',
    'tomatoes': 'tomato',
    'onions': 'onion',
    'eggs': 'egg',
    'breads': 'bread',
    'milks': 'milk',
    'cheeses': 'cheese',
    'yogurts': 'yogurt',
    'cereals': 'cereal'
  };
  
  // Return normalized form if mapping exists, otherwise return original
  const result = pluralToSingular[normalized] || normalized;
  console.log(`[normalizeProductName] ${productName} → ${result}`);
  return result;
}

/**
 * Safely parse JSON blocks returned by LLMs (tries direct parse, then extracts first JSON object)
 */
export function safeParseJson<T = any>(text: string): T | null {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text) as T;
  } catch (_e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch (_e2) {
      return null;
    }
  }
}

/**
 * Enhanced product information extraction using LLM
 * Wrapper that provides caching support
 */
export async function extractProductInfo(
  content: string,
  llm: any,
  cache?: { get: (key: string) => any; set: (key: string, value: any) => void }
): Promise<ProductInfo | null> {
  // Use cache if provided
  if (cache) {
    const key = `extract:${String(content || '').slice(0, 1000)}`;
    const cached = cache.get(key);
    if (cached !== undefined) return JSON.parse(JSON.stringify(cached));
    
    const res = await extractProductInfoImpl(content, llm);
    cache.set(key, res);
    return res;
  }
  
  // No cache - direct call
  return await extractProductInfoImpl(content, llm);
}
