/**
 * Health check module for FastMCP integration
 * 
 * Provides comprehensive health information about all shopping assistant agents
 * and their dependencies for monitoring and debugging purposes.
 */

import { ChatOpenAI } from '@langchain/openai';

export interface AgentHealthStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  version?: string;
  dependencies?: string[];
  errors?: string[];
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  version: string;
  uptime: number;
  agents: AgentHealthStatus[];
  dependencies: {
    openai: {
      status: 'healthy' | 'unhealthy';
      configured: boolean;
      error?: string;
    };
    environment: {
      nodeVersion: string;
      platform: string;
      memory: {
        used: number;
        total: number;
      };
    };
  };
  fastMCP: {
    compatible: boolean;
    version: string;
    endpoints: string[];
  };
}

const startTime = Date.now();

/**
 * Check if OpenAI API is configured and accessible
 */
async function checkOpenAI(): Promise<{ status: 'healthy' | 'unhealthy'; configured: boolean; error?: string }> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { status: 'unhealthy', configured: false, error: 'OPENAI_API_KEY not configured' };
    }

    // Test with a minimal call to check if API key is valid
    const llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 1,
      timeout: 5000, // 5 second timeout for health checks
    });

    await llm.invoke('test');
    return { status: 'healthy', configured: true };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      configured: true, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check individual agent health
 */
async function checkAgentHealth(agentName: string): Promise<AgentHealthStatus> {
  const baseStatus: AgentHealthStatus = {
    name: agentName,
    status: 'healthy',
    lastCheck: Date.now(),
    dependencies: ['openai'],
  };

  try {
    // Import the agent graph dynamically to test if it's loadable
    switch (agentName) {
      case 'supervisor': {
        const { supervisorGraph } = await import('../agents/supervisor');
        if (!supervisorGraph) throw new Error('supervisorGraph not exported');
        break;
      }
      case 'catalog': {
        const { catalogGraph } = await import('../agents/catalog-agent');
        if (!catalogGraph) throw new Error('catalogGraph not exported');
        break;
      }
      case 'cart_and_checkout': {
        const { cartAndCheckoutGraph } = await import('../agents/cart-and-checkout-agent');
        if (!cartAndCheckoutGraph) throw new Error('cartAndCheckoutGraph not exported');
        break;
      }
      case 'deals': {
        const { dealsGraph } = await import('../agents/deals-agent');
        if (!dealsGraph) throw new Error('dealsGraph not exported');
        break;
      }
      case 'payment': {
        const { paymentGraph } = await import('../agents/payment-agent');
        if (!paymentGraph) throw new Error('paymentGraph not exported');
        break;
      }
      default:
        throw new Error(`Unknown agent: ${agentName}`);
    }

    return baseStatus;
  } catch (error) {
    return {
      ...baseStatus,
      status: 'unhealthy',
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Get system memory usage
 */
function getMemoryUsage() {
  const memUsage = process.memoryUsage();
  return {
    used: Math.round(memUsage.rss / 1024 / 1024), // MB
    total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
  };
}

/**
 * Main health check function
 */
export async function performHealthCheck(): Promise<HealthCheckResponse> {
  const timestamp = Date.now();
  const uptime = timestamp - startTime;

  // Check all agents
  const agentNames = ['supervisor', 'catalog', 'cart_and_checkout', 'deals', 'payment'];
  const agentChecks = await Promise.all(
    agentNames.map(name => checkAgentHealth(name))
  );

  // Check OpenAI dependency
  const openaiCheck = await checkOpenAI();

  // Determine overall health status
  const hasUnhealthyAgents = agentChecks.some(agent => agent.status === 'unhealthy');
  const hasOpenAIIssue = openaiCheck.status === 'unhealthy';
  
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (hasUnhealthyAgents || hasOpenAIIssue) {
    overallStatus = 'unhealthy';
  } else if (agentChecks.some(agent => agent.status === 'degraded')) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  return {
    status: overallStatus,
    timestamp,
    version: '1.0.0', // This should match your package.json version
    uptime: Math.floor(uptime / 1000), // Convert to seconds
    agents: agentChecks,
    dependencies: {
      openai: openaiCheck,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: getMemoryUsage(),
      },
    },
    fastMCP: {
      compatible: true,
      version: '1.0.0',
      endpoints: [
        '/health',
        '/ok', // Legacy endpoint
        '/supervisor',
        '/catalog',
        '/cart_and_checkout', 
        '/deals',
        '/payment'
      ],
    },
  };
}

/**
 * Simple health check for legacy compatibility
 */
export function simpleHealthCheck(): { ok: boolean; timestamp: number } {
  return {
    ok: true,
    timestamp: Date.now(),
  };
}

/**
 * FastMCP compatible health check endpoint
 */
export async function fastMCPHealthCheck(): Promise<{
  status: string;
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  dependencies: Record<string, string>;
}> {
  const fullCheck = await performHealthCheck();
  
  const dependencies: Record<string, string> = {
    openai: fullCheck.dependencies.openai.status,
    node: 'healthy', // If we're running, Node is healthy
  };

  // Add agent statuses to dependencies
  fullCheck.agents.forEach(agent => {
    dependencies[`agent_${agent.name}`] = agent.status;
  });

  return {
    status: fullCheck.status,
    service: 'shopping-assistant-agents',
    version: fullCheck.version,
    uptime: fullCheck.uptime,
    timestamp: new Date(fullCheck.timestamp).toISOString(),
    dependencies,
  };
}