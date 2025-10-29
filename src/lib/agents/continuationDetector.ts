/**
 * Continuation Intent Detection Implementation
 * 
 * This module provides the core LLM-based continuation intent detection
 * functionality that was referenced but missing from the original codebase.
 */

import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

export interface ContinuationAnalysis {
  isContinuation: boolean;
  continuationType?: string;
  targetAgent?: string;
  confidence: number;
  reasoning: string;
}

export interface AnnotatedMessage {
  message: HumanMessage | AIMessage | SystemMessage;
  role: string;
  agent?: string;
  timestamp: number;
}

/**
 * Cache for continuation analysis results to avoid duplicate LLM calls
 */
const continuationCache = new Map<string, ContinuationAnalysis>();

/**
 * Core implementation of continuation intent detection using LLM
 */
async function detectContinuationIntentImpl(
  message: string,
  messages: Array<AnnotatedMessage>,
  workflowContext?: string,
  dealData?: any,
  pendingProduct?: any,
  llm?: any
): Promise<ContinuationAnalysis> {
  
  // Ensure messages is a valid array
  const safeMessages = Array.isArray(messages) ? messages : [];
  
  // Create cache key
  const fingerprint = [
    String(message || '').slice(0, 1000),
    workflowContext || '',
    JSON.stringify(pendingProduct || {}).slice(0, 300),
    JSON.stringify(dealData || {}).slice(0, 300),
    messages.slice(-6).map(m => {
      if (!m || !m.message || !m.message.content) return '';
      const content = m.message.content;
      return typeof content === 'string' ? content : JSON.stringify(content);
    }).join('|').slice(0, 1000)
  ].join('||');

  const cacheKey = `continuation:${fingerprint}`;
  
  // Check cache first
  if (continuationCache.has(cacheKey)) {
    const cached = continuationCache.get(cacheKey)!;
    return JSON.parse(JSON.stringify(cached));
  }

  try {
    // If no LLM provided, return a basic heuristic-based analysis
    if (!llm) {
      return basicHeuristicAnalysis(message, workflowContext, dealData, pendingProduct);
    }

    // Build context-aware prompt for LLM analysis
    const systemPrompt = buildContinuationAnalysisPrompt(workflowContext, dealData, pendingProduct);
    const userPrompt = `Analyze this user message for continuation intent: "${message}"

Recent conversation context:
${safeMessages.slice(-3).map(m => {
  if (!m || !m.message || !m.message.content) return `${m?.role || 'unknown'}: [empty]`;
  const content = m.message.content;
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  return `${m.role}: ${contentStr}`;
}).join('\\n')}

Respond with a JSON object containing:
- isContinuation: boolean
- continuationType: string (deal_confirmation, checkout_flow, add_to_cart, or other)
- targetAgent: string (cart_and_checkout, deals, catalog, payment)
- confidence: number (0.0-1.0)
- reasoning: string`;

    // Call LLM for analysis
    const response = await llm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Parse LLM response
    const analysisResult = parseLLMResponse(response.content);
    
    // Cache the result
    continuationCache.set(cacheKey, analysisResult);
    
    return analysisResult;
    
  } catch (error) {
    console.warn('[detectContinuationIntentImpl] LLM analysis failed, falling back to heuristics:', error);
    return basicHeuristicAnalysis(message, workflowContext, dealData, pendingProduct);
  }
}

/**
 * Build context-aware system prompt for continuation analysis
 */
function buildContinuationAnalysisPrompt(workflowContext?: string, dealData?: any, pendingProduct?: any): string {
  let prompt = `You are an expert at detecting user intent continuation in conversational AI workflows.

Current workflow context: ${workflowContext || 'none'}
Pending product: ${pendingProduct ? JSON.stringify(pendingProduct) : 'none'}
Deal data available: ${dealData ? 'yes' : 'no'}

Your task is to determine if a user message represents a continuation of an existing workflow or a new request.

Key patterns:
- Affirmative responses (yes, sure, ok, apply, take it) in deal contexts = deal_confirmation
- Checkout keywords (buy, purchase, checkout, pay) = checkout_flow  
- Adding items after deals/products discussed = add_to_cart
- Navigation or new topics = not continuation

Be precise and confident in your analysis.`;

  return prompt;
}

/**
 * Parse LLM response into structured analysis
 */
function parseLLMResponse(content: string): ContinuationAnalysis {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isContinuation: !!parsed.isContinuation,
        continuationType: parsed.continuationType || 'other',
        targetAgent: parsed.targetAgent || 'catalog',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'LLM analysis'
      };
    }
  } catch (error) {
    console.warn('[parseLLMResponse] Failed to parse JSON:', error);
  }

  // Fallback to heuristic parsing
  const lower = content.toLowerCase();
  if (lower.includes('continuation') && lower.includes('true')) {
    return {
      isContinuation: true,
      continuationType: 'other',
      targetAgent: 'catalog',
      confidence: 0.7,
      reasoning: 'Parsed from LLM text response'
    };
  }

  return {
    isContinuation: false,
    continuationType: 'new_request',
    targetAgent: 'catalog',
    confidence: 0.6,
    reasoning: 'Could not parse LLM response, assuming new request'
  };
}

/**
 * Basic heuristic analysis when LLM is not available
 */
function basicHeuristicAnalysis(
  message: string,
  workflowContext?: string,
  dealData?: any,
  pendingProduct?: any
): ContinuationAnalysis {
  
  const lower = message.toLowerCase().trim();
  const words = lower.split(/\\s+/);
  
  // Deal confirmation patterns
  if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
    const affirmativePatterns = ['yes', 'sure', 'ok', 'okay', 'apply', 'take', 'sounds', 'great', 'perfect', 'good', 'deal', 'go'];
    const hasAffirmative = affirmativePatterns.some(pattern => 
      words.some(word => word.includes(pattern) || pattern.includes(word))
    );
    
    if (hasAffirmative) {
      return {
        isContinuation: true,
        continuationType: 'deal_confirmation',
        targetAgent: 'cart_and_checkout',
        confidence: 0.85,
        reasoning: 'Affirmative response in deal confirmation context'
      };
    }
  }
  
  // Checkout flow patterns  
  const checkoutKeywords = ['checkout', 'buy', 'purchase', 'pay', 'order', 'complete'];
  if (checkoutKeywords.some(keyword => lower.includes(keyword))) {
    return {
      isContinuation: true,
      continuationType: 'checkout_flow',
      targetAgent: 'cart_and_checkout', 
      confidence: 0.9,
      reasoning: 'Checkout keywords detected'
    };
  }
  
  // Add to cart patterns
  const cartKeywords = ['add', 'cart'];
  if (cartKeywords.every(keyword => lower.includes(keyword)) && pendingProduct) {
    return {
      isContinuation: true,
      continuationType: 'add_to_cart',
      targetAgent: 'cart_and_checkout',
      confidence: 0.8,
      reasoning: 'Add to cart with pending product'
    };
  }
  
  // Default: not a continuation
  return {
    isContinuation: false,
    continuationType: 'new_request',
    targetAgent: 'catalog',
    confidence: 0.6,
    reasoning: 'No continuation patterns detected'
  };
}

/**
 * Clear cache for testing
 */
export function __clearContinuationDetectorCacheForTests(): void {
  continuationCache.clear();
}

export default detectContinuationIntentImpl;