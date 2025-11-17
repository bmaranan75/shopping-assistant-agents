/**
 * Health Check Agent for LangGraph Server
 * 
 * This creates a dedicated agent/graph for health monitoring
 * that can be invoked like any other agent in the system.
 */

import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { performHealthCheck, simpleHealthCheck, fastMCPHealthCheck } from '../lib/health-check';

const HEALTH_SYSTEM_TEMPLATE = `You are the Health Monitoring Agent for the Shopping Assistant system.

Your role is to monitor and report on the health status of all agents and system dependencies.

Available health check tools:
1. **Simple Health Check** - Basic "ok" status for quick monitoring
2. **Comprehensive Health Check** - Detailed health information for all agents and dependencies  
3. **FastMCP Health Check** - Specialized health check format for FastMCP integration

When users ask about system health, service status, monitoring, or if any agents are working properly, use the appropriate health check tool.

Always provide clear, actionable information about system status and any issues found.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 30000, // Shorter timeout for health checks
});

// Simple health check tool
const simpleHealthTool = tool(
  async () => {
    const result = simpleHealthCheck();
    return JSON.stringify(result, null, 2);
  },
  {
    name: "simple_health_check",
    description: "Perform a simple health check returning basic ok/timestamp status",
    schema: z.object({}),
  }
);

// Comprehensive health check tool
const comprehensiveHealthTool = tool(
  async () => {
    const result = await performHealthCheck();
    return JSON.stringify(result, null, 2);
  },
  {
    name: "comprehensive_health_check", 
    description: "Perform a comprehensive health check of all agents, dependencies, and system status",
    schema: z.object({}),
  }
);

// FastMCP health check tool
const fastMCPHealthTool = tool(
  async () => {
    const result = await fastMCPHealthCheck();
    return JSON.stringify(result, null, 2);
  },
  {
    name: "fastmcp_health_check",
    description: "Perform a FastMCP-compatible health check with standardized format for integration monitoring",
    schema: z.object({}),
  }
);

// Agent status tool
const agentStatusTool = tool(
  async ({ agentName }: { agentName: string }) => {
    const fullHealth = await performHealthCheck();
    const agent = fullHealth.agents.find(a => a.name === agentName);
    
    if (!agent) {
      return `Agent '${agentName}' not found. Available agents: ${fullHealth.agents.map(a => a.name).join(', ')}`;
    }
    
    return JSON.stringify({
      agent: agent.name,
      status: agent.status,
      lastCheck: new Date(agent.lastCheck).toISOString(),
      dependencies: agent.dependencies,
      errors: agent.errors,
    }, null, 2);
  },
  {
    name: "get_agent_status",
    description: "Get detailed status information for a specific agent",
    schema: z.object({
      agentName: z.string().describe("Name of the agent to check (supervisor, catalog, cart_and_checkout, deals, payment)")
    }),
  }
);

// System metrics tool
const systemMetricsTool = tool(
  async () => {
    const fullHealth = await performHealthCheck();
    
    return JSON.stringify({
      uptime: `${Math.floor(fullHealth.uptime / 60)} minutes`,
      memory: fullHealth.dependencies.environment.memory,
      nodeVersion: fullHealth.dependencies.environment.nodeVersion,
      platform: fullHealth.dependencies.environment.platform,
      timestamp: new Date(fullHealth.timestamp).toISOString(),
      overallStatus: fullHealth.status,
      agentSummary: {
        total: fullHealth.agents.length,
        healthy: fullHealth.agents.filter(a => a.status === 'healthy').length,
        degraded: fullHealth.agents.filter(a => a.status === 'degraded').length,
        unhealthy: fullHealth.agents.filter(a => a.status === 'unhealthy').length,
      }
    }, null, 2);
  },
  {
    name: "get_system_metrics",
    description: "Get system performance metrics and summary statistics",
    schema: z.object({}),
  }
);

// Create the health check agent graph
const healthCheckTools = [
  simpleHealthTool,
  comprehensiveHealthTool,
  fastMCPHealthTool,
  agentStatusTool,
  systemMetricsTool,
];

export const healthGraph = createReactAgent({
  llm,
  tools: new ToolNode(healthCheckTools, { handleToolErrors: true }),
  prompt: HEALTH_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});

// Health check agent class for programmatic usage
export class HealthCheckAgent {
  private userId: string;

  constructor(userId: string = 'health-monitor') {
    this.userId = userId;
  }

  async simpleCheck() {
    return simpleHealthCheck();
  }

  async fullCheck() {
    return await performHealthCheck();
  }

  async fastMCPCheck() {
    return await fastMCPHealthCheck();
  }

  async agentStatus(agentName: string) {
    const fullHealth = await performHealthCheck();
    return fullHealth.agents.find(a => a.name === agentName);
  }

  async chat(message: string, conversationId?: string) {
    const threadId = conversationId || `health-${this.userId}-${Date.now()}`;
    
    const result = await healthGraph.invoke(
      { messages: [{ type: 'human', content: message }] },
      { configurable: { thread_id: threadId } }
    );

    const lastMessage = result.messages[result.messages.length - 1];
    return lastMessage?.content || 'No response from health agent';
  }
}

// Factory function for backward compatibility
export const createHealthCheckAgent = (userId?: string) => {
  return new HealthCheckAgent(userId);
};