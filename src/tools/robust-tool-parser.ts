/**
 * Robust Tool Input Parser
 * 
 * This utility provides robust parsing of LLM tool inputs to handle various formats
 * including JSON, natural language, and malformed inputs from upgraded class-based agents.
 */

export interface ParsedToolInput {
  success: boolean;
  data: any;
  error?: string;
  originalInput?: string;
}

/**
 * Robustly parse tool input from LLM that may be in various formats
 */
export function parseToolInput(inputString: any, fallbackHandler?: (input: string) => any): ParsedToolInput {
  const originalInput = inputString;
  
  try {
    console.log('[parseToolInput] Raw input received:', inputString);
    
    // Handle null/undefined input
    if (inputString == null) {
      return { success: true, data: {}, originalInput };
    }
    
    // Handle object input (already parsed)
    if (typeof inputString === 'object') {
      return { success: true, data: inputString, originalInput };
    }
    
    // Convert to string if needed
    if (typeof inputString !== 'string') {
      inputString = String(inputString);
    }
    
    // Handle empty or whitespace-only input
    if (!inputString.trim()) {
      return { success: true, data: {}, originalInput };
    }
    
    // Try JSON parsing first
    try {
      const parsed = JSON.parse(inputString);
      console.log('[parseToolInput] Successfully parsed as JSON:', parsed);
      return { success: true, data: parsed, originalInput };
    } catch (parseError) {
      console.log('[parseToolInput] Initial JSON parse failed, attempting recovery');
      
      // Try to fix common JSON formatting issues
      try {
        let fixedInput = inputString.trim();
        
        // Fix unquoted keys: {search: "apples"} -> {"search": "apples"}
        fixedInput = fixedInput.replace(/(\w+):/g, '"$1":');
        
        // Fix single quotes: {'search': 'apples'} -> {"search": "apples"}
        fixedInput = fixedInput.replace(/'/g, '"');
        
        // Fix trailing commas: {"search": "apples",} -> {"search": "apples"}
        fixedInput = fixedInput.replace(/,(\s*[}\]])/g, '$1');
        
        const parsed = JSON.parse(fixedInput);
        console.log('[parseToolInput] Successfully parsed fixed JSON:', parsed);
        return { success: true, data: parsed, originalInput };
      } catch (fixError) {
        console.log('[parseToolInput] JSON fix attempts failed, trying fallback');
        
        // Use custom fallback handler if provided
        if (fallbackHandler) {
          try {
            const fallbackResult = fallbackHandler(inputString);
            console.log('[parseToolInput] Fallback handler succeeded:', fallbackResult);
            return { success: true, data: fallbackResult, originalInput };
          } catch (fallbackError) {
            console.log('[parseToolInput] Fallback handler failed:', fallbackError);
          }
        }
        
        // Default fallback: treat as search query if no braces
        if (!inputString.includes('{') && !inputString.includes('}')) {
          const fallbackData = { search: inputString.trim() };
          console.log('[parseToolInput] Using as search query:', fallbackData);
          return { success: true, data: fallbackData, originalInput };
        }
        
        // Last resort: return error
        return {
          success: false,
          data: {},
          error: `Unable to parse input: ${inputString.substring(0, 100)}...`,
          originalInput
        };
      }
    }
  } catch (error) {
    console.error('[parseToolInput] Unexpected error:', error);
    return {
      success: false,
      data: {},
      error: error instanceof Error ? error.message : 'Unknown parsing error',
      originalInput
    };
  }
}

/**
 * Specialized parser for catalog browsing inputs
 */
export function parseCatalogInput(inputString: any): ParsedToolInput {
  return parseToolInput(inputString, (input: string) => {
    // Handle natural language catalog queries
    const searchTerms = input.toLowerCase();
    
    // Check for category mentions
    const categories = ['produce', 'dairy', 'meat', 'seafood', 'bakery', 'pantry', 'beverages'];
    const foundCategory = categories.find(cat => searchTerms.includes(cat));
    
    if (foundCategory) {
      return { category: foundCategory };
    }
    
    // Extract search terms from common patterns
    const searchMatch = input.match(/(?:find|search|show|get|look for)\s+(.+)/i);
    if (searchMatch) {
      return { search: searchMatch[1].trim() };
    }
    
    // Default to treating entire input as search
    return { search: input.trim() };
  });
}

/**
 * Specialized parser for add-to-cart inputs
 */
export function parseCartInput(inputString: any): ParsedToolInput {
  return parseToolInput(inputString, (input: string) => {
    // Handle natural language cart commands like "add 5 bananas"
    const match = input.match(/(?:add\s+)?(\d+)?\s*([a-zA-Z\s]+?)(?:\s+to\s+cart)?$/i);
    
    if (match) {
      const quantity = match[1] ? parseInt(match[1]) : 1;
      const productCode = match[2].trim();
      return { productCode, quantity };
    }
    
    // Handle simple product names
    const productName = input.replace(/^add\s+/i, '').replace(/\s+to\s+cart$/i, '').trim();
    return { productCode: productName, quantity: 1 };
  });
}

/**
 * Format tool response consistently
 */
export function formatToolResponse(success: boolean, data?: any, error?: string): string {
  return JSON.stringify({
    success,
    ...(success ? data : { error }),
    timestamp: new Date().toISOString()
  });
}

/**
 * Log tool execution for debugging
 */
export function logToolExecution(toolName: string, input: any, result: any, duration?: number) {
  console.log(`[${toolName}] Execution summary:`, {
    input: typeof input === 'string' ? input.substring(0, 200) : input,
    success: result?.success ?? 'unknown',
    duration: duration ? `${duration}ms` : 'unknown',
    timestamp: new Date().toISOString()
  });
}