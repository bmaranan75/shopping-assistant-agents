/**
 * Supervisor module exports
 * 
 * This index file provides clean exports for all supervisor-related functionality
 * organized into logical modules.
 */

// Type definitions
export type { 
  AgentRole, 
  AnnotatedMessage, 
  WorkflowDetectionResult,
  ContinuationAnalysis,
  ProductInfo,
  DealData,
  NotificationData,
  CheckoutResult
} from './types';

// State management
export { SupervisorState } from './state';

// Message utilities
export {
  annotateMessage,
  buildAgentContextMessage,
  createProgressMessage,
  getAgentProgressMessage,
  getWorkflowSteps
} from './message-utils';

// Product utilities
export {
  normalizeProductName,
  safeParseJson,
  extractProductInfo
} from './product-utils';

// Workflow detection
export {
  detectComplexWorkflow,
  detectContinuationIntent
} from './workflow-detection';

// LLM utilities and caching
export {
  getLlm,
  extractLlmText,
  SAFE_MIN_PLANNER_CONFIDENCE,
  SAFE_MIN_CONTINUATION_CONFIDENCE,
  SAFE_SUPERVISOR_LLM_CACHE_TTL_MS,
  getSupervisorLlmCache,
  setSupervisorLlmCache,
  invalidateSupervisorLlmCacheByPrefix,
  __clearSupervisorLlmCacheForTests,
  __setSupervisorLlmCacheEntryForTests,
  __setLlmForTests,
  __resetLlmForTests
} from './llm-utils';
