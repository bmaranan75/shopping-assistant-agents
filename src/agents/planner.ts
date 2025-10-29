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
    `You are a routing classifier for a grocery shopping assistant.

TASK: Analyze the user's message and return a JSON classification.

CONTEXT (if provided):
- Workflow: {workflowContext}
- Pending Product: {pendingProduct}
- Deal Status: {dealStatus}

OUTPUT: JSON object with:
- action: "delegate" | "direct_response"
- confidence: 0.0-1.0
- reasoning: brief explanation
- task: response text (direct_response only)
- autoApplyIntent: boolean (deal auto-apply flag)

CLASSIFICATION LOGIC:

1. DEAL CONFIRMATION (highest priority when dealStatus="pending" OR workflowContext="awaiting_deal_confirmation"):
   - Affirmative words ("yes", "sure", "ok", "okay", "sounds good", "go ahead", "please") → autoApplyIntent=true
   - Negative words ("no", "not", "skip", "decline", "no thanks") → autoApplyIntent=false
   - All deal confirmations: action="delegate"

2. AUTO-APPLY DETECTION (when dealStatus != "pending"):
   - Explicit: "use any deals", "apply the deal", "go ahead with deal" → autoApplyIntent=true
   - Conditional: "if there's a deal, use it", "apply deals available" → autoApplyIntent=true
   - Questions only: "check deals", "are there deals?" → autoApplyIntent=false

3. DELEGATE (grocery shopping requests):
   - Products: search, browse, find items
   - Deals: check, apply, inquire about savings
   - Cart: add, remove, view, update
   - Checkout: payment, order, delivery
   - Context: ANY workflowContext is set OR pendingProduct exists → ALWAYS delegate
   - Greetings: in shopping context → delegate

4. DIRECT_RESPONSE (non-grocery):
   - Weather, news, jokes, unrelated topics
   - Provide helpful redirect in "task" field

EXAMPLES:
{{"action": "delegate", "confidence": 1.0, "reasoning": "product search"}}
// "Find organic bananas"

{{"action": "delegate", "confidence": 1.0, "reasoning": "cart with auto-apply", "autoApplyIntent": true}}
// "Add apples and use any deals"

{{"action": "delegate", "confidence": 1.0, "reasoning": "deal confirmation", "autoApplyIntent": true}}
// "yes" [when dealStatus=pending]

{{"action": "delegate", "confidence": 1.0, "reasoning": "deal declined", "autoApplyIntent": false}}
// "no thanks" [when awaiting_deal_confirmation]

{{"action": "direct_response", "confidence": 0.95, "reasoning": "unrelated", "task": "I help with grocery shopping. What would you like?"}}
// "What's the weather?"

Default: When in doubt, delegate with moderate confidence.`,
  ],
  ["placeholder", "{messages}"],
]);

const planner = async (state: any) => {
  console.log("---PLANNER---");
  
  // Safety check for invalid state
  if (!state || typeof state !== 'object') {
    console.error('[planner] Invalid state received:', state);
    return {
      messages: [],
      planningRecommendation: {
        action: 'direct_response',
        task: 'Hello! How can I help you today?',
        reasoning: 'Invalid state - providing default response'
      }
    };
  }
  
  const { messages: rawMessages, workflowContext, pendingProduct, dealData } = state;
  
  // CRITICAL FIX: Convert raw LangChain messages to AnnotatedMessage format
  // This handles the case where LangGraph client sends standard messages directly
  let messages = rawMessages;
  if (Array.isArray(rawMessages) && rawMessages.length > 0) {
    // Check if messages are already in AnnotatedMessage format
    const firstMsg = rawMessages[0];
    if (!firstMsg.role || !firstMsg.message) {
      // Convert standard LangChain messages to AnnotatedMessage format
      console.log('[planner] Converting standard messages to AnnotatedMessage format');
      messages = rawMessages.map((msg, idx) => {
        console.log(`[planner] Converting message ${idx}:`, {
          type: msg?.type,
          constructor: msg?.constructor?.name,
          content: msg?.content?.toString().substring(0, 50)
        });
        
        // Create proper AnnotatedMessage structure
        if (msg.type === 'human' || msg.constructor?.name === 'HumanMessage') {
          return {
            message: msg,
            role: 'user',
            timestamp: Date.now()
          };
        }
        if (msg.type === 'ai' || msg.constructor?.name === 'AIMessage') {
          return {
            message: msg,
            role: 'assistant',
            timestamp: Date.now()
          };
        }
        if (msg.type === 'system' || msg.constructor?.name === 'SystemMessage') {
          return {
            message: msg,
            role: 'system',
            timestamp: Date.now()
          };
        }
        
        // Fallback: treat as user message
        return {
          message: msg,
          role: 'user',
          timestamp: Date.now()
        };
      });
    }
  }
  
  // Debug logging
  console.log(`[planner] Received state with ${Array.isArray(messages) ? messages.length : 0} messages`);
  console.log(`[planner] Context: workflowContext=${workflowContext}, pendingProduct=${!!pendingProduct}, dealData=${!!dealData}`);
  if (Array.isArray(messages) && messages.length > 0) {
    console.log(`[planner] First message type:`, messages[0]?.constructor?.name, messages[0]?.message?.constructor?.name);
  }

  // Detailed message inspection
  console.log('[planner] === DETAILED MESSAGE INSPECTION ===');
  if (Array.isArray(messages)) {
    messages.forEach((msg, idx) => {
      console.log(`[planner] Message ${idx}:`, {
        hasMessage: !!msg?.message,
        hasContent: !!(msg?.message && msg?.message.content),
        role: msg?.role || 'undefined',
        messageType: msg?.message?.constructor?.name || 'unknown',
        content: msg?.message?.content ? String(msg?.message?.content).substring(0, 100) : 'no content',
        fullMsgStructure: JSON.stringify(msg, null, 2).substring(0, 500)
      });
    });
  } else {
    console.log('[planner] Messages is not an array:', typeof messages, messages);
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
  
  // Safe message handling with null checks
  const safeMessages = Array.isArray(messages) ? messages : [];
  const key = `${userId}:${convId}:${contextKey}:${safeMessages.slice(-6).map((m: any) => typeof m.message?.content === 'string' ? m.message.content : JSON.stringify(m.message || m)).join('|')}`;
  const cached = getPlannerCache(key);
  if (cached) {
    console.log('[planner] Returning cached plan');
    return cached;
  }

  // Extract and validate messages for LLM prompt
  // Handle both annotated messages (with .message wrapper) and direct BaseMessage objects
  const extractedMessages = safeMessages.slice(-6).map((m: any) => {
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
    
    // Include converted messages if they exist
    const messagesToReturn: any[] = [];
    if (rawMessages !== messages && Array.isArray(messages)) {
      messagesToReturn.push(...messages);
    }
    messagesToReturn.push({
      message: normalized,
      role: 'assistant',
      agent: 'planner',
      timestamp: Date.now(),
      planningRecommendation: fallbackPlan,
    });
    
    return {
      messages: messagesToReturn,
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
    
    // Include converted messages if they exist
    const messagesToReturn: any[] = [];
    if (rawMessages !== messages && Array.isArray(messages)) {
      messagesToReturn.push(...messages);
    }
    messagesToReturn.push({
      message: normalized,
      role: 'assistant',
      agent: 'planner',
      timestamp: Date.now(),
      planningRecommendation: fallbackPlan,
    });
    
    return {
      messages: messagesToReturn,
      plannerRecommendation: fallbackPlan,
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

  // CRITICAL FIX: Include converted user messages in the return payload
  // If messages were converted from standard format to AnnotatedMessage format,
  // we need to return them so they persist in the state for downstream agents
  const messagesToReturn: any[] = [];
  
  // Only include converted messages if they were actually converted (rawMessages !== messages)
  if (rawMessages !== messages && Array.isArray(messages)) {
    console.log(`[planner] Including ${messages.length} converted messages in return payload`);
    messagesToReturn.push(...messages);
  }
  
  // Always add the planner's response
  messagesToReturn.push({
    message: normalized,
    role: 'assistant',
    agent: 'planner',
    timestamp: Date.now(),
    planningRecommendation: finalPlan, // Also stored in message metadata for compatibility
  });

  const resultPayload = {
    messages: messagesToReturn,
    // CRITICAL: Return plannerRecommendation as top-level state field so it propagates through LangGraph
    plannerRecommendation: finalPlan,
    // CRITICAL: Preserve ALL state fields from input to maintain workflow continuity
    userId: state.userId,
    conversationId: state.conversationId,
    workflowContext: state.workflowContext,
    pendingProduct: state.pendingProduct,
    dealData: state.dealData,
    cartData: state.cartData,
    notificationData: state.notificationData,
    delegationDepth: state.delegationDepth,
  };

  console.log(`[planner] Returning ${messagesToReturn.length} messages total`);
  console.log(`[planner] Preserving state: workflowContext=${state.workflowContext}, pendingProduct=${!!state.pendingProduct}, dealData=${!!state.dealData}`);

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
