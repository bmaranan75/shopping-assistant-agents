/**
 * CLEANED SUPERVISOR AGENT
 * 
 * This supervisor implements intelligent agent routing with LLM-based continuation detection.
 * 
 * Key Features:
 * - LLM-powered intent analysis for natural conversation flow
 * - Smart continuation detection for deal confirmations and checkout flows
 * - Simplified workflow management using context state
 * - Streamlined agent delegation without hardcoded keywords
 * 
 * Architecture:
 * - detectContinuationIntent(): Uses LLM to analyze user responses in context
 * - supervisor(): Main routing function with confidence-based decision making
 * - Agent nodes: Simplified handlers that focus on core functionality
 * 
 * Workflow Contexts:
 * - 'awaiting_deal_confirmation': User considering a deal offer
 * - 'add_to_cart_with_deals': Adding item with deal context
 * - 'check_deals': Checking for deals before adding to cart
 * - 'prepare_checkout'/'process_checkout': Checkout flow states
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { planner, invalidatePlannerCacheByPrefix } from './planner';
import { MIN_PLANNER_CONFIDENCE, MIN_CONTINUATION_CONFIDENCE } from './constants';

// Import specialized agent graphs for direct invocation
import { catalogGraph } from './catalog-agent';
import { cartAndCheckoutGraph } from './cart-and-checkout-agent';
import { dealsGraph } from './deals-agent';
import { paymentGraph } from './payment-agent';

// Import from refactored modules
import type { AnnotatedMessage, AgentRole } from './supervisor/types';
import { SupervisorState } from './supervisor/state';
import {
  annotateMessage,
  buildAgentContextMessage,
  createProgressMessage,
  getAgentProgressMessage
} from './supervisor/message-utils';
import {
  normalizeProductName,
  safeParseJson,
  extractProductInfo as extractProductInfoFromModule
} from './supervisor/product-utils';
import {
  detectComplexWorkflow,
  detectContinuationIntent as detectContinuationIntentFromModule
} from './supervisor/workflow-detection';
import {
  getLlm,
  SAFE_MIN_PLANNER_CONFIDENCE,
  SAFE_MIN_CONTINUATION_CONFIDENCE,
  getSupervisorLlmCache,
  setSupervisorLlmCache,
  invalidateSupervisorLlmCacheByPrefix,
  __clearSupervisorLlmCacheForTests,
  __setSupervisorLlmCacheEntryForTests,
  __setLlmForTests as __setLlmForTestsInternal,
  __resetLlmForTests as __resetLlmForTestsInternal
} from './supervisor/llm-utils';

// Re-export types for backwards compatibility
export type { AnnotatedMessage, AgentRole } from './supervisor/types';

export const routePlanner = (state: typeof SupervisorState.State) => {
  const { messages, delegationDepth = 0 } = state as any;
  const lastMessage = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null;

  console.log("[routePlanner] Processing planner response:", JSON.stringify(lastMessage, null, 2));

  // CRITICAL CHANGE: Planner provides routing recommendations
  // - direct_response: End workflow immediately with planner's response
  // - delegate: Route to supervisor for agent delegation
  
  // Check if this is a planner recommendation
  if (lastMessage && (lastMessage.planningRecommendation || lastMessage.delegation)) {
    const recommendation = lastMessage.planningRecommendation || lastMessage.delegation; // Support both for compatibility
    
    console.log(`[routePlanner] Received planner recommendation:`, recommendation);
    
    // Handle direct_response: Return the response immediately without supervisor
    if (recommendation.action === 'direct_response') {
      console.log('[routePlanner] Direct response action - ending workflow immediately');
      console.log('[routePlanner] Response:', recommendation.task || recommendation.reasoning);
      
      // Update the last message with the direct response content
      if (lastMessage.message && recommendation.task) {
        lastMessage.message.content = recommendation.task;
      }
      
      return END;
    }
    
    // Handle delegate: Route to supervisor for agent delegation decision
    if (recommendation.action === 'delegate') {
      console.log('[routePlanner] Delegate action - routing to supervisor');
      
      // Store the recommendation in state for supervisor to use
      try {
        (state as any).plannerRecommendation = recommendation;
        (state as any).delegationDepth = (delegationDepth as number) + 1;
        console.log(`[routePlanner] Stored recommendation and incremented delegationDepth → ${(state as any).delegationDepth}`);
      } catch (e) {
        console.warn('[routePlanner] Could not store recommendation on state', e);
      }
      
      return 'supervisor';
    }
    
    // Unknown action - default to supervisor for safety
    console.warn('[routePlanner] Unknown action type:', recommendation.action, '- routing to supervisor');
    return 'supervisor';
  }

  // Check for tool calls in the message
  if (!lastMessage || !("message" in lastMessage) || !("tool_calls" in lastMessage.message) || !lastMessage.message.tool_calls || lastMessage.message.tool_calls.length === 0) {
    return END;
  }

  const toolName = lastMessage.message.tool_calls[0].name;

  if (toolName === "direct_response") {
    // For direct response, we can end here since the planner already has the final answer
    console.log("[routePlanner] Direct response - ending workflow");
    return END;
  }
  if (toolName === "delegate_to_agent") {
    // This should be handled by the delegation check above, but fallback to supervisor
    console.log("[routePlanner] Delegation tool call detected, routing to supervisor");
    return "supervisor";
  }
  if (toolName === "generate_plan") {
    return "supervisor";
  }
  return END;
};

// LangGraph server configuration




// Re-export utility functions from modules for backwards compatibility
export { 
  annotateMessage,
  buildAgentContextMessage,
  normalizeProductName,
  safeParseJson,
  detectComplexWorkflow
};

// Re-export cache functions
export {
  __clearSupervisorLlmCacheForTests,
  __setSupervisorLlmCacheEntryForTests,
  invalidateSupervisorLlmCacheByPrefix
};

// Re-export LLM test helpers
export function __setLlmForTests(mock: any) {
  __setLlmForTestsInternal(mock);
}

export function __resetLlmForTests() {
  __resetLlmForTestsInternal();
}

// Wrapper functions with caching for backwards compatibility
export async function extractProductInfo(content: string) {
  const key = `extract:${String(content || '').slice(0, 1000)}`;
  const cached = getSupervisorLlmCache(key);
  if (cached !== undefined) return JSON.parse(JSON.stringify(cached));

  const res = await extractProductInfoFromModule(content, getLlm(), {
    get: getSupervisorLlmCache,
    set: setSupervisorLlmCache
  });
  return res;
}

export async function detectContinuationIntent(
  message: string,
  messages: Array<AnnotatedMessage>,
  workflowContext?: string,
  dealData?: any,
  pendingProduct?: any
) {
  return await detectContinuationIntentFromModule(
    message,
    messages,
    workflowContext,
    dealData,
    pendingProduct,
    getLlm(),
    {
      get: getSupervisorLlmCache,
      set: setSupervisorLlmCache
    }
  );
}

// Supervisor function to route requests
async function supervisor(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, cartData, workflowContext, dealData, pendingProduct, plannerRecommendation } = state as any;
  
  // Detect if this is an agent completion (agent returned to supervisor) or initial routing
  const lastMessage = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const isAgentCompletion = lastMessage && lastMessage.agent && lastMessage.agent !== 'supervisor' && lastMessage.agent !== 'user';
  
  let initialMessages = [];
  let timestampOffset = 0; // Used to ensure unique timestamps for progress messages
  
  if (isAgentCompletion) {
    // Agent has completed and returned to supervisor - add completion message
    let completionMessage;
    switch (lastMessage.agent) {
      case 'deals':
        if (dealData && dealData.applied) {
          completionMessage = createProgressMessage('🏷️ Found deals, proceeding...', 'supervisor');
        } else if (dealData && dealData.pending) {
          completionMessage = createProgressMessage('🏷️ Found deals, awaiting confirmation...', 'supervisor');
        } else {
          completionMessage = createProgressMessage('🏷️ Deal search completed...', 'supervisor');
        }
        break;
      case 'cart_and_checkout':
        if (workflowContext === 'process_checkout' || workflowContext === 'prepare_checkout') {
          completionMessage = createProgressMessage('💳 Checkout completed...', 'supervisor');
        } else {
          completionMessage = createProgressMessage('🛒 Added items to cart...', 'supervisor');
        }
        break;
      case 'catalog':
        completionMessage = createProgressMessage('🛍️ Catalog search completed...', 'supervisor');
        break;
      case 'payment':
        completionMessage = createProgressMessage('💳 Payment processing completed...', 'supervisor');
        break;
      case 'notification_agent':
        completionMessage = createProgressMessage('📧 Notifications sent...', 'supervisor');
        break;
      default:
        completionMessage = createProgressMessage('✅ Agent task completed...', 'supervisor');
    }
    completionMessage.timestamp = Date.now() + timestampOffset++;
    initialMessages.push(completionMessage);
  }
  
  // Add ephemeral routing/evaluation message at the start of supervisor processing
  const routingMessage = createProgressMessage(isAgentCompletion ? '🔄 Evaluating next steps...' : '🧠 Evaluating request...', 'supervisor');
  routingMessage.timestamp = Date.now() + timestampOffset++;
  initialMessages.push(routingMessage);
  
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const messageContent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';
  
  console.log(`[supervisor] Current workflow context: ${workflowContext}`);
  console.log(`[supervisor] Cart data available: ${!!cartData}`);
  console.log(`[supervisor] Deal data available: ${!!dealData}`);
  console.log(`[supervisor] Pending product: ${!!pendingProduct}`);
  console.log(`[supervisor] Planner recommendation:`, plannerRecommendation);
  
  // CRITICAL: Check for workflow context continuations BEFORE planner logic
  // The planner doesn't have visibility into workflowContext, so we must handle it here first
  
  // NEW: Handle post-checkout notification routing (Hub-and-Spoke pattern)
  if (workflowContext === 'send_notification') {
    console.log(`[supervisor] CONTEXT: Detected send_notification context, routing to notification_agent`);
    
    // Add user-facing checkout completion message BEFORE routing to notification
    const { notificationData } = state as any;
    const orderId = notificationData?.orderId || 'N/A';
    console.log(`[supervisor] Creating checkout completion message with orderId: ${orderId}`);
    console.log(`[supervisor] notificationData:`, JSON.stringify(notificationData, null, 2));
    
    const checkoutCompletionMessage = new AIMessage(
      `✅ Checkout completed successfully! Your order ID is: ${orderId}`
    );
    const annotatedCheckoutMessage = annotateMessage(
      checkoutCompletionMessage, 
      'assistant', 
      'supervisor'
    );
    annotatedCheckoutMessage.timestamp = Date.now() + timestampOffset++;
    
    console.log(`[supervisor] Checkout completion message created:`, {
      content: checkoutCompletionMessage.content,
      agent: annotatedCheckoutMessage.agent,
      role: annotatedCheckoutMessage.role,
      timestamp: annotatedCheckoutMessage.timestamp,
      hasProgressFlag: !!annotatedCheckoutMessage.progress,
      isEphemeral: annotatedCheckoutMessage.progress?.ephemeral
    });
    
    const notificationProgressMessage = getAgentProgressMessage('notification_agent', 'send_notification');
    notificationProgressMessage.timestamp = Date.now() + timestampOffset++;
    
    const finalMessages = [...initialMessages, annotatedCheckoutMessage, notificationProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])];
    console.log(`[supervisor] Total messages being returned: ${finalMessages.length}`);
    console.log(`[supervisor] Messages summary:`, finalMessages.map((m: any) => ({
      agent: m.agent,
      role: m.role,
      contentPreview: typeof m.message.content === 'string' ? m.message.content.substring(0, 50) : 'non-string',
      ephemeral: m.progress?.ephemeral
    })));
    
    return {
      next: 'notification_agent',
      userId,
      conversationId,
      workflowContext: 'send_notification',
      plannerRecommendation, // Preserve planner recommendation
      messages: finalMessages
    };
  }
  
  if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
    console.log(`[supervisor] EARLY CHECK: Detected awaiting_deal_confirmation context, checking for affirmative response`);
    // Robust affirmative detection
    const messageWords = messageContent.toLowerCase().trim().split(/\s+/);
    const affirmativePatterns = [
      'yes', 'sure', 'ok', 'okay', 'apply', 'take', 
      'sounds', 'great', 'perfect', 'good', 'deal', 'go'
    ];
    
    const hasAffirmative = affirmativePatterns.some(pattern => 
      messageWords.some((word: string) => word.includes(pattern) || pattern.includes(word))
    );
    
    if (hasAffirmative) {
      console.log(`[supervisor] EARLY CHECK: Affirmative response detected, routing to cart_and_checkout with add_to_cart_with_deals context`);
      const cartProgressMessage = getAgentProgressMessage('cart_and_checkout', 'add_to_cart_with_deals');
      cartProgressMessage.timestamp = Date.now() + timestampOffset++;
      return {
        next: 'cart_and_checkout',
        userId,
        conversationId,
        workflowContext: 'add_to_cart_with_deals',
        dealData,
        pendingProduct,
        cartData,
        messages: [...initialMessages, cartProgressMessage, lastAnnotated]
      };
    } else {
      // Negative or unclear response - user declined the deal
      console.log(`[supervisor] EARLY CHECK: Non-affirmative response detected, ending workflow`);
      const declineMessage = new AIMessage("No problem! Let me know if you'd like to explore other products or if there's anything else I can help you with.");
      return {
        messages: [...initialMessages, {
          message: declineMessage,
          role: 'assistant',
          agent: 'supervisor',
          timestamp: Date.now()
        }],
        userId,
        conversationId,
        workflowContext: undefined, // Clear context
        dealData: undefined,         // Clear deal data
        pendingProduct: undefined,    // Clear pending product
        cartData,
        next: END
      };
    }
  }
  
  // Detect complex multi-step workflows
  const complexWorkflow = detectComplexWorkflow(messageContent);
  console.log(`[supervisor] Complex workflow detection:`, complexWorkflow);
  
  // FIRST: Handle planner recommendations with supervisor's delegation logic
  if (plannerRecommendation) {
    const { action, targetAgent, confidence, reasoning } = plannerRecommendation;
    console.log(`[supervisor] Processing planner recommendation: action=${action}, targetAgent=${targetAgent}, confidence=${confidence}`);
    
    // If planner recommends direct response, validate and handle
    if (action === 'direct_response') {
      console.log(`[supervisor] Planner recommends direct response: ${reasoning}`);
      // For direct responses, we can return immediately without agent delegation
      // Use the planner's task or reasoning as the response content
      const responseContent = plannerRecommendation.task || reasoning || 'Hello! How can I help you today?';
      const directResponse = new AIMessage(responseContent);
      return {
        messages: [...initialMessages, {
          message: directResponse,
          role: 'assistant',
          agent: 'supervisor',
          timestamp: Date.now()
        }],
        userId,
        conversationId,
        workflowContext,
        dealData,
        pendingProduct,
        cartData,
        next: END
      };
    }
    
    // For delegation recommendations, apply supervisor's business logic and validation
    if (action === 'delegate' && targetAgent) {
      console.log(`[supervisor] Planner recommends delegation to: ${targetAgent} (confidence: ${confidence})`);
      
      // Apply supervisor's context-aware validation and routing
      const validAgents = ['catalog', 'cart_and_checkout', 'deals', 'payment', 'notification_agent'];
      
      // Supervisor makes the final decision based on context and planner recommendation
      let finalTargetAgent = targetAgent;
      
      // Override planner recommendation based on current context if needed
      if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
        console.log(`[supervisor] OVERRIDE: Context requires cart_and_checkout despite planner recommendation`);
        finalTargetAgent = 'cart_and_checkout';
      } else if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
        console.log(`[supervisor] OVERRIDE: Context requires continuation flow analysis`);
        // Continue to regular flow for continuation analysis
      } else if (complexWorkflow.isComplex && targetAgent === 'supervisor') {
        // Handle complex multi-step workflows - start with deals agent
        console.log(`[supervisor] COMPLEX WORKFLOW: Detected ${complexWorkflow.workflowType} - routing to deals agent first`);
        console.log(`[supervisor] Reason: ${complexWorkflow.reason}`);
        finalTargetAgent = 'deals';
        
        // Note: Progress messages are handled by getAgentProgressMessage() below
      } else if (validAgents.includes(targetAgent) && confidence && confidence > 0.7) {
        // High confidence planner recommendation - use it
        console.log(`[supervisor] High confidence planner recommendation accepted: ${targetAgent}`);
        finalTargetAgent = targetAgent;
      } else {
        // Low confidence or complex scenario - apply supervisor logic
        console.log(`[supervisor] Applying supervisor logic due to low confidence or complex scenario`);
        // Continue to regular continuation detection and routing logic below
      }
      
      // If we have a final decision from planner recommendation, execute it
      if (finalTargetAgent !== targetAgent || (confidence && confidence > 0.7)) {
        // Add agent-specific progress message with unique timestamp
        const agentProgressMessage = getAgentProgressMessage(finalTargetAgent, workflowContext);
        agentProgressMessage.timestamp = Date.now() + timestampOffset++;
        
        return {
          next: finalTargetAgent,
          userId,
          conversationId,
          workflowContext,
          dealData,
          pendingProduct,
          cartData,
          messages: [...initialMessages, agentProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])]
        };
      }
    }
  }
  
  // Enhanced continuation detection (fallback when planner recommendations are not sufficient)
  const continuationAnalysis = await detectContinuationIntent(messageContent, messages, workflowContext, dealData, pendingProduct);
  
  console.log(`[supervisor] Continuation analysis:`, continuationAnalysis);
  
  // Handle continuation scenarios based on LLM analysis
  if (continuationAnalysis.isContinuation && continuationAnalysis.confidence > MIN_CONTINUATION_CONFIDENCE) {
    console.log(`[supervisor] High-confidence continuation detected: ${continuationAnalysis.continuationType}`);
    console.log(`[supervisor] Routing to: ${continuationAnalysis.targetAgent} with confidence: ${continuationAnalysis.confidence}`);
    
    switch (continuationAnalysis.continuationType) {
      case 'deal_confirmation':
        const dealConfirmProgressMessage = getAgentProgressMessage('cart_and_checkout', 'add_to_cart_with_deals');
        dealConfirmProgressMessage.timestamp = Date.now() + timestampOffset++;
        return {
          next: 'cart_and_checkout',
          userId,
          conversationId,
          workflowContext: 'add_to_cart_with_deals',
          dealData,
          pendingProduct,
          messages: [...initialMessages, dealConfirmProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])]
        };
        
      case 'checkout_flow':
        const checkoutContext = cartData ? 'process_checkout' : 'prepare_checkout';
        const checkoutProgressMessage = getAgentProgressMessage('cart_and_checkout', checkoutContext);
        checkoutProgressMessage.timestamp = Date.now() + timestampOffset++;
        return {
          next: 'cart_and_checkout',
          userId,
          conversationId,
          workflowContext: checkoutContext,
          cartData,
          messages: [...initialMessages, checkoutProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])]
        };
        
      case 'add_to_cart':
        const targetAgent = pendingProduct ? 'cart_and_checkout' : 'deals';
        const addToCartProgressMessage = getAgentProgressMessage(targetAgent, pendingProduct ? 'add_to_cart_with_deals' : 'check_deals');
        addToCartProgressMessage.timestamp = Date.now() + timestampOffset++;
        return {
          next: targetAgent,
          userId,
          conversationId,
          workflowContext: pendingProduct ? 'add_to_cart_with_deals' : 'check_deals',
          dealData,
          pendingProduct,
          messages: [...initialMessages, addToCartProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])]
        };
    }
  }
  
  // CRITICAL: Handle specific workflow contexts before falling back to general routing
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    console.log(`[supervisor] OVERRIDE: Detected add_to_cart_with_deals context with pending product, routing directly to cart_and_checkout`);
    const cartProgressMessage = getAgentProgressMessage('cart_and_checkout', 'add_to_cart_with_deals');
    cartProgressMessage.timestamp = Date.now() + timestampOffset++;
    return {
      next: 'cart_and_checkout',
      userId,
      conversationId,
      workflowContext: 'add_to_cart_with_deals',
      dealData,
      pendingProduct,
      plannerRecommendation, // Preserve planner recommendation
      messages: [...initialMessages, cartProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])]
    };
  }
  
  // Handle automatic checkout after cart addition
  if (workflowContext === 'add_to_cart_with_checkout') {
    console.log(`[supervisor] OVERRIDE: Detected add_to_cart_with_checkout context, routing to cart_and_checkout for checkout`);
    const checkoutProgressMessage = getAgentProgressMessage('cart_and_checkout', 'process_checkout');
    checkoutProgressMessage.timestamp = Date.now() + timestampOffset++;
    return {
      next: 'cart_and_checkout',
      userId,
      conversationId,
      workflowContext: 'process_checkout', // Switch to checkout context
      dealData,
      pendingProduct: null, // No pending product for checkout
      cartData,
      plannerRecommendation, // Preserve planner recommendation
      messages: [...initialMessages, checkoutProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])]
    };
  }
  
  // Note: awaiting_deal_confirmation is now handled by EARLY CHECK above (before planner logic)
  
  // Enhanced routing with context awareness - fallback only when continuation fails
  console.log(`[supervisor] No high-confidence continuation detected (confidence: ${continuationAnalysis.confidence})`);
  console.log(`[supervisor] Falling back to general routing logic`);
  
  const systemMessage = new SystemMessage(`You are an intelligent supervisor routing customer requests in a grocery shopping system.

Available agents:
• **catalog** - Product discovery, search, browsing, recommendations (NO deals/promotions)
• **cart_and_checkout** - Adds items to cart (AFTER deals are checked), checkout, order completion
• **payment** - Payment method management only
• **deals** - Deal discovery, promotions, discounts, sales, special offers

Routing Rules:
- For ANY "add to cart" request → **deals** (to check for offers first)
- For completing checkout/purchase → **cart_and_checkout**
- For adding an item to the cart AFTER a deal has been offered/accepted → **cart_and_checkout**
- For product search/browsing WITHOUT deals → **catalog**
- For ANY mention of deals, discounts, promotions, sales → **deals**
- For payment setup → **payment**
- For ambiguous requests → use conversation context to infer intent

Complex Workflow Rule:
- If user asks to "add to cart" AND "apply deals" (or similar) → **deals** (this starts an automatic workflow)
- If user asks to "check deals" AND "add to cart" in the same request → **deals** (this starts an automatic workflow)

IMPORTANT: 
- If user wants to add an item to the cart → ALWAYS route to **deals** agent first.
- If user mentions "deals", "promotions", "discounts", "sales", "offers" → ALWAYS route to **deals** agent.
- If user just wants product info (price, description) without deals → route to **catalog**.
- Catalog agent does NOT handle deal-related queries.

CRITICAL: If there's ANY indication this is a continuation or response to a previous interaction:
- Check workflow context carefully
- Consider pending products and deal data
- Prefer continuation agents over new conversations

${workflowContext ? `Current workflow: ${workflowContext}` : ''}
${pendingProduct ? `Pending product: ${pendingProduct.product}` : ''}
${dealData ? 'Deal context available' : ''}

Respond with ONLY the agent name: catalog, cart_and_checkout, payment, or deals

User message: "${messageContent}"`);

  const invokeMessages = lastAnnotated?.message ? [systemMessage, lastAnnotated.message] : [systemMessage];
  const response = await getLlm().invoke(invokeMessages as any);
  const nextAgent = response.content.toString().trim().toLowerCase();
  
  // Validate and route
  const validAgents = ['catalog', 'cart_and_checkout', 'payment', 'deals'];
  const selectedAgent = validAgents.includes(nextAgent) ? nextAgent : 'catalog';
  
  console.log(`[supervisor] Routing to agent: ${selectedAgent}`);
  
  // Extract product information for deals routing (add-to-cart scenarios and complex workflows)
  let extractedProduct = pendingProduct;
  if ((selectedAgent === 'deals' && !pendingProduct) || complexWorkflow.isComplex) {
    extractedProduct = await extractProductInfo(messageContent);
    console.log('[supervisor] Extracted product info for deals/complex workflow:', extractedProduct);
    // Invalidate planner cache if we just discovered a pending product — planner decisions may change
    try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }
  }
  
  // Set appropriate workflow context for complex workflows
  let finalWorkflowContext = workflowContext;
  let finalDealData = dealData;
  
  if (complexWorkflow.isComplex && selectedAgent === 'deals' && extractedProduct) {
    finalWorkflowContext = 'check_deals';
    console.log(`[supervisor] Setting check_deals context for complex workflow: ${complexWorkflow.workflowType}`);
    
    // If workflow includes checkout, mark it in dealData so it flows through the entire workflow
    if (complexWorkflow.includesCheckout) {
      console.log(`[supervisor] Complex workflow includes automatic checkout - marking in dealData`);
      finalDealData = {
        ...dealData,
        includesCheckout: true,
        workflowType: complexWorkflow.workflowType
      };
    }
  }
  
  // Add agent-specific progress message before routing
  const finalProgressMessage = getAgentProgressMessage(selectedAgent, finalWorkflowContext);
  finalProgressMessage.timestamp = Date.now() + timestampOffset++;
  
  return {
    next: selectedAgent,
    userId,
    conversationId,
    workflowContext: finalWorkflowContext,
    pendingProduct: extractedProduct || pendingProduct,
    dealData: finalDealData,
    cartData,
    plannerRecommendation, // CRITICAL: Preserve planner recommendation through state updates
    messages: [...initialMessages, finalProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])]
  };
}

// Agent functions that use the state
async function catalogNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, dealData, pendingProduct, cartData, plannerRecommendation } = state;
  
  console.log('[catalogNode] Processing with catalog agent for user:', userId, 'conversation:', conversationId);
  
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const messageContent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';

  // Build compact context for the catalog agent and send reduced history
  const catalogContext = buildAgentContextMessage(messages as AnnotatedMessage[], 'catalog', messageContent);
  const result = await catalogGraph.invoke({ messages: [new HumanMessage(catalogContext)] });

  // Annotate returned messages as coming from the catalog assistant
  const annotatedResponses = (result.messages || []).map((m: any) => annotateMessage(m as AIMessage, 'assistant', 'catalog'));

  // Log routing decision for debugging
  console.log('[catalogNode] ROUTING DECISION:', {
    fromAgent: 'catalog',
    toAgent: END,
    reason: 'Task completed',
    state: { workflowContext, pendingProduct: !!pendingProduct, dealData: !!dealData }
  });

  return {
    messages: annotatedResponses,
    // PRESERVE ALL STATE - critical for workflow continuity
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
    plannerRecommendation, // CRITICAL: Preserve planner recommendation
    next: END,
  };
}

export async function cartAndCheckoutNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, dealData, pendingProduct, cartData, plannerRecommendation } = state;
  
  console.log('[cartAndCheckoutNode] Processing with cart & checkout agent for user:', userId, 'conversation:', conversationId);
  console.log('[cartAndCheckoutNode] Workflow context:', workflowContext);
  console.log('[cartAndCheckoutNode] Deal data available:', !!dealData);
  console.log('[cartAndCheckoutNode] Deal data:', dealData);
  console.log('[cartAndCheckoutNode] Pending product:', pendingProduct);
  console.log('[cartAndCheckoutNode] Cart data:', cartData);
  console.log('[cartAndCheckoutNode] All messages:', messages.map(m => ({ role: m.role, content: typeof m.message.content === 'string' ? m.message.content : String(m.message.content).substring(0, 100) })));
  
  // Determine the message to send to the cart agent
  let messageToAgent: string;
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const originalContent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';
  
  // Extract the original user message to determine if this is a checkout request
  // Don't use planner routing messages which contain "cart_and_checkout" 
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
  const actualUserContent = lastUserMessage ? 
    (typeof lastUserMessage.message.content === 'string' ? lastUserMessage.message.content : String(lastUserMessage.message.content)) 
    : originalContent;
  
  // Check if this is a checkout request based on actual user intent, not planner routing
  const isCheckoutRequest = actualUserContent.toLowerCase().includes('checkout') || 
                           actualUserContent.toLowerCase().includes('buy') ||
                           actualUserContent.toLowerCase().includes('purchase') ||
                           workflowContext === 'process_checkout' ||
                           workflowContext === 'prepare_checkout';
  
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    // Handle add-to-cart with deal context - provide full context to agent
    // Normalize product name for cart operations (deals use plural, cart uses singular)
    const productForCart = normalizeProductName(pendingProduct.product);
    
    // Check if this is an automatic flow from complex workflow or manual confirmation
    const isAutomaticFlow = dealData && dealData.applied && !actualUserContent.toLowerCase().includes('yes');
    
    if (isAutomaticFlow) {
      // Auto-proceeding from complex workflow with deals found
      const originalUserIntent = dealData.originalIntent || actualUserContent;
      messageToAgent = `[userId:${userId}] Complex workflow auto-proceeding: User requested "${originalUserIntent}" and deals were found. Please add ${pendingProduct.quantity || 1} ${pendingProduct.product} to cart using productCode "${productForCart}" and userId "${userId}" with the ${dealData.type || 'available'} deal applied automatically.`;
      console.log('[cartAndCheckoutNode] Auto-proceeding with deal application for complex workflow');
    } else {
      // Manual confirmation flow
      messageToAgent = `[userId:${userId}] User confirmed: "${originalContent}". Please add ${pendingProduct.quantity || 1} ${pendingProduct.product} to cart using productCode "${productForCart}" and userId "${userId}"`;
      
      if (dealData) {
        if (dealData.applied) {
          messageToAgent += ` with the ${dealData.type || 'available'} deal applied`;
        } else if (dealData.pending) {
          messageToAgent += ` and apply the ${dealData.type || 'available'} deal that was offered`;
        }
      }
    }
    
    console.log('[cartAndCheckoutNode] Deal context message:', messageToAgent);
  } else if (isCheckoutRequest) {
    // For checkout requests, let the agent handle getting cart data and processing checkout
    if (cartData) {
      messageToAgent = `[userId:${userId}] User wants to checkout. Cart data: ${JSON.stringify(cartData)}. ${originalContent}`;
      console.log('[cartAndCheckoutNode] Checkout message with existing cart data prepared');
    } else {
      messageToAgent = `[userId:${userId}] User wants to checkout: "${originalContent}". Please get the current cart and process checkout.`;
      console.log('[cartAndCheckoutNode] Checkout message without cart data - agent will handle getting cart');
    }
  } else {
    // For other scenarios, use the actual user message with userId context
    messageToAgent = `[userId:${userId}] ${actualUserContent}`;
  }
  
  // Build compact context for cart agent and prepend detailed action instructions
  // CRITICAL FIX: When in add_to_cart_with_deals context with structured instructions,
  // filter out the original user "add to cart" message from context to prevent duplicate operations
  let filteredMessages = messages;
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    console.log('[cartAndCheckoutNode] Filtering out original add-to-cart request to prevent duplication');
    // Remove user messages that contain "add" + product name to prevent duplicate processing
    const productName = pendingProduct.product.toLowerCase();
    filteredMessages = messages.filter((m: any) => {
      if (m.role !== 'user') return true; // Keep all non-user messages
      const content = (typeof m.message?.content === 'string' ? m.message.content : String(m.message?.content || '')).toLowerCase();
      // Filter out messages that contain both "add" and the product name
      const isOriginalAddRequest = content.includes('add') && content.includes(productName);
      return !isOriginalAddRequest;
    });
    console.log(`[cartAndCheckoutNode] Filtered messages: ${messages.length} -> ${filteredMessages.length}`);
  }
  
  const cartContext = buildAgentContextMessage(filteredMessages as AnnotatedMessage[], 'cart_and_checkout', actualUserContent);

  // Only add structured checkout instruction for actual checkout requests
  const structuredInstruction = isCheckoutRequest 
    ? `\n\nWhen completing checkout, return ONLY a JSON object with this shape (no additional text):\n{\n  "checkoutStatus": "success" | "failure",\n  "orderId": string | null,\n  "summary": string | null,\n  "items": Array<any> | null,\n  "total": number | null\n}`
    : '';

  const fullCartMessage = `${cartContext}\n\n${messageToAgent}${structuredInstruction}`;
  
  const result = await cartAndCheckoutGraph.invoke({ messages: [new HumanMessage(fullCartMessage)] });

  const annotatedResponses = (result.messages || []).map((m: any) => annotateMessage(m as AIMessage, 'assistant', 'cart_and_checkout'));
  
  // Check if the cart operation failed and suggest alternative
  const resultMessage = result.messages && result.messages.length > 0 ? result.messages[result.messages.length - 1] : null;
  const responseContent = resultMessage && resultMessage.content ? (typeof resultMessage.content === 'string' ? resultMessage.content : '') : (result.content || '');
  
  // Detect if product was not recognized
  const contentStr = typeof responseContent === 'string' ? responseContent : '';
  const productNotRecognized = contentStr.toLowerCase().includes('not recognizing the product') ||
                               contentStr.toLowerCase().includes('product not found') ||
                               contentStr.toLowerCase().includes('item not found');
  
  if (productNotRecognized && pendingProduct) {
    console.log('[cartAndCheckoutNode] Product not recognized, suggesting catalog search');
    
    // Create a helpful message suggesting catalog search
    const helpfulMessage = new AIMessage(`I couldn't find "${pendingProduct.product}" in our catalog. Let me help you find the right product. You can try searching for similar items or browse our catalog.`);
    
    // Invalidate planner cache for this conversation/user since deal/cart state changed
    try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

    return {
      messages: annotatedResponses ? [...annotatedResponses, annotateMessage(helpfulMessage, 'assistant', 'cart_and_checkout')] : [annotateMessage(helpfulMessage, 'assistant', 'cart_and_checkout')],
      userId,
      conversationId,
      workflowContext: null, // Clear workflow context to allow new interactions
      dealData: null, // Clear deal data since the product wasn't found
      pendingProduct: null, // Clear pending product
      cartData,
      plannerRecommendation, // CRITICAL: Preserve planner recommendation
      next: END, // End this interaction, user can start fresh
    };
  }
  // Prefer structured JSON response from cart agent for checkout detection
  const structured = safeParseJson<{
    checkoutStatus?: 'success' | 'failure';
    orderId?: string | null;
    summary?: string | null;
    items?: any[] | null;
    total?: number | null;
  }>(contentStr);

  if (structured && structured.checkoutStatus) {
    if (structured.checkoutStatus === 'success') {
      console.log('[cartAndCheckoutNode] Structured checkout success detected with orderId:', structured.orderId);
      
      const notificationPayload = {
        userId,
        conversationId,
        summary: structured.summary || contentStr,
        cartData: structured.items || cartData,
        orderId: structured.orderId || null,
        total: structured.total || null,
        timestamp: Date.now()
      };

      // Invalidate planner cache - cart was cleared after checkout
      try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

      // Log routing decision for debugging
      console.log('[cartAndCheckoutNode] ROUTING DECISION:', {
        fromAgent: 'cart_and_checkout',
        toAgent: 'supervisor',
        reason: 'Structured checkout success - routing to supervisor with send_notification context',
        orderId: structured.orderId,
        state: { workflowContext: 'send_notification', pendingProduct: null, cartData: null }
      });

      return {
        messages: annotatedResponses,
        userId,
        conversationId,
        workflowContext: 'send_notification', // Set context for supervisor to route to notification
        dealData,
        pendingProduct: null,
        cartData: null, // clear cart after successful checkout
        notificationData: notificationPayload,
        plannerRecommendation, // CRITICAL: Preserve planner recommendation
        next: 'supervisor' // Route back to supervisor following hub-and-spoke pattern
      };
    }

    if (structured.checkoutStatus === 'failure') {
      console.log('[cartAndCheckoutNode] Structured checkout failure detected');
      const failMessage = new AIMessage(`Checkout failed: ${structured.summary || 'Unknown reason'}`);
      
      // Log routing decision for debugging
      console.log('[cartAndCheckoutNode] ROUTING DECISION:', {
        fromAgent: 'cart_and_checkout',
        toAgent: END,
        reason: 'Checkout failure - ending workflow',
        state: { workflowContext: null, pendingProduct: null, cartData: 'preserved' }
      });
      
      return {
        messages: annotatedResponses ? [...annotatedResponses, annotateMessage(failMessage, 'assistant', 'cart_and_checkout')] : [annotateMessage(failMessage, 'assistant', 'cart_and_checkout')],
        userId,
        conversationId,
        workflowContext: null,
        dealData,
        pendingProduct: null,
        cartData,
        plannerRecommendation, // CRITICAL: Preserve planner recommendation
        next: END
      };
    }
  }

  // Fallback: Inspect responseContent for confirmation of successful checkout using text heuristics.
  const checkoutSuccess = contentStr.toLowerCase().includes('checkout completed') ||
                          contentStr.toLowerCase().includes('order confirmed') ||
                          contentStr.toLowerCase().includes('payment successful') ||
                          contentStr.toLowerCase().includes('order placed');

  if (checkoutSuccess) {
    console.log('[cartAndCheckoutNode] Detected successful checkout (text fallback) - preparing notification');

    // Build a simple notification payload
    const notificationPayload = {
      userId,
      conversationId,
      summary: contentStr,
      cartData,
      orderId: null,
      timestamp: Date.now()
    };

    // Invalidate planner cache - cart was cleared after checkout
    try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

    // Log routing decision for debugging
    console.log('[cartAndCheckoutNode] ROUTING DECISION:', {
      fromAgent: 'cart_and_checkout',
      toAgent: 'supervisor',
      reason: 'Checkout success (text fallback) - routing to supervisor with send_notification context',
      state: { workflowContext: 'send_notification', pendingProduct: null, cartData: null }
    });

    return {
      messages: annotatedResponses,
      userId,
      conversationId,
      workflowContext: 'send_notification', // Set context for supervisor to route to notification
      dealData,
      pendingProduct: null,
      cartData: null, // clear cart after successful checkout
      notificationData: notificationPayload,
      plannerRecommendation, // CRITICAL: Preserve planner recommendation
      next: 'supervisor' // Route back to supervisor following hub-and-spoke pattern
    };
  }

  // Log routing decision for debugging
  console.log('[cartAndCheckoutNode] ROUTING DECISION:', {
    fromAgent: 'cart_and_checkout',
    toAgent: END,
    reason: 'Cart operation completed - ending workflow',
    state: { workflowContext, pendingProduct: !!pendingProduct, dealData: !!dealData, cartData: !!cartData }
  });

  // Check if this was an add-to-cart operation that should automatically proceed to checkout
  // Similar to add_to_cart_with_deals pattern
  const shouldAutoCheckout = (
    dealData && 
    dealData.includesCheckout && 
    workflowContext === 'add_to_cart_with_deals' &&
    !isCheckoutRequest // Only auto-checkout if we're not already in checkout
  );

  if (shouldAutoCheckout) {
    console.log('[cartAndCheckoutNode] AUTO-CHECKOUT: Complex workflow includes checkout - proceeding automatically');
    console.log('[cartAndCheckoutNode] Workflow type:', dealData.workflowType);
    
    // Invalidate planner cache since we're changing workflow state
    try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }
    
    // Add progress message for automatic checkout transition
    const checkoutProgressMessage = createProgressMessage('💳 Proceeding to checkout automatically...', 'supervisor');
    const messagesWithProgress = [
      ...annotatedResponses,
      checkoutProgressMessage
    ];
    
    // Log routing decision for auto-checkout
    console.log('[cartAndCheckoutNode] ROUTING DECISION:', {
      fromAgent: 'cart_and_checkout',
      toAgent: 'supervisor',
      reason: 'Auto-checkout enabled in complex workflow - routing back for checkout delegation',
      state: { 
        workflowContext: 'add_to_cart_with_checkout',
        includesCheckout: true
      }
    });
    
    return {
      messages: messagesWithProgress,
      userId,
      conversationId,
      workflowContext: 'add_to_cart_with_checkout', // New context similar to add_to_cart_with_deals
      dealData: {
        ...dealData,
        includesCheckout: false // Prevent re-triggering, but keep other deal data
      },
      pendingProduct: null, // Clear pending product after adding to cart
      cartData,
      plannerRecommendation, // CRITICAL: Preserve planner recommendation
      next: 'supervisor', // Route back to supervisor which will delegate to cart for checkout
    };
  }

  return {
    messages: annotatedResponses,
    // PRESERVE ALL STATE - critical for workflow continuity
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
    plannerRecommendation, // CRITICAL: Preserve planner recommendation
    next: END,
  };
}

async function dealsNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, pendingProduct, dealData, cartData, plannerRecommendation } = state;
  
  console.log('[dealsNode] Processing with deals agent for user:', userId, 'conversation:', conversationId);
  console.log('[dealsNode] Workflow context:', workflowContext);
  console.log('[dealsNode] Pending product:', pendingProduct);
  console.log('[dealsNode] Planner recommendation:', plannerRecommendation);
  
  // Determine message to send to deals agent
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  let messageToAgent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';
  
  // If we don't have a pendingProduct, try to extract one from recent user messages
  // The deals agent needs product information to search for deals
  let effectivePending = pendingProduct;
  if (!effectivePending) {
    console.log('[dealsNode] No pending product in state, attempting extraction from recent messages');
    
    // Get last 2 user messages to search for product information
    const userMessages = messages.filter(m => m.role === 'user');
    const recentUserMessages = userMessages.slice(-2); // Last 2 user messages
    
    console.log('[dealsNode] Recent user messages count:', recentUserMessages.length);
    
    // Try extracting from each recent message, most recent first
    for (let i = recentUserMessages.length - 1; i >= 0 && !effectivePending; i--) {
      const msg = recentUserMessages[i];
      const content = typeof msg.message.content === 'string' 
        ? msg.message.content 
        : String(msg.message.content);
      
      console.log(`[dealsNode] Trying to extract from user message ${i + 1}:`, content.substring(0, 100));
      
      try {
        const extracted = await extractProductInfo(content);
        if (extracted && extracted.product) {
          effectivePending = extracted;
          console.log('[dealsNode] Successfully extracted pending product from recent message:', effectivePending);
          break;
        }
      } catch (e) {
        console.warn(`[dealsNode] Error extracting from message ${i + 1}:`, e);
      }
    }
    
    if (!effectivePending) {
      console.log('[dealsNode] No pending product could be extracted from last 2 user messages');
    }
  }

  // CRITICAL: If we still don't have a product after extraction attempts, return helpful error
  if (!effectivePending) {
    console.log('[dealsNode] ERROR: No product information available for deals search');
    const errorMessage = new AIMessage(
      "I need to know which product you're interested in to check for deals. Could you please specify the product name? For example, 'Check deals on apples' or 'Add 8 apples to my cart'."
    );
    
    // Log routing decision for debugging
    console.log('[dealsNode] ROUTING DECISION:', {
      fromAgent: 'deals',
      toAgent: END,
      reason: 'No product information available - ending workflow',
      state: { workflowContext: null, pendingProduct: null }
    });
    
    return {
      messages: [annotateMessage(errorMessage, 'assistant', 'deals')],
      userId,
      conversationId,
      workflowContext: null, // Clear context since we can't proceed
      dealData,
      pendingProduct: null,
      cartData,
      plannerRecommendation, // CRITICAL: Preserve planner recommendation
      next: END
    };
  }

  if (effectivePending && workflowContext === 'check_deals') {
    // Detect if this is part of a complex workflow (deals + cart addition)
    const originalMessage = messageToAgent.toLowerCase();
    const isComplexWorkflow = (
      (originalMessage.includes('check') && originalMessage.includes('deal') && originalMessage.includes('add')) ||
      (originalMessage.includes('if') && originalMessage.includes('deal')) ||
      (originalMessage.includes('deal') && originalMessage.includes('cart'))
    );
    
    if (isComplexWorkflow) {
      messageToAgent = `Complex workflow request: "${messageToAgent}". User wants to check for deals on ${effectivePending.product}${effectivePending.quantity ? ` (quantity: ${effectivePending.quantity})` : ''} and conditionally add to cart if deals are available. Please check for deals and present options clearly.`;
      console.log('[dealsNode] Enhanced message for complex workflow');
    } else {
      messageToAgent = `User wants to add to cart: "${messageToAgent}". Check for deals on ${effectivePending.product}${effectivePending.quantity ? ` (quantity: ${effectivePending.quantity})` : ''}`;
    }
  }
  
  const dealsContext = buildAgentContextMessage(messages as AnnotatedMessage[], 'deals', messageToAgent);
  const result = await dealsGraph.invoke({ messages: [new HumanMessage(dealsContext)] });
  const annotatedResponses = (result.messages || []).map((m: any) => annotateMessage(m as AIMessage, 'assistant', 'deals'));
  // Analyze response for deal confirmation needs
  const responseMessages = annotatedResponses;
  const responseContent = result.content || 'No deals found';
  
  // Get the ORIGINAL user message to check for auto-apply intent
  const userMessages = messages.filter(m => m.role === 'user');
  const originalUserMessage = userMessages.length > 0 
    ? (typeof userMessages[userMessages.length - 1].message.content === 'string' 
        ? userMessages[userMessages.length - 1].message.content 
        : String(userMessages[userMessages.length - 1].message.content))
    : messageToAgent;
  
  // Check if this is a complex workflow that should auto-proceed
  const modifiedMessageLower = messageToAgent.toLowerCase();
  const isComplexWorkflow = (
    (modifiedMessageLower.includes('check') && modifiedMessageLower.includes('deal') && modifiedMessageLower.includes('add')) ||
    (modifiedMessageLower.includes('if') && modifiedMessageLower.includes('deal')) ||
    (modifiedMessageLower.includes('deal') && modifiedMessageLower.includes('cart')) ||
    (modifiedMessageLower.includes('complex workflow request'))
  );
  
  // ENHANCED: Use planner's LLM-based intent analysis instead of keyword matching
  // The planner already analyzed the user's intent with sophisticated NLP
  // This eliminates the need for fragile keyword matching and leverages the planner's
  // comprehensive understanding of user intent across various phrasings
  const autoApplyIntent = plannerRecommendation?.autoApplyIntent === true;
  
  console.log('[dealsNode] Auto-apply intent from planner:', autoApplyIntent);
  if (!plannerRecommendation) {
    console.warn('[dealsNode] No planner recommendation available - defaulting to manual confirmation');
  }
  
  // Simple check for deal confirmation prompts
  const requiresConfirmation = responseContent.toLowerCase().includes('would you like') ||
                              responseContent.toLowerCase().includes('apply this deal') ||
                              responseContent.toLowerCase().includes('interested in') ||
                              responseContent.toLowerCase().includes('take advantage');
  
  // CRITICAL: Only auto-proceed when user explicitly requested auto-apply
  // Complex workflows WITHOUT auto-apply intent should still require confirmation
  if (requiresConfirmation || (isComplexWorkflow && !responseContent.toLowerCase().includes('no current deals') && !responseContent.toLowerCase().includes('no deals available'))) {
    // Deal found - check if user wants auto-apply or manual confirmation
    
    if (autoApplyIntent) {
      // ONLY auto-proceed when user explicitly said "just take them", "use any deals", etc.
      console.log('[dealsNode] Auto-apply intent detected - auto-proceeding to cart (no confirmation needed)');
      console.log('[dealsNode] Auto-apply intent:', autoApplyIntent);
      console.log('[dealsNode] Complex workflow:', isComplexWorkflow);
      console.log('[dealsNode] Pending product:', effectivePending || pendingProduct);
      
      // Invalidate planner cache for this conversation/user since dealData was applied/changed
      try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

      // Add progress message for transition to cart operations
      const messagesWithProgress = [
        ...responseMessages,
        createProgressMessage('🛒 Adding items to your cart...', 'supervisor')
      ];

      // Log routing decision for debugging
      console.log('[dealsNode] ROUTING DECISION:', {
        fromAgent: 'deals',
        toAgent: 'supervisor',
        reason: 'Auto-apply intent - routing to supervisor for cart delegation',
        state: { 
          workflowContext: 'add_to_cart_with_deals', 
          pendingProduct: effectivePending || pendingProduct,
          dealData: { applied: true, type: 'product_deal' }
        }
      });

      return {
        messages: messagesWithProgress,
        workflowContext: 'add_to_cart_with_deals',
        dealData: { 
          ...dealData, // Preserve existing deal data
          applied: true, 
          response: responseContent, 
          type: 'product_deal',
          originalIntent: messageToAgent // Preserve original user intent for cart context
        },
        pendingProduct: effectivePending || pendingProduct,
        cartData, // Preserve cart data
        userId,
        conversationId,
        plannerRecommendation, // CRITICAL: Preserve planner recommendation
        next: 'supervisor', // Route back to supervisor for delegation
      };
    } else if (requiresConfirmation) {
      // For simple deal queries with confirmation language, require manual confirmation
      console.log('[dealsNode] Simple deal query with confirmation language - requiring manual confirmation');
      console.log('[dealsNode] Pending product:', pendingProduct);
      console.log('[dealsNode] Deal data will be:', { pending: true, response: responseContent });
      
      // Invalidate planner cache for this conversation/user since deal state changed (pending confirmation)
      try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

      // Log routing decision for debugging
      console.log('[dealsNode] ROUTING DECISION:', {
        fromAgent: 'deals',
        toAgent: END,
        reason: 'Manual confirmation required - ending workflow',
        state: { 
          workflowContext: 'awaiting_deal_confirmation', 
          pendingProduct: effectivePending || pendingProduct,
          dealData: { pending: true, type: 'product_deal' }
        }
      });

      return {
        messages: responseMessages,
        workflowContext: 'awaiting_deal_confirmation',
        dealData: { 
          ...dealData, // Preserve existing deal data
          pending: true, 
          response: responseContent, 
          type: 'product_deal' 
        },
        pendingProduct: effectivePending || pendingProduct,
        cartData, // Preserve cart data
        userId,
        conversationId,
        plannerRecommendation, // CRITICAL: Preserve planner recommendation
        next: END,
      };
    } else {
      // Deal found but no confirmation needed, proceed to add to cart
      console.log('[dealsNode] Deal found without confirmation language - proceeding to cart');
      
      // Invalidate planner cache for this conversation/user since dealData was applied/changed
      try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

      // Log routing decision for debugging
      console.log('[dealsNode] ROUTING DECISION:', {
        fromAgent: 'deals',
        toAgent: 'cart_and_checkout',
        reason: 'Deal found without confirmation - direct to cart',
        state: { 
          workflowContext: 'add_to_cart_with_deals', 
          pendingProduct: effectivePending,
          dealData: { applied: true, type: 'product_deal' }
        }
      });

      return {
        messages: responseMessages,
        workflowContext: 'add_to_cart_with_deals',
        dealData: { 
          ...dealData,
          applied: true, 
          response: responseContent, 
          type: 'product_deal' 
        },
        pendingProduct: effectivePending,
        cartData,
        userId,
        conversationId,
        plannerRecommendation, // CRITICAL: Preserve planner recommendation
        next: 'cart_and_checkout',
      };
    }
  } else {
    // Check if this is a "no deals available" scenario
    const noDealsAvailable = responseContent.toLowerCase().includes('no current deals') ||
                             responseContent.toLowerCase().includes('no deals available') ||
                             responseContent.toLowerCase().includes('expired') ||
                             responseContent.toLowerCase().includes('unfortunately, there are no');
    
    if (noDealsAvailable) {
      // No deals available - end workflow, let user decide next action
      console.log('[dealsNode] No deals available, ending workflow to allow user choice');
      // Invalidate planner cache for this conversation/user since dealData was updated
      try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

      // Log routing decision for debugging
      console.log('[dealsNode] ROUTING DECISION:', {
        fromAgent: 'deals',
        toAgent: END,
        reason: 'No deals available - ending workflow',
        state: { 
          workflowContext: null, 
          pendingProduct: null,
          dealData: { applied: false, type: 'no_deals_found' }
        }
      });

      return {
        messages: responseMessages,
        workflowContext: null, // Clear workflow context
        dealData: { 
          ...dealData,
          applied: false, 
          response: responseContent, 
          type: 'no_deals_found' 
        },
        pendingProduct: null, // Clear pending product since deals search is complete
        cartData,
        userId,
        conversationId,
        plannerRecommendation, // CRITICAL: Preserve planner recommendation
        next: END,
      };
    }
  }
}

async function paymentNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, cartData, workflowContext, dealData, pendingProduct } = state;
  
  console.log('[paymentNode] Processing with payment agent for user:', userId, 'conversation:', conversationId);
  console.log('[paymentNode] Workflow context:', workflowContext);
  
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const messageContent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';
  
  const paymentContext = buildAgentContextMessage(messages as AnnotatedMessage[], 'payment', messageContent);
  const result = await paymentGraph.invoke({ messages: [new HumanMessage(paymentContext)] });
  const annotatedResponses = (result.messages || []).map((m: any) => annotateMessage(m as AIMessage, 'assistant', 'payment'));
  
  // Log routing decision for debugging
  console.log('[paymentNode] ROUTING DECISION:', {
    fromAgent: 'payment',
    toAgent: END,
    reason: 'Payment operation completed',
    state: { workflowContext, pendingProduct: !!pendingProduct, dealData: !!dealData, cartData: !!cartData }
  });
  
  return {
    messages: annotatedResponses,
    // PRESERVE ALL STATE
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
    next: END,
  };
}

// Import notification agent functionality from separate module
import { 
  notificationAgent as notificationAgentImpl,
  sendPushoverNotification,
  __setSendPushoverNotificationForTests,
  __resetSendPushoverNotificationForTests
} from './notificationAgent';

// Wrapper function to adapt state format for notification agent
async function notificationAgent(state: typeof SupervisorState.State) {
  return notificationAgentImpl(state as any, annotateMessage, createProgressMessage);
}

import { responseTool, planTool } from '../tools/routing';

// Build the graph
// Graph Version: 2.0 - Hub-and-Spoke Compliant (No direct cart->notification edge)
const toolNode = new ToolNode([responseTool, planTool]);

// Wrapper node to adapt our AnnotatedMessage[] state to the ToolNode input
// ToolNode expects either BaseMessage[] or { messages: BaseMessage[] } as input.
// Our SupervisorState stores messages as AnnotatedMessage[], so convert before
// invoking the ToolNode and then convert responses back into AnnotatedMessage.
async function toolsNode(state: typeof SupervisorState.State) {
  const annotated = Array.isArray(state.messages) ? state.messages : [];
  // Extract the underlying BaseMessage objects
  const baseMessages = annotated.map((m: any) => m && m.message).filter(Boolean);

  // Invoke the ToolNode with the proper shape
  // use { messages: baseMessages } because ToolNode accepts that form
  const result: any = await toolNode.invoke({ messages: baseMessages }, {});

  // Convert returned BaseMessages into our AnnotatedMessage wrapper
  const annotatedResponses = (result?.messages || []).map((m: any) => {
    // If the message is already an instance of a BaseMessage-like object, wrap it
    return annotateMessage(m as AIMessage, 'assistant');
  });

  return {
    messages: annotatedResponses,
    userId: state.userId,
    conversationId: state.conversationId,
    next: END,
  };
}

const workflow = new StateGraph(SupervisorState)
  .addNode('planner', planner)
  .addNode('supervisor', supervisor)
  .addNode('catalog', catalogNode)
  .addNode('cart_and_checkout', cartAndCheckoutNode)
  .addNode('notification_agent', notificationAgent)
  .addNode('payment', paymentNode)
  .addNode('deals', dealsNode)
  .addNode('tools', toolsNode)
  .addEdge(START, 'planner')
  .addConditionalEdges('planner', routePlanner, {
    [END]: END,
    supervisor: 'supervisor',
    tools: 'tools'
    // REMOVED direct agent routing - all delegation now goes through supervisor
  })
  .addConditionalEdges('supervisor', (state) => state.next, {
    catalog: 'catalog',
    cart_and_checkout: 'cart_and_checkout',
    payment: 'payment',
    deals: 'deals',
    notification_agent: 'notification_agent', // RESTORED - notifications are handled by dedicated agent
  })
  .addEdge('tools', END)
  .addConditionalEdges('catalog', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  // CRITICAL: Cart agent ONLY routes to supervisor or END (hub-and-spoke pattern)
  // Notification handling is done internally by supervisor
  .addConditionalEdges('cart_and_checkout', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addConditionalEdges('deals', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addConditionalEdges('notification_agent', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addEdge('payment', END);

// Export a factory so callers can compile the workflow with a checkpointer/config.
export function compileSupervisorWorkflow(options?: any) {
  return workflow.compile(options);
}

// Backwards-compatible compiled graph export for LangGraph tooling (langgraph.json)
// This compiles a default instance without a per-agent checkpointer. For
// per-instance persistence, callers should use `compileSupervisorWorkflow`.
export const supervisorGraph = compileSupervisorWorkflow();

// Class-based Supervisor Agent with local state management
export class SupervisorAgent {
  private userId: string;
  private conversationId?: string;
  private memorySaver: MemorySaver;
  private compiledGraph: any;
  private threadPrefix: string;

  constructor(userId: string, conversationId?: string) {
    this.userId = userId;
    this.conversationId = conversationId;
    this.memorySaver = new MemorySaver();
  this.threadPrefix = `supervisor-${userId}`;
    
    // Create compiled graph with optimized configuration using the compile factory
    this.compiledGraph = compileSupervisorWorkflow({ 
      checkpointer: this.memorySaver,
      // Add configuration for better state management
      interruptBefore: [], // Can add nodes to interrupt before if needed
      interruptAfter: []   // Can add nodes to interrupt after if needed
    });
    
    console.log('[SupervisorAgent] Initialized for userId:', userId, 'threadPrefix:', this.threadPrefix);
  }

  // CRITICAL FIX: Use consistent thread ID that matches remote agents
  private getThreadId(conversationId?: string): string {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    
    // Check if this conversation already has a mapped thread ID from remote agents
    const existingThreadId = conversationThreadMap.get(effectiveConversationId);
    if (existingThreadId) {
      console.log(`[SupervisorAgent] Using existing mapped thread: ${existingThreadId} for conversation: ${effectiveConversationId}`);
      return existingThreadId;
    }
    
    // Use supervisor-specific thread ID format for local graph execution
    return `supervisor-${effectiveConversationId}`;
  }

  // OPTIMIZED: Improved chat method with better state handling
  async chat(message: string, conversationId?: string): Promise<any> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);

    console.log('[SupervisorAgent] Processing message with thread ID:', threadId);
    console.log('[SupervisorAgent] Effective conversation ID:', effectiveConversationId);

    try {
      // Ensure remote thread exists so LangGraph streaming and memory map work consistently
      // Thread management handled by local MemorySaver

      // Annotate incoming user message so graph state uses AnnotatedMessage consistently
      const annotatedInput = annotateMessage(new HumanMessage(message), 'user');

      const result = await this.compiledGraph.invoke({
        messages: [annotatedInput],
        userId: this.userId,
        conversationId: effectiveConversationId,
        next: '',
      }, {
        configurable: { 
          thread_id: threadId,
          // Reduce recursion limit to prevent infinite loops
          recursion_limit: 5,
          max_execution_time: 60000 // 60 seconds
        }
      });

      // update timestamp for mapping
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());

      return result;
    } catch (error) {
      console.error('[SupervisorAgent] Error in chat:', error);

      // Return graceful error response
      return {
        messages: [new AIMessage('I apologize, but I encountered an error processing your request. Please try again.')],
        userId: this.userId,
        conversationId: effectiveConversationId,
        next: END
      };
    }
  }

  // Enhanced stream support with better error handling
  async stream(message: string, conversationId?: string) {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);

    try {
      // Thread management handled by local MemorySaver
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());

      const annotatedInput = annotateMessage(new HumanMessage(message), 'user');

      return this.compiledGraph.stream({
        messages: [annotatedInput],
        userId: this.userId,
        conversationId: effectiveConversationId,
        next: '',
      }, {
        configurable: { 
          thread_id: threadId,
          recursion_limit: 5,
          max_execution_time: 60000
        }
      });
    } catch (error) {
      console.error('[SupervisorAgent] Error in stream:', error);
      throw error;
    }
  }

  // Enhanced LangGraph-compatible invoke method
  async invoke(input: { messages: any[], conversationId?: string }, config?: any) {
    const threadId = this.getThreadId(input.conversationId);
    
    const finalConfig = config || { configurable: { thread_id: threadId } };
    if (!finalConfig.configurable) {
      finalConfig.configurable = { thread_id: threadId };
    } else if (!finalConfig.configurable.thread_id) {
      finalConfig.configurable.thread_id = threadId;
    }
    
    // Add enhanced configuration
    finalConfig.configurable.recursion_limit = finalConfig.configurable.recursion_limit || 5;
    finalConfig.configurable.max_execution_time = finalConfig.configurable.max_execution_time || 60000;
    
    const effectiveConversationId = input.conversationId || this.conversationId || `conv-${this.userId}-session`;
    // Thread management handled by local MemorySaver
    conversationThreadTimestamps.set(effectiveConversationId, Date.now());

    // Ensure incoming messages are annotated (if plain HumanMessage, wrap them)
    const annotatedMessages = input.messages.map(m => {
      if ((m as AnnotatedMessage).message) return m as AnnotatedMessage;
      // assume m is a HumanMessage/SystemMessage/AIMessage
      if (m instanceof HumanMessage) {
        return annotateMessage(m, 'user');
      }
      if (m instanceof SystemMessage) {
        return annotateMessage(m, 'system');
      }
      return annotateMessage(m as AIMessage, 'assistant');
    });

    return await this.compiledGraph.invoke({
      messages: annotatedMessages,
      userId: this.userId,
      conversationId: effectiveConversationId,
      next: '',
    }, finalConfig);
  }

  // NEW: Method to get current state/context
  async getCurrentState(conversationId?: string): Promise<any> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);
    try {
      // Ensure thread exists remotely
      // Thread management handled by local MemorySaver
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());
      return await this.memorySaver.get({ configurable: { thread_id: threadId } });
    } catch (error) {
      console.error('[SupervisorAgent] Error getting current state:', error);
      return null;
    }
  }

  // ENHANCED: Better session clearing
  async clearSession(conversationId?: string): Promise<void> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);
    try {
      // Remove from local maps
      conversationThreadMap.delete(effectiveConversationId);
      conversationThreadTimestamps.delete(effectiveConversationId);

      // Reset memory saver for this agent instance
      this.memorySaver = new MemorySaver();
      console.log('[SupervisorAgent] Cleared session for conversation:', effectiveConversationId, 'thread:', threadId);
    } catch (error) {
      console.error('[SupervisorAgent] Error clearing session:', error);
    }
  }

  // NEW: Get all active sessions for this user
  async getActiveSessions(): Promise<string[]> {
    try {
      // Return active conversation IDs for this user from the in-memory map
      const active: string[] = [];
      for (const [convId, threadId] of conversationThreadMap.entries()) {
        if (convId.includes(this.userId) || convId.includes(`conv-${this.userId}`) || threadId?.includes(this.userId)) {
          active.push(convId);
        }
      }
      return active;
    } catch (error) {
      console.error('[SupervisorAgent] Error getting active sessions:', error);
      return [];
    }
  }

  // NEW: Health check method
  async healthCheck(): Promise<{ status: string; userId: string; timestamp: number }> {
    return {
      status: 'healthy',
      userId: this.userId,
      timestamp: Date.now()
    };
  }
}

// Factory function for backward compatibility
export const createSupervisorAgent = (userId: string, conversationId?: string) => {
  return new SupervisorAgent(userId, conversationId);
};

// Export internal helpers for testing
export { 
  notificationAgent, 
  sendPushoverNotification, 
  __setSendPushoverNotificationForTests,
  __resetSendPushoverNotificationForTests,
  END 
};