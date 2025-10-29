/**
 * Supervisor agent utilities for lib layer
 * Re-exports functions for testing and external use
 */

import { extractProductInfo as extractProductInfoFromSupervisor } from '../../agents/supervisor';

// Test utilities for mocking
let testLlm: any = null;

export function __setLlmForTests(llm: any): void {
  testLlm = llm;
}

export function __resetLlmForTests(): void {
  testLlm = null;
}

/**
 * Extract product information - uses test LLM if available
 */
export async function extractProductInfo(content: string) {
  if (testLlm) {
    // Use test LLM for testing
    const extractProductInfoImpl = (await import('./productExtractor')).default;
    return await extractProductInfoImpl(content, testLlm);
  }
  
  // Use the actual supervisor implementation
  return await extractProductInfoFromSupervisor(content);
}