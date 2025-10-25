import { RunnableConfig } from '@langchain/core/runnables';
import { Runnable } from '@langchain/core/runnables';

/**
 * Enhanced tracing configuration for Auth0 AI tools
 */
export const getTracingConfig = (userId?: string, operation?: string): Partial<RunnableConfig> => {
  const tags = ['auth0-ai', 'shopping-agent'];
  
  if (userId) {
    tags.push(`user:${userId}`);
  }
  
  if (operation) {
    tags.push(`operation:${operation}`);
  }

  return {
    tags,
    metadata: {
      userId,
      operation,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    }
  };
};

/**
 * Wrap a tool with enhanced tracing
 */
export const withTracing = <T extends Runnable>(tool: T, operation: string): T => {
  const originalInvoke = tool.invoke.bind(tool);
  
  tool.invoke = async (input: any, config?: RunnableConfig) => {
    const userId = config?.configurable?.user_id || config?.configurable?._credentials?.user?.sub;
    const tracingConfig = getTracingConfig(userId, operation);
    
    const enhancedConfig = {
      ...config,
      ...tracingConfig,
      tags: [...(config?.tags || []), ...(tracingConfig.tags || [])],
      metadata: {
        ...config?.metadata,
        ...tracingConfig.metadata,
        toolName: tool.constructor.name,
        inputType: typeof input,
        inputKeys: typeof input === 'object' ? Object.keys(input) : undefined
      }
    };

    console.log(`[Tracing] Starting ${operation} for user ${userId}`);
    
    try {
      const result = await originalInvoke(input, enhancedConfig);
      console.log(`[Tracing] Completed ${operation} for user ${userId}`);
      return result;
    } catch (error) {
      console.error(`[Tracing] Error in ${operation} for user ${userId}:`, error);
      throw error;
    }
  };

  return tool;
};

/**
 * Custom trace decorator for Auth0 authorization events
 */
export const traceAuthorizationEvent = (
  eventType: 'request' | 'approved' | 'denied' | 'timeout',
  userId?: string,
  metadata?: Record<string, any>
) => {
  const traceData = {
    eventType,
    userId,
    timestamp: new Date().toISOString(),
    metadata
  };

  console.log(`[Auth0 Trace] ${eventType.toUpperCase()}:`, traceData);
  
  // If LangSmith tracing is enabled, you can send custom events
  if (process.env.LANGCHAIN_TRACING_V2 === 'true') {
    // LangSmith will automatically capture console logs as part of the trace
    console.log(`[LangSmith Trace] Auth0 ${eventType}:`, JSON.stringify(traceData));
  }
};
