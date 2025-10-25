import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
// SupervisorState type import removed to avoid circular/type issues - use `any` for state
import { BaseMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

// Use a smaller/cheaper model for planning to save cost and reduce latency.
// Planner only drafts structured JSON plans and does NOT call agents/tools.
// Lazily initialize the LLM so tests (without API keys) don't throw on module load.
let plannerLlm: any = null;
function getPlannerLlm() {
  if (plannerLlm) return plannerLlm;
  try {
    // Try to instantiate a real ChatOpenAI client. This may throw if no API key is present.
    plannerLlm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.0, maxRetries: 1 });
    return plannerLlm;
  } catch (e) {
    // Fallback mock for test environments: deterministic minimal API compatible object
    plannerLlm = {
      invoke: async (msgs: any) => {

        // Return a conservative recommendation - delegate for safety
        return { content: JSON.stringify({ action: 'delegate', confidence: 0.5, reasoning: 'fallback mock - delegating for safety' }) };
      }
    };
    return plannerLlm;
  }
}

// Simple in-memory TTL cache for planner outputs. Replace with Redis in prod.
type CacheEntry = { value: any; expiresAt: number };
const plannerCache = new Map<string, CacheEntry>();
// Simple in-memory metrics for planner cache and invalidations
const plannerMetrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  delegations: 0,
  directResponses: 0,
  totalConfidence: 0,
  classificationCount: 0,
};
function getPlannerCache(key: string) {
  const e = plannerCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    plannerCache.delete(key);
    plannerMetrics.misses += 1;
    return null;
  }
  plannerMetrics.hits += 1;
  return e.value;
}
function setPlannerCache(key: string, value: any, ttlMs = 1000 * 30) {
  plannerCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  plannerMetrics.sets += 1;
}

// Exported helper to invalidate planner cache entries by prefix (e.g., user or conversation)
export function invalidatePlannerCacheByPrefix(prefix: string) {
  for (const k of Array.from(plannerCache.keys())) {
    if (k.startsWith(prefix)) {
      plannerCache.delete(k);
      plannerMetrics.invalidations += 1;
    }
  }
}

// Exported helper to clear entire planner cache (dev/testing)
export function clearPlannerCache() {
  plannerCache.clear();
}

// Expose simple metrics getters for observability (in-memory)
export function getPlannerMetrics() {
  return { ...plannerMetrics };
}

export function resetPlannerMetrics() {
  plannerMetrics.hits = 0;
  plannerMetrics.misses = 0;
  plannerMetrics.sets = 0;
  plannerMetrics.invalidations = 0;
  plannerMetrics.delegations = 0;
  plannerMetrics.directResponses = 0;
  plannerMetrics.totalConfidence = 0;
  plannerMetrics.classificationCount = 0;
}

// Helper to get average confidence
export function getPlannerAverageConfidence() {
  if (plannerMetrics.classificationCount === 0) return 0;
  return plannerMetrics.totalConfidence / plannerMetrics.classificationCount;
}

const plannerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a routing classifier for an online grocery shopping system.

TASK: Classify if the user's request is grocery-related, considering conversation context.

CURRENT CONVERSATION STATE (if provided):
- Workflow Context: {workflowContext}
- Pending Product: {pendingProduct}
- Deal Status: {dealStatus}

OUTPUT FORMAT: Return valid JSON with these fields:
- action: either "delegate" or "direct_response"
- confidence: number between 0.0 and 1.0
- reasoning: brief explanation of your decision
- task: response text (only required for direct_response action)
- autoApplyIntent: boolean (true if user wants automatic deal application without confirmation)

AUTO-APPLY INTENT DETECTION:
Set autoApplyIntent=true when user indicates they want automatic deal application:
- Phrases like: "just take/use/apply any deal", "use the deal", "apply it/them"
- Conditional auto-apply: "if there's a deal, use it", "apply any deals available"
- Implicit acceptance: "yes, apply", "sure, use it", "go ahead"
- NOT auto-apply: simple questions like "check deals", "are there deals", or ambiguous requests

CLASSIFICATION RULES:
1. action="delegate" → Request involves ANY aspect of grocery shopping
   - Product search, browsing catalog, finding items
   - Deals, promotions, discounts, savings
   - Shopping cart operations (add, remove, view, update)
   - Checkout, payment, order placement
   - Product information, availability, prices
   - Delivery, pickup, order tracking
   - Store information related to shopping
   - Greetings in shopping context
   - **Continuation responses (yes/no) when workflowContext is set**

2. action="direct_response" → Request is NOT about grocery shopping
   - Unrelated topics (weather, jokes, news, general knowledge)
   - Small talk not connected to shopping
   - Provide polite response in "task" field

CONTEXT AWARENESS:
- If workflowContext="awaiting_deal_confirmation" and user says yes/no/similar → ALWAYS delegate
- If workflowContext="add_to_cart_with_deals" or "check_deals" → ALWAYS delegate
- If pendingProduct exists → User is in middle of transaction, delegate
- If dealStatus="pending" → User is considering a deal, delegate

EXAMPLES:
Input: "Find organic bananas"
Output: {{"action": "delegate", "confidence": 1.0, "reasoning": "product search"}}

Input: "Add milk to cart"
Output: {{"action": "delegate", "confidence": 1.0, "reasoning": "cart operation", "autoApplyIntent": false}}

Input: "Add apples and just use any deals available"
Output: {{"action": "delegate", "confidence": 1.0, "reasoning": "cart with auto-apply", "autoApplyIntent": true}}

Input: "If there's a deal on bananas, apply it and add to cart"
Output: {{"action": "delegate", "confidence": 1.0, "reasoning": "conditional auto-apply", "autoApplyIntent": true}}

Input: "yes" [Context: awaiting_deal_confirmation=true]
Output: {{"action": "delegate", "confidence": 1.0, "reasoning": "continuation - confirming deal", "autoApplyIntent": false}}

Input: "no thanks" [Context: awaiting_deal_confirmation=true]
Output: {{"action": "delegate", "confidence": 1.0, "reasoning": "continuation - declining deal", "autoApplyIntent": false}}

Input: "Hello"
Output: {{"action": "delegate", "confidence": 0.95, "reasoning": "greeting in shopping context", "autoApplyIntent": false}}

Input: "What's the weather?"
Output: {{"action": "direct_response", "confidence": 0.95, "reasoning": "unrelated to grocery", "task": "I can only help with grocery shopping. What would you like to add to your cart?"}}

Be decisive: grocery-related OR continuation = delegate, not grocery-related = direct_response.`,
  ],
  ["placeholder", "{messages}"],
]);

const planner = async (state: any) => {
  console.log("---PLANNER---");
  const { messages, workflowContext, pendingProduct, dealData } = state;
  
  // Debug logging
  console.log(`[planner] Received state with ${Array.isArray(messages) ? messages.length : 0} messages`);
  console.log(`[planner] Context: workflowContext=${workflowContext}, pendingProduct=${!!pendingProduct}, dealData=${!!dealData}`);
  if (Array.isArray(messages) && messages.length > 0) {
    console.log(`[planner] First message type:`, messages[0]?.constructor?.name, messages[0]?.message?.constructor?.name);
  }

  // Build context string for prompt
  const contextString = workflowContext || 'none';
  const pendingProductString = pendingProduct 
    ? `${pendingProduct.product} (qty: ${pendingProduct.quantity || 1})`
    : 'none';
  const dealStatusString = dealData?.pending 
    ? 'pending' 
    : dealData?.applied 
    ? 'applied' 
    : 'none';

  // Build a lightweight cache key from recent messages + conversation context
  const userId = (state && state.userId) ? String((state as any).userId) : 'anon';
  const convId = (state && state.conversationId) ? String((state as any).conversationId) : 'global';
  const contextKey = `${contextString}:${pendingProductString}:${dealStatusString}`;
  const key = `${userId}:${convId}:${contextKey}:${messages.slice(-6).map((m: any) => typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message)).join('|')}`;
  const cached = getPlannerCache(key);
  if (cached) {
    console.log('[planner] Returning cached plan');
    return cached;
  }

  // Extract and validate messages for LLM prompt
  // Handle both annotated messages (with .message wrapper) and direct BaseMessage objects
  const extractedMessages = messages.slice(-6).map((m: any) => {
    // If it's already a BaseMessage, use it directly
    if (m && m.content !== undefined && (m.constructor?.name?.includes('Message') || m.lc_namespace)) {
      return m;
    }
    // If it's an annotated message with .message property
    if (m && m.message && m.message.content !== undefined) {
      return m.message;
    }
    // Skip invalid entries
    return null;
  }).filter(Boolean);

  console.log(`[planner] Extracted ${extractedMessages.length} valid messages for LLM`);
  
  // Debug: Show the actual message contents being sent to LLM
  if (extractedMessages.length > 0) {
    console.log('[planner] Message contents being sent to LLM:');
    extractedMessages.forEach((msg: any, idx: number) => {
      console.log(`  [${idx}] ${msg.constructor?.name}: "${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}"`);
    });
  }

  if (extractedMessages.length === 0) {
    console.warn('[planner] No valid messages found, returning delegate fallback');
    const fallbackPlan = {
      action: 'delegate',
      confidence: 0.5,
      reasoning: 'No valid messages to analyze'
    };
    const normalized = new AIMessage(JSON.stringify(fallbackPlan));
    return {
      messages: [{
        message: normalized,
        role: 'assistant',
        agent: 'planner',
        timestamp: Date.now(),
        planningRecommendation: fallbackPlan,
      }],
    };
  }

  // Use the detailed plannerPrompt template with all examples and instructions
  let response;
  try {
    response = await plannerPrompt.pipe(getPlannerLlm()).invoke({
      messages: extractedMessages,
      workflowContext: contextString,
      pendingProduct: pendingProductString,
      dealStatus: dealStatusString
    });
    console.log("[planner] Raw LLM response:", JSON.stringify(response, null, 2));
    const responseContent = (response as any)?.content;
    console.log("[planner] LLM response content:", typeof responseContent === 'string' ? responseContent : JSON.stringify(responseContent));
  } catch (invokeError: any) {
    console.error('[planner] Error invoking LLM:', invokeError);
    console.error('[planner] Error details:', {
      message: invokeError.message,
      code: invokeError.lc_error_code,
      extractedMessagesCount: extractedMessages.length,
      extractedMessagesSample: extractedMessages.slice(0, 2).map((m: any) => ({
        type: m?.constructor?.name,
        hasContent: !!m?.content,
        contentType: typeof m?.content
      }))
    });
    
    // Return fallback on invoke error
    const fallbackPlan = {
      action: 'delegate',
      confidence: 0.5,
      reasoning: `LLM invocation error: ${invokeError.message}`
    };
    const normalized = new AIMessage(JSON.stringify(fallbackPlan));
    return {
      messages: [{
        message: normalized,
        role: 'assistant',
        agent: 'planner',
        timestamp: Date.now(),
        planningRecommendation: fallbackPlan,
      }],
    };
  }

  // Try to parse JSON output from the LLM. If parsing fails, fall back to a
  // conservative recommendation to supervisor with low confidence.
  let plan: { action: string; recommendedAgent?: string; targetAgent?: string; task?: string; confidence: number; reasoning: string } | null = null;
  const textContent = response && typeof (response as any).content === 'string' ? (response as any).content : '';
  const text = textContent || JSON.stringify(response || '');
  
  console.log('[planner] Attempting to parse text:', text.slice(0, 500));
  
  try {
    // Extract first JSON object from text if necessary
    const jsonStart = text.indexOf('{');
    const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text;
    console.log('[planner] Extracted JSON text:', jsonText.slice(0, 500));
    plan = JSON.parse(jsonText);
    console.log('[planner] Parsed plan:', JSON.stringify(plan, null, 2));
  } catch (e) {
    console.error('[planner] Failed to parse plan JSON, returning fallback recommendation', e);
    plan = {
      action: 'delegate',
      task: text.slice(0, 1000),
      confidence: 0.5,
      reasoning: 'Could not parse JSON plan from planner LLM; delegating for safety.'
    };
  }

  // Ensure plan object exists and normalize
  if (!plan) {
    plan = {
      action: 'delegate',
      task: text.slice(0, 1000),
      confidence: 0.5,
      reasoning: 'Planner returned no plan; delegating for safety.'
    };
  }

  plan.confidence = Math.max(0, Math.min(1, (plan.confidence as number) || 0.5));
  plan.action = (plan.action as string) || 'delegate';
  plan.reasoning = (plan.reasoning as string) || '';
  
  // Runtime JSON-schema validation & normalization for planner recommendation
  function validateAndNormalizePlan(input: any) {
    const allowedActions = ['direct_response', 'delegate'];
    
    if (!input || typeof input !== 'object') {
      return {
        valid: false,
        plan: {
          action: 'delegate',
          task: typeof input === 'string' ? input.slice(0, 1000) : JSON.stringify(input).slice(0, 1000),
          confidence: 0.5,
          reasoning: 'Invalid planner output format'
        }
      };
    }

    const rawAction = typeof input.action === 'string' ? input.action.toLowerCase() : undefined;
    if (!rawAction || !allowedActions.includes(rawAction)) {
      return {
        valid: false,
        plan: {
          action: 'delegate',
          task: (input.task && String(input.task).slice(0, 1000)) || JSON.stringify(input).slice(0, 1000),
          confidence: 0.5,
          reasoning: 'Planner returned invalid or missing action'
        }
      };
    }

    const normalizedPlan: any = {
      action: rawAction,
      task: typeof input.task === 'string' ? input.task : (input.task ? String(input.task) : undefined),
      confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 0.5,
      reasoning: typeof input.reasoning === 'string' ? input.reasoning : (input.reasoning ? String(input.reasoning) : ''),
      autoApplyIntent: typeof input.autoApplyIntent === 'boolean' ? input.autoApplyIntent : false
    };

    // If direct_response, ensure there's at least some text in 'task' or 'reasoning'
    if (normalizedPlan.action === 'direct_response' && !normalizedPlan.task && !normalizedPlan.reasoning) {
      normalizedPlan.action = 'delegate';
      normalizedPlan.confidence = Math.min(normalizedPlan.confidence, 0.6);
      normalizedPlan.reasoning = 'Converted to delegate because direct_response lacked content';
      return { valid: false, plan: normalizedPlan };
    }

    // Apply confidence-based fallback for low confidence classifications
    if (normalizedPlan.confidence < 0.7 && normalizedPlan.action === 'direct_response') {
      console.log(`[planner] Low confidence (${normalizedPlan.confidence}) for direct_response, converting to delegate for safety`);
      normalizedPlan.action = 'delegate';
      normalizedPlan.reasoning = `Low confidence classification - delegating for safety. Original: ${normalizedPlan.reasoning}`;
    }

    return { valid: true, plan: normalizedPlan };
  }

  const { valid, plan: finalPlan } = validateAndNormalizePlan(plan);
  
  console.log('[planner] Final normalized plan:', JSON.stringify(finalPlan, null, 2));
  
  // Update metrics
  plannerMetrics.classificationCount += 1;
  plannerMetrics.totalConfidence += finalPlan.confidence;
  if (finalPlan.action === 'delegate') {
    plannerMetrics.delegations += 1;
  } else if (finalPlan.action === 'direct_response') {
    plannerMetrics.directResponses += 1;
  }

  // Package as an AIMessage with planning recommendation (not executable delegation)
  // The planner only provides recommendations - supervisor handles all delegation
  const normalized = new AIMessage(JSON.stringify(finalPlan));

  const resultPayload = {
    messages: [
      {
        message: normalized,
        role: 'assistant',
        agent: 'planner',
        timestamp: Date.now(),
        planningRecommendation: finalPlan, // Also stored in message metadata for compatibility
      },
    ],
    // CRITICAL: Return plannerRecommendation as top-level state field so it propagates through LangGraph
    plannerRecommendation: finalPlan,
  };

  // Cache the normalized planner output for short-term reuse
  try {
    setPlannerCache(key, resultPayload, 1000 * 30);
  } catch (e) {
    console.warn('[planner] Failed to set cache', e);
  }

  return resultPayload;
};

export { planner };

// Test helpers
export function __setPlannerLlmForTests(mock: any) {
  plannerLlm = mock;
}

export function __resetPlannerLlmForTests() {
  plannerLlm = null;
}
