// Shared configuration constants for agent confidence thresholds and caching
export const MIN_PLANNER_CONFIDENCE = 0.4; // planner must be somewhat confident before delegating
export const MIN_CONTINUATION_CONFIDENCE = 0.7; // supervisor uses this to consider a continuation

// Affirmative/override thresholds used in continuation detection
export const STRONG_AFFIRMATIVE_CONFIDENCE_THRESHOLD = 0.9; // when LLM confidence below this but heuristics strong, override
export const OVERRIDE_AFFIRMATIVE_CONFIDENCE = 0.98; // confidence to assign when overriding based on heuristics
export const FALLBACK_AFFIRMATIVE_CONFIDENCE = 0.85; // fallback confidence when LLM errors but heuristics detect affirmative

// Default confidence when LLM returns none
export const DEFAULT_LLM_CONFIDENCE = 0.5;

// Supervisor LLM cache TTL (ms)
export const SUPERVISOR_LLM_CACHE_TTL_MS = 30 * 1000;
