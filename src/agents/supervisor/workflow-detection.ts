/**
 * Workflow detection utilities for the Supervisor Agent
 */

import detectContinuationIntentImpl from '../../lib/agents/continuationDetector';
import { WorkflowDetectionResult, ContinuationAnalysis, AnnotatedMessage } from './types';

/**
 * Helper function to detect complex multi-step workflows
 */
export function detectComplexWorkflow(messageContent: string): WorkflowDetectionResult {
  const lowerContent = messageContent.toLowerCase();
  
  // Detect if checkout is mentioned
  const hasCheckout = lowerContent.includes('checkout') || 
                      lowerContent.includes('check out') || 
                      lowerContent.includes('place order') ||
                      lowerContent.includes('complete order') ||
                      (lowerContent.includes('then') && (lowerContent.includes('continue') || lowerContent.includes('proceed'))) ||
                      (lowerContent.includes('just') && lowerContent.includes('continue'));
  
  // Pattern 1: "check/find deals + add to cart" type queries
  const dealsAndCartPattern = (
    (lowerContent.includes('check') || lowerContent.includes('find') || lowerContent.includes('look')) &&
    (lowerContent.includes('deal') || lowerContent.includes('promotion') || lowerContent.includes('discount') || lowerContent.includes('sale')) &&
    (lowerContent.includes('add') && lowerContent.includes('cart'))
  );
  
  // Pattern 2: Conditional workflows with "if" statements
  const conditionalPattern = (
    lowerContent.includes('if') &&
    (lowerContent.includes('deal') || lowerContent.includes('discount') || lowerContent.includes('sale') || lowerContent.includes('promotion')) &&
    (lowerContent.includes('add') || lowerContent.includes('buy') || lowerContent.includes('purchase'))
  );
  
  // Pattern 3: "and" connecting multiple actions
  const multiActionPattern = (
    lowerContent.includes(' and ') &&
    ((lowerContent.includes('deal') || lowerContent.includes('promotion') || lowerContent.includes('discount')) &&
     (lowerContent.includes('add') || lowerContent.includes('cart')))
  );
  
  if (dealsAndCartPattern) {
    return {
      isComplex: true,
      workflowType: hasCheckout ? 'deals_to_cart_to_checkout' : 'deals_to_cart',
      reason: hasCheckout 
        ? 'User wants to check deals, add to cart, and proceed to checkout automatically'
        : 'User wants to check deals first, then add to cart based on availability',
      includesCheckout: hasCheckout
    };
  }
  
  if (conditionalPattern) {
    return {
      isComplex: true,
      workflowType: hasCheckout ? 'conditional_purchase_with_checkout' : 'conditional_purchase',
      reason: hasCheckout
        ? 'User wants conditional action based on deal availability with automatic checkout'
        : 'User wants conditional action based on deal availability',
      includesCheckout: hasCheckout
    };
  }
  
  if (multiActionPattern) {
    return {
      isComplex: true,
      workflowType: hasCheckout ? 'multi_step_purchase_with_checkout' : 'multi_step_purchase',
      reason: hasCheckout
        ? 'User wants multiple coordinated actions (deals check + cart addition + checkout)'
        : 'User wants multiple coordinated actions (deals check + cart addition)',
      includesCheckout: hasCheckout
    };
  }
  
  return { isComplex: false, includesCheckout: false };
}

/**
 * Detect continuation intent using LLM analysis
 * Wrapper that provides caching support
 */
export async function detectContinuationIntent(
  message: string,
  messages: Array<AnnotatedMessage>,
  workflowContext: string | undefined,
  dealData: any,
  pendingProduct: any,
  llm: any,
  cache?: { get: (key: string) => any; set: (key: string, value: any) => void }
): Promise<ContinuationAnalysis> {
  // Use cache if provided
  if (cache) {
    // Ensure messages is a valid array before processing
    const safeMessages = Array.isArray(messages) ? messages : [];
    const fingerprint = [
      String(message || '').slice(0, 1000),
      workflowContext || '',
      JSON.stringify(pendingProduct || {}).slice(0, 300),
      JSON.stringify(dealData || {}).slice(0, 300),
      safeMessages.slice(-6).map(m => {
        if (!m || !m.message || !m.message.content) return '';
        return typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content);
      }).join('|').slice(0, 1000)
    ].join('||');

    const key = `continuation:${fingerprint}`;
    const cached = cache.get(key);
    if (cached !== undefined) return JSON.parse(JSON.stringify(cached));

    const res = await detectContinuationIntentImpl(message, messages, workflowContext, dealData, pendingProduct, llm);
    cache.set(key, res);
    return res;
  }
  
  // No cache - direct call
  return await detectContinuationIntentImpl(message, messages, workflowContext, dealData, pendingProduct, llm);
}
