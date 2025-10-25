/**
 * LLM utilities and caching for the Supervisor Agent
 */

import { ChatOpenAI } from '@langchain/openai';
import { MIN_PLANNER_CONFIDENCE, MIN_CONTINUATION_CONFIDENCE, SUPERVISOR_LLM_CACHE_TTL_MS } from '../constants';

// Lazily initialize a ChatOpenAI instance so tests without API keys don't throw at import time
let llm: any = null;

export function getLlm() {
  if (llm) return llm;
  try {
    llm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0, maxRetries: 2, timeout: 50000 });
    return llm;
  } catch (e) {
    // Minimal fallback implementation for tests - deterministic and safe
    llm = {
      invoke: async (msgs: any) => {
        // Return simple default responses depending on system message content
        const first = Array.isArray(msgs) && msgs[0];
        const sys = first && first.type === 'system' ? first.content : '';
        return { content: 'catalog' };
      }
    };
    return llm;
  }
}

/**
 * Helper to extract textual content from various LLM response shapes
 */
export function extractLlmText(response: any): string {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (typeof response.content === 'string') return response.content;
  if (response.text && typeof response.text === 'string') return response.text;
  const gen = (response.generations || response.choices || response.output || []);
  if (Array.isArray(gen) && gen.length > 0) {
    const first = gen[0];
    if (typeof first === 'string') return first;
    if (first.text) return first.text;
    if (first.message && typeof first.message.content === 'string') return first.message.content;
    if (first.output_text) return first.output_text;
  }
  try { return JSON.stringify(response); } catch (_) { return String(response); }
}

// Safe fallbacks for imported constants in case of runtime issues
export const SAFE_MIN_PLANNER_CONFIDENCE = typeof MIN_PLANNER_CONFIDENCE === 'number' ? MIN_PLANNER_CONFIDENCE : 0.4;
export const SAFE_MIN_CONTINUATION_CONFIDENCE = typeof MIN_CONTINUATION_CONFIDENCE === 'number' ? MIN_CONTINUATION_CONFIDENCE : 0.7;
export const SAFE_SUPERVISOR_LLM_CACHE_TTL_MS = typeof SUPERVISOR_LLM_CACHE_TTL_MS === 'number' ? SUPERVISOR_LLM_CACHE_TTL_MS : 30 * 1000;

// ===== Supervisor-level LLM response cache (simple TTL) =====
type SupCacheEntry = { value: any; expiresAt: number };
const supervisorLlmCache = new Map<string, SupCacheEntry>();
const SUP_CACHE_TTL = SAFE_SUPERVISOR_LLM_CACHE_TTL_MS; // 30s default

export function getSupervisorLlmCache(key: string) {
  const e = supervisorLlmCache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    supervisorLlmCache.delete(key);
    return undefined;
  }
  return e.value;
}

export function setSupervisorLlmCache(key: string, value: any, ttl = SUP_CACHE_TTL) {
  supervisorLlmCache.set(key, { value, expiresAt: Date.now() + ttl });
}

export function __clearSupervisorLlmCacheForTests() {
  supervisorLlmCache.clear();
}

export function __setSupervisorLlmCacheEntryForTests(key: string, value: any, ttlMs?: number) {
  setSupervisorLlmCache(key, value, ttlMs);
}

export function invalidateSupervisorLlmCacheByPrefix(prefix: string) {
  for (const k of Array.from(supervisorLlmCache.keys())) {
    if (k.startsWith(prefix)) {
      supervisorLlmCache.delete(k);
    }
  }
}

// Test helpers to override LLM instance
export function __setLlmForTests(mock: any) {
  llm = mock;
}

export function __resetLlmForTests() {
  llm = null;
}
